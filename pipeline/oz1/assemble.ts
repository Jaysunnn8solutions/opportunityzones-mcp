/**
 * The OZ 1.0 analysis table: one row per 2010 census tract.
 *
 * Each row carries the tract's 2018 status (designated, eligible control, or
 * neither), its pre-designation features, its outcome changes to 2020-2024, and
 * how cleanly its boundaries map to 2020 tracts.
 *
 * LEAKAGE RULE. Governors nominated in March-April 2018. A feature may only use
 * data that described the world before then AND could not have been revised
 * using what came after:
 *   - ACS 2012-2016 (released 2017-12-07) and 2006-2010: allowed.
 *   - ACS 2013-2017 (released 2018-12-06): NOT a feature, only a sensitivity
 *     baseline for outcomes.
 *   - LODES 2012 and 2015 jobs: allowed. LODES 8 re-tabulated them later on 2020
 *     blocks, but they are administrative counts of those years' jobs, not
 *     estimates that absorb later information.
 *   - FHFA HPI before 2018: NOT a feature. A repeat-sales index is re-estimated
 *     as new sales arrive, so today's 2012-2016 change is partly built from sales
 *     pairs that close after designation. It is used only as a pre-trend
 *     diagnostic, and the report says so.
 *
 * Dollars are put in real terms with annual CPI-U (see pipeline/cpi.ts).
 * Top-coded or bottom-coded medians make a change uncomputable, so they are
 * nulled rather than treated as exact.
 *
 * Output: data/oz1/analysis.csv
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { CLEAN_DIR, DATA_DIR } from "../config";
import { log } from "../lib/http";
import { num, readCsv, writeCsv, type Cell } from "../lib/table";
import {
  buildCrosswalk,
  countTo2010,
  intensiveTo2010,
  type Crosswalk,
  type Pair,
} from "../../lib/analysis/crosswalk";
import { LODES_YEARS } from "../crosswalk/blocks";

export const OUT_DIR = path.join(DATA_DIR, "oz1");

type Row = Record<string, number | null>;

function need(file: string): string {
  const p = path.join(CLEAN_DIR, file);
  if (!existsSync(p)) throw new Error(`Missing ${file}; run the stage that writes it first`);
  return p;
}

/**
 * Load a clean CSV into rows keyed by its first column, numbers parsed.
 * A repeated key is an error, never "last row wins": that is exactly how one
 * tract's data once got silently replaced by another's.
 */
function keyed(file: string): Map<string, Row> {
  const t = readCsv(need(file));
  const out = new Map<string, Row>();
  for (const r of t.rows) {
    if (out.has(r[0])) throw new Error(`${file}: key ${r[0]} appears twice`);
    const row: Row = {};
    for (let i = 1; i < t.header.length; i++) row[t.header[i]] = num(r[i]);
    out.set(r[0], row);
  }
  return out;
}

/** Top and bottom codes by ACS vintage, where a median stops being a number. */
function censored(variable: "homeValue" | "rent" | "hhIncome" | "familyIncome", vintage: number, v: number | null): boolean {
  if (v == null) return false;
  switch (variable) {
    case "homeValue":
      return v <= 9_999 || v >= (vintage <= 2014 ? 1_000_001 : 2_000_001);
    case "rent":
      return v <= 99 || v >= (vintage <= 2014 ? 2_001 : 3_501);
    case "hhIncome":
    case "familyIncome":
      return v <= 2_499 || v >= 250_001;
  }
}

function realLogChange(
  before: number | null,
  after: number | null,
  cpiBefore: number,
  cpiAfter: number
): number | null {
  if (before == null || after == null || before <= 0 || after <= 0) return null;
  return Math.log(after) - Math.log(before) - Math.log(cpiAfter / cpiBefore);
}

function logChange(before: number | null, after: number | null): number | null {
  if (before == null || after == null || before <= 0 || after <= 0) return null;
  return Math.log(after) - Math.log(before);
}

function ratio(n: number | null, d: number | null): number | null {
  if (n == null || d == null || d <= 0) return null;
  return n / d;
}

function diff(a: number | null, b: number | null): number | null {
  return a == null || b == null ? null : b - a;
}

/** Coefficient of variation from a 90% margin of error. */
function cv(est: number | null, moe: number | null): number | null {
  if (est == null || moe == null || est <= 0 || moe < 0) return null;
  return moe / 1.645 / est;
}

/**
 * Re-key Connecticut rows from planning-region GEOIDs (used by the 2020-2024
 * ACS, FHFA and Treasury) to 2020 Census GEOIDs (used by the crosswalk). See
 * pipeline/crosswalk/connecticut.ts. Two planning-region tracts can share one
 * 2020 tract (the Long Island Sound water tract was split), so collisions are
 * merged, not overwritten. An unmapped Connecticut code is an error.
 */
function harmonizeCt<T>(
  src: Map<string, T>,
  ct: ReadonlyMap<string, string>,
  known2020: ReadonlySet<string>,
  merge: (a: T, b: T) => T,
  label: string
): Map<string, T> {
  const out = new Map<string, T>();
  let remapped = 0;
  for (const [g, v] of src) {
    let key = g;
    if (g.startsWith("09") && !known2020.has(g)) {
      const mapped = ct.get(g);
      if (!mapped) throw new Error(`${label}: Connecticut tract ${g} has no 2020 Census equivalent`);
      key = mapped;
      remapped++;
    }
    const prev = out.get(key);
    out.set(key, prev === undefined ? v : merge(prev, v));
  }
  log(`assemble: ${label}: ${remapped} Connecticut tracts re-keyed to 2020 Census GEOIDs`);
  return out;
}

const MEDIAN_FIELDS = new Set(["homeValue", "homeValueMoe", "rent", "rentMoe", "hhIncome", "hhIncomeMoe", "familyIncome", "yearBuilt"]);

/** Merge two ACS rows that land on one 2020 tract: sum counts, weight medians by people. */
function mergeAcs(a: Row, b: Row): Row {
  const out: Row = {};
  const wa = a.population ?? 0;
  const wb = b.population ?? 0;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[k] ?? null;
    const y = b[k] ?? null;
    if (MEDIAN_FIELDS.has(k)) {
      out[k] = x == null ? y : y == null ? x : wa + wb > 0 ? (x * wa + y * wb) / (wa + wb) : null;
    } else {
      out[k] = x == null && y == null ? null : (x ?? 0) + (y ?? 0);
    }
  }
  return out;
}

/** Index levels cannot be summed; keep whichever exists, else their mean. */
function mergeLevels(a: Row, b: Row): Row {
  const out: Row = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[k] ?? null;
    const y = b[k] ?? null;
    out[k] = x == null ? y : y == null ? x : (x + y) / 2;
  }
  return out;
}

export type Group =
  | "designated_lic"
  | "designated_contiguous"
  | "eligible_lic_control"
  | "eligible_contiguous_not_designated"
  | "not_eligible";

export async function assemble(): Promise<void> {
  // --- inputs -------------------------------------------------------------
  const oz1 = readCsv(need("oz1_tracts.csv"));
  const status = new Map<string, Record<string, string>>();
  for (const r of oz1.rows) {
    const rec: Record<string, string> = {};
    oz1.header.forEach((h, i) => (rec[h] = r[i]));
    status.set(rec.geoid10, rec);
  }

  const acs10 = keyed("acs_2010.csv");
  const acs16 = keyed("acs_2016.csv");
  const acs17 = keyed("acs_2017.csv");

  // 2020-tract sources arrive with Connecticut on planning-region codes; the
  // crosswalk uses 2020 Census codes. Harmonise before anything joins.
  const ctMap = new Map(readCsv(need("ct_tracts.csv")).rows.map((r) => [r[0], r[1]]));
  const known2020 = new Set(readCsv(need("xwalk_t10_t20.csv")).rows.map((r) => r[1]));
  const acs24 = harmonizeCt(keyed("acs_2024.csv"), ctMap, known2020, mergeAcs, "ACS 2020-24");
  const hpi = harmonizeCt(keyed("fhfa_hpi.csv"), ctMap, known2020, mergeLevels, "FHFA HPI");
  const land10 = keyed("tract2010_land.csv");
  const area10 = keyed("tract2010_area.csv");
  const cpiRows = keyed("cpi_u.csv");
  const cpi = (y: number) => {
    const v = cpiRows.get(String(y))?.cpi_u;
    if (v == null) throw new Error(`No CPI-U for ${y}`);
    return v;
  };

  const oz2 = readCsv(need("oz2_eligible.csv"));
  const oz2Raw = new Map<string, number>();
  {
    const ig = oz2.col("geoid20");
    const ie = oz2.col("eligible");
    for (const r of oz2.rows) oz2Raw.set(r[ig], r[ie] === "1" ? 1 : 0);
  }
  const oz2Eligible = harmonizeCt(oz2Raw, ctMap, known2020, (a, b) => Math.max(a, b), "Treasury OZ 2.0");

  const adjT = readCsv(need("tract2010_adjacency.csv"));
  const neighbours = new Map<string, string[]>();
  for (const [a, b] of adjT.rows) {
    const list = neighbours.get(a);
    if (list) list.push(b);
    else neighbours.set(a, [b]);
  }

  const lodesCov = readCsv(need("lodes_coverage.csv"));
  const lodesMissing = new Set<string>(); // "usps|year"
  const stateOfUsps = new Map<string, string>();
  {
    const iF = lodesCov.col("state_fips");
    const iU = lodesCov.col("usps");
    const iY = lodesCov.col("year");
    const iA = lodesCov.col("available");
    for (const r of lodesCov.rows) {
      stateOfUsps.set(r[iF], r[iU]);
      if (r[iA] !== "1") lodesMissing.add(`${r[iF]}|${r[iY]}`);
    }
  }

  // --- crosswalk ----------------------------------------------------------
  const xt = readCsv(need("xwalk_t10_t20.csv"));
  const pairs: Pair[] = [];
  const jobsByPair: number[][] = [];
  {
    const i10 = xt.col("geoid10");
    const i20 = xt.col("geoid20");
    const iPop = xt.col("pop20");
    const iHu = xt.col("hu20");
    const iLand = xt.col("land_m2");
    const iJobs = LODES_YEARS.map((y) => xt.col(`jobs_${y}`));
    for (const r of xt.rows) {
      pairs.push({
        geoid10: r[i10],
        geoid20: r[i20],
        pop: Number(r[iPop]) || 0,
        hu: Number(r[iHu]) || 0,
        land: Number(r[iLand]) || 0,
      });
      jobsByPair.push(iJobs.map((i) => Number(r[i]) || 0));
    }
  }
  const xw: Crosswalk = buildCrosswalk(pairs);
  log(`assemble: crosswalk of ${pairs.length.toLocaleString("en-US")} pairs over ${xw.to10.size.toLocaleString("en-US")} 2010 tracts`);

  // Jobs per 2010 tract straight from the block allocation, no second
  // apportionment step: the pair table already split them block by block.
  const jobs10 = new Map<string, number[]>();
  pairs.forEach((p, i) => {
    const acc = jobs10.get(p.geoid10) ?? LODES_YEARS.map(() => 0);
    jobsByPair[i].forEach((v, k) => (acc[k] += v));
    jobs10.set(p.geoid10, acc);
  });
  const pop20by10 = new Map<string, number>();
  for (const p of pairs) pop20by10.set(p.geoid10, (pop20by10.get(p.geoid10) ?? 0) + p.pop);

  // Completeness: every populated 2020 tract should appear in the 2020-2024
  // ACS. A conservation check on the ACS file's own total cannot see a tract
  // the ACS never published, so it is checked against the 2020 Census instead.
  // (Census stopped publishing 14 Suffolk County, NY tracts from the 2019-2023
  // release on; they are in 2017-21 and 2018-22.)
  const pop20by20 = new Map<string, number>();
  for (const p of pairs) pop20by20.set(p.geoid20, (pop20by20.get(p.geoid20) ?? 0) + p.pop);
  const acsMissing = [...pop20by20]
    .filter(([g20, pop]) => pop > 0 && !acs24.has(g20))
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
  writeCsv(
    path.join(OUT_DIR, "acs2024_missing_tracts.csv"),
    ["geoid20", "pop2020_census"],
    acsMissing.map(([g, p]) => [g, Math.round(p)])
  );
  log(
    `assemble: ${acsMissing.length} populated 2020 tracts (${Math.round(acsMissing.reduce((s, [, p]) => s + p, 0)).toLocaleString("en-US")} people) absent from the 2020-24 ACS`
  );

  // 2020-tract series to convert.
  const col24 = (name: string) => new Map([...acs24].map(([g, r]) => [g, r[name] ?? null]));
  const pop24 = col24("population");
  const hu24 = col24("housingUnits");
  const povU24 = col24("povertyUniverse");
  const povB24 = col24("povertyBelow");
  const occU24 = col24("occupancyUniverse");
  const vac24 = col24("vacant");
  const tenU24 = col24("tenureUniverse");
  const own24 = col24("ownerOccupied");
  const censor24 = (name: "homeValue" | "rent" | "hhIncome", map: Map<string, number | null>) =>
    new Map([...map].map(([g, v]) => [g, censored(name, 2024, v) ? null : v]));
  const home24 = censor24("homeValue", col24("homeValue"));
  const rent24 = censor24("rent", col24("rent"));
  const inc24 = censor24("hhIncome", col24("hhIncome"));
  const homeCv24 = new Map([...acs24].map(([g, r]) => [g, cv(r.homeValue, r.homeValueMoe)]));

  // Each median describes a different set of homes, so it is weighted by that
  // set when 2020 pieces are combined: home value by owner-occupied units, rent
  // by renter-occupied units, household income by households. Expressed as a
  // share of housing units because the pair table carries housing units.
  const perUnit = (num: (r: Row) => number | null) =>
    new Map(
      [...acs24].map(([g, r]) => {
        const n = num(r);
        const hu = r.housingUnits;
        return [g, n == null || hu == null || hu <= 0 ? null : n / hu];
      })
    );
  const ownerPerUnit = perUnit((r) => r.ownerOccupied);
  const renterPerUnit = perUnit((r) =>
    r.tenureUniverse == null || r.ownerOccupied == null ? null : r.tenureUniverse - r.ownerOccupied
  );
  const householdsPerUnit = perUnit((r) => r.tenureUniverse);

  // HPI changes on 2020 tracts, then converted as intensive values.
  const hpiLog = (a: number, b: number) =>
    new Map([...hpi].map(([g, r]) => [g, logChange(r[`hpi_${a}`] ?? null, r[`hpi_${b}`] ?? null)]));
  const hpi17to24 = hpiLog(2017, 2024);
  // FHFA's tract coverage falls ~25% between 2021 and 2023-24 as recent years
  // accumulate too few repeat sales, so the 2024 endpoint selects tracts on
  // post-designation sales volume. 2022 is a less-selected endpoint.
  const hpi17to22 = hpiLog(2017, 2022);
  const hpi13to17 = hpiLog(2013, 2017);
  const hpi12to16 = hpiLog(2012, 2016);
  // Aligned with the ACS outcome's midpoints (2012-16 -> 2020-24 is centred on
  // 2014 -> 2022), so ACS and FHFA can be compared over the same span.
  const hpi14to22 = hpiLog(2014, 2022);
  const hpiInflation = (a: number, b: number) => Math.log(cpi(b) / cpi(a));

  // OZ 2.0 eligibility share: fraction of the 2010 tract's 2020 population
  // living in 2020 tracts that are eligible for the 2027 round. A 2020 tract
  // missing from Treasury's file is unknown, not ineligible — defaulting it to
  // 0 is exactly the silent failure that hid Connecticut.
  const oz2Share = new Map<string, number | null>();
  let oz2Unknown = 0;
  for (const [g10, group] of xw.to10) {
    const tot = group.reduce((s, p) => s + p.pop, 0);
    if (tot <= 0) {
      oz2Share.set(g10, null);
      continue;
    }
    if (group.some((p) => p.pop > 0 && !oz2Eligible.has(p.geoid20))) {
      oz2Share.set(g10, null);
      oz2Unknown++;
      continue;
    }
    oz2Share.set(g10, group.reduce((s, p) => s + p.pop * oz2Eligible.get(p.geoid20)!, 0) / tot);
  }
  if (oz2Unknown > 0) log(`assemble: ${oz2Unknown} 2010 tracts touch a populated 2020 tract absent from Treasury's OZ 2.0 file`);

  // --- rows ---------------------------------------------------------------
  const universe = new Set<string>([...acs10.keys(), ...acs16.keys(), ...status.keys()]);
  const header: string[] = [];
  const rows: Cell[][] = [];
  const add = (row: Record<string, Cell>) => {
    if (header.length === 0) header.push(...Object.keys(row));
    rows.push(header.map((h) => row[h]));
  };

  let missing2016 = 0;
  for (const g of [...universe].sort()) {
    const st = status.get(g);
    const a10 = acs10.get(g) ?? null;
    const a16 = acs16.get(g) ?? null;
    const a17 = acs17.get(g) ?? null;
    if (!a16) missing2016++;
    const q = xw.quality10.get(g);
    const stateFips = g.slice(0, 2);

    const designated = st?.designated === "1";
    const lic = st?.lic === "1";
    const group: Group = designated
      ? st?.designated_type === "lic"
        ? "designated_lic"
        : "designated_contiguous"
      : lic
        ? "eligible_lic_control"
        : st
          ? "eligible_contiguous_not_designated"
          : "not_eligible";

    const nbrs = neighbours.get(g) ?? [];
    const designatedNeighbours = nbrs.filter((n) => status.get(n)?.designated === "1").length;

    // Pre-period (2012-2016) levels.
    const home16 = a16 && !censored("homeValue", 2016, a16.homeValue) ? a16.homeValue : null;
    const rent16 = a16 && !censored("rent", 2016, a16.rent) ? a16.rent : null;
    const inc16 = a16 && !censored("hhIncome", 2016, a16.hhIncome) ? a16.hhIncome : null;
    const fam16 = a16 && !censored("familyIncome", 2016, a16.familyIncome) ? a16.familyIncome : null;
    const home10 = a10 && !censored("homeValue", 2010, a10.homeValue) ? a10.homeValue : null;
    const rent10 = a10 && !censored("rent", 2010, a10.rent) ? a10.rent : null;
    const inc10 = a10 && !censored("hhIncome", 2010, a10.hhIncome) ? a10.hhIncome : null;
    const home17 = a17 && !censored("homeValue", 2017, a17.homeValue) ? a17.homeValue : null;
    const rent17 = a17 && !censored("rent", 2017, a17.rent) ? a17.rent : null;
    const inc17 = a17 && !censored("hhIncome", 2017, a17.hhIncome) ? a17.hhIncome : null;

    // Official 2010 land area where the cartographic file has the tract; the
    // relationship file's 2020-vintage land otherwise.
    const landKm2 =
      area10.get(g)?.land_km2 ??
      ((land10.get(g)?.land_m2 ?? null) != null ? land10.get(g)!.land_m2! / 1e6 : null);
    const pov16 = ratio(a16?.povertyBelow ?? null, a16?.povertyUniverse ?? null);
    const pov10 = ratio(a10?.povertyBelow ?? null, a10?.povertyUniverse ?? null);
    const vac16 = ratio(a16?.vacant ?? null, a16?.occupancyUniverse ?? null);
    const vac10 = ratio(a10?.vacant ?? null, a10?.occupancyUniverse ?? null);
    const own16 = ratio(a16?.ownerOccupied ?? null, a16?.tenureUniverse ?? null);
    const ba16 = ratio(
      a16 && [a16.eduBachelors, a16.eduMasters, a16.eduProfessional, a16.eduDoctorate].every((x) => x != null)
        ? a16.eduBachelors! + a16.eduMasters! + a16.eduProfessional! + a16.eduDoctorate!
        : null,
      a16?.eduUniverse ?? null
    );
    const unemp16 = ratio(a16?.unemployed ?? null, a16?.laborForce ?? null);

    // Post-period (2020-2024) on 2010 boundaries.
    const hasXw = xw.to10.has(g);
    const popPost = hasXw ? countTo2010(xw, g, pop24, "pop") : null;
    const huPost = hasXw ? countTo2010(xw, g, hu24, "hu") : null;
    const povPost = hasXw
      ? ratio(countTo2010(xw, g, povB24, "pop"), countTo2010(xw, g, povU24, "pop"))
      : null;
    const vacPost = hasXw ? ratio(countTo2010(xw, g, vac24, "hu"), countTo2010(xw, g, occU24, "hu")) : null;
    const ownPost = hasXw ? ratio(countTo2010(xw, g, own24, "hu"), countTo2010(xw, g, tenU24, "hu")) : null;
    const homePost = hasXw ? intensiveTo2010(xw, g, home24, "hu", 0.5, ownerPerUnit) : { value: null, coverage: 0 };
    const rentPost = hasXw ? intensiveTo2010(xw, g, rent24, "hu", 0.5, renterPerUnit) : { value: null, coverage: 0 };
    const incPost = hasXw ? intensiveTo2010(xw, g, inc24, "hu", 0.5, householdsPerUnit) : { value: null, coverage: 0 };
    const homeCvPost = hasXw ? intensiveTo2010(xw, g, homeCv24, "hu", 0.5, ownerPerUnit).value : null;
    const hpiPost = hasXw ? intensiveTo2010(xw, g, hpi17to24, "hu") : { value: null, coverage: 0 };
    const hpiPost22 = hasXw ? intensiveTo2010(xw, g, hpi17to22, "hu") : { value: null, coverage: 0 };
    const hpiPlacebo = hasXw ? intensiveTo2010(xw, g, hpi13to17, "hu") : { value: null, coverage: 0 };
    const hpiPre = hasXw ? intensiveTo2010(xw, g, hpi12to16, "hu") : { value: null, coverage: 0 };
    const hpiAligned = hasXw ? intensiveTo2010(xw, g, hpi14to22, "hu") : { value: null, coverage: 0 };

    const jobs = jobs10.get(g) ?? null;
    const jobsAt = (year: number): number | null => {
      if (!jobs || lodesMissing.has(`${stateFips}|${year}`) || stateFips === "72") return null;
      return jobs[LODES_YEARS.indexOf(year as (typeof LODES_YEARS)[number])];
    };
    const logJobs = (v: number | null) => (v == null ? null : Math.log1p(v));

    add({
      geoid10: g,
      state_fips: stateFips,
      county_fips: g.slice(0, 5),
      state_name: st?.state_name ?? null,
      group,
      designated: designated ? 1 : 0,
      designated_type: st?.designated_type || null,
      designated_acs: st?.designated_acs || null,
      eligible_lic: lic ? 1 : 0,
      eligible_contiguous: st?.contiguous === "1" ? 1 : 0,
      eligible_basis: st?.basis || null,
      renumbered_to: st?.renumbered_to || null,
      designated_neighbours: designatedNeighbours,
      borders_designated: designatedNeighbours > 0 ? 1 : 0,

      xw_relationship: q?.relationship ?? null,
      xw_purity: q?.purity ?? null,
      xw_concentration: q?.concentration ?? null,
      xw_parts: q?.parts ?? null,
      oz2_eligible_share: oz2Share.get(g) ?? null,

      // Features: known at designation.
      land_km2: landKm2,
      pop_2016: a16?.population ?? null,
      log_density_2016: landKm2 && a16?.population ? Math.log((a16.population + 1) / landKm2) : null,
      hu_2016: a16?.housingUnits ?? null,
      median_home_value_2016: home16,
      home_value_cv_2016: cv(a16?.homeValue ?? null, a16?.homeValueMoe ?? null),
      median_rent_2016: rent16,
      median_hh_income_2016: inc16,
      median_family_income_2016: fam16,
      poverty_rate_2016: pov16,
      vacancy_rate_2016: vac16,
      owner_share_2016: own16,
      ba_plus_share_2016: ba16,
      unemployment_rate_2016: unemp16,
      // "1939 or earlier" is reported as 1939, a bottom code, not a year.
      median_year_built_2016: a16?.yearBuilt != null && a16.yearBuilt > 1939 ? a16.yearBuilt : null,
      jobs_2012: jobsAt(2012),
      jobs_2015: jobsAt(2015),
      log_jobs_2015: logJobs(jobsAt(2015)),

      // Pre-trends, 2006-2010 to 2012-2016, real.
      pre_dlog_home_value: realLogChange(home10, home16, cpi(2010), cpi(2016)),
      pre_dlog_rent: realLogChange(rent10, rent16, cpi(2010), cpi(2016)),
      pre_dlog_hh_income: realLogChange(inc10, inc16, cpi(2010), cpi(2016)),
      pre_dlog_pop: logChange(a10?.population ?? null, a16?.population ?? null),
      pre_d_poverty: diff(pov10, pov16),
      pre_d_vacancy: diff(vac10, vac16),
      pre_dlog_jobs_2012_2015: (() => {
        const a = jobsAt(2012);
        const b = jobsAt(2015);
        return a == null || b == null ? null : Math.log1p(b) - Math.log1p(a);
      })(),

      // Diagnostics only (not features; see header).
      diag_hpi_real_dlog_2012_2016: hpiPre.value == null ? null : hpiPre.value - hpiInflation(2012, 2016),
      diag_hpi_real_dlog_2013_2017: hpiPlacebo.value == null ? null : hpiPlacebo.value - hpiInflation(2013, 2017),
      diag_hpi_real_dlog_2014_2022: hpiAligned.value == null ? null : hpiAligned.value - hpiInflation(2014, 2022),
      pop20_census: pop20by10.get(g) ?? null,

      // Outcomes: 2012-2016 to 2020-2024, real.
      post_pop_2024: popPost,
      post_hu_2024: huPost,
      post_median_home_value_2024: homePost.value,
      post_home_value_cv_2024: homeCvPost,
      post_median_rent_2024: rentPost.value,
      post_median_hh_income_2024: incPost.value,
      out_dlog_home_value: realLogChange(home16, homePost.value, cpi(2016), cpi(2024)),
      out_dlog_rent: realLogChange(rent16, rentPost.value, cpi(2016), cpi(2024)),
      out_dlog_hh_income: realLogChange(inc16, incPost.value, cpi(2016), cpi(2024)),
      out_dlog_pop: logChange(a16?.population ?? null, popPost),
      out_dlog_housing_units: logChange(a16?.housingUnits ?? null, huPost),
      out_d_poverty: diff(pov16, povPost),
      out_d_vacancy: diff(vac16, vacPost),
      out_d_owner_share: diff(own16, ownPost),
      out_hpi_real_dlog_2017_2024: hpiPost.value == null ? null : hpiPost.value - hpiInflation(2017, 2024),
      out_hpi_real_dlog_2017_2022: hpiPost22.value == null ? null : hpiPost22.value - hpiInflation(2017, 2022),
      out_hpi_coverage: hpiPost.coverage,
      out_dlog_jobs_2017_2023: (() => {
        const a = jobsAt(2017);
        const b = jobsAt(2023);
        return a == null || b == null ? null : Math.log1p(b) - Math.log1p(a);
      })(),
      out_dlog_jobs_2017_2021: (() => {
        const a = jobsAt(2017);
        const b = jobsAt(2021);
        return a == null || b == null ? null : Math.log1p(b) - Math.log1p(a);
      })(),

      // Sensitivity: 2013-2017 baseline (released after designation, so an
      // outcome baseline only, never a feature).
      sens1317_dlog_home_value: realLogChange(home17, homePost.value, cpi(2017), cpi(2024)),
      sens1317_dlog_rent: realLogChange(rent17, rentPost.value, cpi(2017), cpi(2024)),
      sens1317_dlog_hh_income: realLogChange(inc17, incPost.value, cpi(2017), cpi(2024)),
    });
  }

  const out = path.join(OUT_DIR, "analysis.csv");
  const n = writeCsv(out, header, rows);
  log(`assemble: ${n.toLocaleString("en-US")} rows x ${header.length} columns -> ${path.relative(process.cwd(), out)}`);
  log(`assemble: ${missing2016} tracts absent from the 2012-2016 ACS`);
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  assemble().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
