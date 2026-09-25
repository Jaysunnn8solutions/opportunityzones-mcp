/**
 * OZ 1.0 first-pass comparison and Phase 1 report.
 *
 * Designated low-income tracts versus eligible low-income tracts that were NOT
 * designated, matched within state on pre-designation levels and trends. The
 * question is descriptive: after designation, how did zones change relative to
 * places that looked like them beforehand and could have been chosen but were
 * not? It is not a causal estimate — governors selected on things the data does
 * not see — and the report says so next to the numbers.
 *
 * Every estimate is recomputed on each run. Figures taken from published sources
 * (the 2020 Census count, the Urban Institute's tract means, CPI-U) are labelled
 * as references, and every check's text depends on whether it passed.
 *
 * Output:
 *   data/oz1/results.json   every estimate, balance row and check, machine-readable
 *   data/oz1/REPORT.md      the Phase 1 report
 */

import { writeFileSync } from "node:fs";
import path from "node:path";
import { CLEAN_DIR } from "../config";
import { log } from "../lib/http";
import { num, readCsv } from "../lib/table";
import { OUT_DIR } from "./assemble";
import {
  balance,
  estimateEffect,
  nearestNeighbourMatch,
  OUTCOME_MODELS,
  type BalanceRow,
  type Effect,
  type MatchResult,
  type OutcomeModel,
  type Unit,
} from "../../lib/analysis/matching";

const ISLAND_AREAS = new Set(["60", "66", "69", "78"]);
const PUERTO_RICO = "72";
const REPS = 1000;

type Rec = Record<string, string>;
type Covariate = { name: string; label: string; from: (r: Rec) => number | null };

function logOf(s: string | undefined, plus = 0): number | null {
  const v = num(s);
  return v == null || v + plus <= 0 ? null : Math.log(v + plus);
}

const COVARIATES: Covariate[] = [
  { name: "log_home_value", label: "log median home value, 2012-16", from: (r) => logOf(r.median_home_value_2016) },
  { name: "log_rent", label: "log median gross rent, 2012-16", from: (r) => logOf(r.median_rent_2016) },
  { name: "log_hh_income", label: "log median household income, 2012-16", from: (r) => logOf(r.median_hh_income_2016) },
  { name: "poverty", label: "poverty rate, 2012-16", from: (r) => num(r.poverty_rate_2016) },
  { name: "vacancy", label: "vacancy rate, 2012-16", from: (r) => num(r.vacancy_rate_2016) },
  { name: "owner_share", label: "owner-occupied share, 2012-16", from: (r) => num(r.owner_share_2016) },
  { name: "log_pop", label: "log population, 2012-16", from: (r) => logOf(r.pop_2016, 1) },
  { name: "log_density", label: "log population density", from: (r) => num(r.log_density_2016) },
  { name: "ba_plus", label: "bachelor's degree or higher, 2012-16", from: (r) => num(r.ba_plus_share_2016) },
  { name: "pre_home_value", label: "real change in home value, 2006-10 to 2012-16", from: (r) => num(r.pre_dlog_home_value) },
  { name: "pre_rent", label: "real change in rent, 2006-10 to 2012-16", from: (r) => num(r.pre_dlog_rent) },
  { name: "pre_income", label: "real change in household income, 2006-10 to 2012-16", from: (r) => num(r.pre_dlog_hh_income) },
  { name: "pre_pop", label: "change in population, 2006-10 to 2012-16", from: (r) => num(r.pre_dlog_pop) },
  { name: "log_jobs", label: "log jobs located in tract, 2015", from: (r) => num(r.log_jobs_2015) },
  { name: "pre_jobs", label: "change in jobs, 2012 to 2015", from: (r) => num(r.pre_dlog_jobs_2012_2015) },
];
const HOME_COVARIATES = new Set(["log_home_value", "pre_home_value"]);

type Kind = "log" | "share";
const OUTCOMES: Array<{ col: string; label: string; kind: Kind; note?: string }> = [
  { col: "out_dlog_home_value", label: "Median home value (ACS, real)", kind: "log" },
  { col: "out_hpi_real_dlog_2017_2022", label: "Same-home prices 2017-22 (FHFA, real)", kind: "log", note: "repeat-sales tracts" },
  { col: "out_hpi_real_dlog_2017_2024", label: "Same-home prices 2017-24 (FHFA, real)", kind: "log", note: "repeat-sales tracts, selected on 2023-24 sales" },
  { col: "out_dlog_rent", label: "Median gross rent (real)", kind: "log" },
  { col: "out_dlog_hh_income", label: "Median household income (real)", kind: "log" },
  { col: "out_dlog_pop", label: "Population", kind: "log" },
  { col: "out_dlog_housing_units", label: "Housing units", kind: "log" },
  { col: "out_dlog_jobs_2017_2023", label: "Jobs located in tract, 2017-23 (LODES)", kind: "log" },
  { col: "out_d_poverty", label: "Poverty rate", kind: "share" },
  { col: "out_d_vacancy", label: "Vacancy rate", kind: "share" },
  { col: "out_d_owner_share", label: "Owner-occupied share", kind: "share" },
];

interface Spec {
  id: string;
  title: string;
  description: string;
  include: (r: Rec) => boolean;
  controlFilter?: (r: Rec) => boolean;
  caliper?: number;
  covariates: Covariate[];
}

const inScope = (r: Rec) => !ISLAND_AREAS.has(r.state_fips) && r.state_fips !== PUERTO_RICO;

const SPECS: Spec[] = [
  {
    id: "main",
    title: "Main",
    description: "All designated LIC tracts vs all eligible LIC tracts not designated, matched within state (k=5).",
    include: inScope,
    covariates: COVARIATES,
  },
  {
    id: "donut",
    title: "Donut (spillover check)",
    description:
      "Controls that border any designated tract are excluded, since effects can leak next door: Freedman, Kouchekinia and Neumark (NBER WP 34589, 2025) find about 83% of OZ job gains offset by losses in nearby low-income tracts.",
    include: inScope,
    controlFilter: (r) => r.borders_designated !== "1",
    covariates: COVARIATES,
  },
  {
    id: "clean_xwalk",
    title: "Unchanged boundaries only",
    description:
      "Treated and controls restricted to 2010 tracts identical to one 2020 tract, so no 2020-24 value is approximated by the crosswalk. Caution: tracts were split in 2020 largely because they grew, so this also drops the fastest-growing tracts in both groups and is not an independent check of growth outcomes (housing units, population, jobs).",
    include: (r) => inScope(r) && r.xw_relationship === "identical",
    covariates: COVARIATES,
  },
  {
    id: "caliper",
    title: "Caliper 0.5 SD",
    description: "Main, but matches further than 0.5 standard deviations (RMS across covariates) are dropped.",
    include: inScope,
    caliper: 0.5,
    covariates: COVARIATES,
  },
  {
    id: "no_home",
    title: "No home-value covariates",
    description:
      "Matched without the two home-value covariates, which keeps the renter-dominated tracts that have no median home value. Its home-value rows are shown for completeness but are not balanced on home value.",
    include: inScope,
    covariates: COVARIATES.filter((c) => !HOME_COVARIATES.has(c.name)),
  },
];

interface SpecResult {
  spec: Spec;
  units: Unit[];
  result: MatchResult;
  balance: BalanceRow[];
  effects: Effect[];
  effectsBc: Effect[];
  treated: number;
  controls: number;
  usableControls: number;
}

function runSpec(spec: Spec, rows: Rec[], outcomeMaps: Map<string, Map<string, number | null>>): SpecResult {
  const units: Unit[] = [];
  for (const r of rows) {
    if (!spec.include(r)) continue;
    const treated = r.group === "designated_lic";
    const control = r.group === "eligible_lic_control";
    if (!treated && !control) continue;
    if (control && spec.controlFilter && !spec.controlFilter(r)) continue;
    units.push({
      id: r.geoid10,
      treated,
      stratum: r.state_fips,
      cluster: r.county_fips,
      covariates: spec.covariates.map((c) => c.from(r)),
    });
  }
  const result = nearestNeighbourMatch(units, { k: 5, caliper: spec.caliper });
  const est = (biasCorrect: false | OutcomeModel) =>
    OUTCOMES.map((o) => estimateEffect(units, result, o.col, outcomeMaps.get(o.col)!, { reps: REPS, biasCorrect })).filter(
      (e): e is Effect => e != null
    );
  const complete = (u: Unit) => u.covariates.every((c) => c != null && Number.isFinite(c));
  return {
    spec,
    units,
    result,
    balance: balance(units, result, spec.covariates.map((c) => c.label)),
    effects: est(false),
    effectsBc: est("linear"),
    treated: units.filter((u) => u.treated).length,
    controls: units.filter((u) => !u.treated).length,
    usableControls: units.filter((u) => !u.treated && complete(u)).length,
  };
}

// ---------------------------------------------------------------------------
// formatting

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const fmt = (n: number) => n.toLocaleString("en-US");
const significant = (e: Effect) => e.ciLow > 0 || e.ciHigh < 0;
const signed = (x: number, kind: Kind) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}${kind === "log" ? "" : " pp"}`;

function effectCell(e: Effect, kind: Kind): string {
  return `${signed(e.att, kind)} [${signed(e.ciLow, kind)}, ${signed(e.ciHigh, kind)}]${significant(e) ? "" : " (n.s.)"}`;
}

function levelCell(v: number, kind: Kind): string {
  return kind === "log" ? pct(Math.exp(v) - 1) : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)} pp`;
}

// ---------------------------------------------------------------------------

interface Check {
  name: string;
  status: "pass" | "fail" | "note";
  detail: string;
}

export async function compare(): Promise<void> {
  const t = readCsv(path.join(OUT_DIR, "analysis.csv"));
  const rows: Rec[] = t.rows.map((r) => {
    const rec: Rec = {};
    t.header.forEach((h, i) => (rec[h] = r[i]));
    return rec;
  });
  const byId = new Map(rows.map((r) => [r.geoid10, r]));

  const numericCols = [
    ...OUTCOMES.map((x) => x.col),
    "sens1317_dlog_home_value",
    "sens1317_dlog_rent",
    "sens1317_dlog_hh_income",
    "diag_hpi_real_dlog_2013_2017",
    "diag_hpi_real_dlog_2012_2016",
    "diag_hpi_real_dlog_2014_2022",
  ];
  const outcomeMaps = new Map<string, Map<string, number | null>>();
  for (const o of numericCols) outcomeMaps.set(o, new Map(rows.map((r) => [r.geoid10, num(r[o])])));

  const results = SPECS.map((s) => {
    const r = runSpec(s, rows, outcomeMaps);
    log(`compare ${s.id}: ${fmt(r.result.matches.length)} treated matched of ${fmt(r.treated)}, ${fmt(r.usableControls)} usable controls`);
    return r;
  });
  const main = results[0];
  const est = (y: Map<string, number | null>, model: false | OutcomeModel = "linear", label = "x") =>
    estimateEffect(main.units, main.result, label, y, { reps: REPS, biasCorrect: model });

  // Outcome-model sensitivity for the headline.
  const byModel = new Map<string, Map<OutcomeModel, Effect>>();
  for (const o of OUTCOMES) {
    const m = new Map<OutcomeModel, Effect>();
    for (const model of OUTCOME_MODELS) {
      const e = estimateEffect(main.units, main.result, o.col, outcomeMaps.get(o.col)!, { reps: REPS, biasCorrect: model });
      if (e) m.set(model, e);
    }
    byModel.set(o.col, m);
  }

  // Sensitivity baseline and placebo, on the main matches.
  const sens = ["sens1317_dlog_home_value", "sens1317_dlog_rent", "sens1317_dlog_hh_income"].map((c) => ({
    col: c,
    e: est(outcomeMaps.get(c)!, "linear", c)!,
  }));
  const placebo = est(outcomeMaps.get("diag_hpi_real_dlog_2013_2017")!, "linear", "placebo_2013_2017");
  const placeboEarly = est(outcomeMaps.get("diag_hpi_real_dlog_2012_2016")!, "linear", "placebo_2012_2016");

  // --- median values versus same-home prices --------------------------------
  // FHFA coverage defined from PRE-designation data only, so the split cannot
  // be driven by what happened after 2018.
  const hpiPre = (id: string) => {
    const r = byId.get(id);
    return !!r && r.diag_hpi_real_dlog_2012_2016 !== "" && r.diag_hpi_real_dlog_2013_2017 !== "";
  };
  const isTreated = new Set(main.units.filter((u) => u.treated).map((u) => u.id));
  const acsHome = outcomeMaps.get("out_dlog_home_value")!;
  const fhfaAligned = outcomeMaps.get("diag_hpi_real_dlog_2014_2022")!;
  const units = outcomeMaps.get("out_dlog_housing_units")!;
  const keepIf = (m: Map<string, number | null>, keep: (id: string) => boolean) =>
    new Map([...m].map(([id, v]) => [id, keep(id) ? v : null]));
  // Same tracts for both measures: every tract, treated or control, that has
  // both an ACS home-value change and an FHFA change over the aligned window.
  const both = (id: string) => acsHome.get(id) != null && fhfaAligned.get(id) != null;
  const gapMap = new Map(
    [...acsHome].map(([id, v]) => {
      const f = fhfaAligned.get(id);
      return [id, v != null && f != null ? v - f : null];
    })
  );
  const decomposition = {
    commonAcs: est(keepIf(acsHome, both), "linear", "common_acs"),
    commonFhfa: est(keepIf(fhfaAligned, both), "linear", "common_fhfa"),
    commonGap: est(gapMap, "linear", "common_acs_minus_fhfa"),
    // Split only the designated tracts; every matched control is kept.
    splitTreatedWith: est(keepIf(acsHome, (id) => !isTreated.has(id) || hpiPre(id)), "linear", "acs_treated_with_index"),
    splitTreatedWithout: est(keepIf(acsHome, (id) => !isTreated.has(id) || !hpiPre(id)), "linear", "acs_treated_without_index"),
    // Restrict controls to the same subset as well.
    splitBothWith: est(keepIf(acsHome, hpiPre), "linear", "acs_both_with_index"),
    splitBothWithout: est(keepIf(acsHome, (id) => !hpiPre(id)), "linear", "acs_both_without_index"),
    unitsTreatedWith: est(keepIf(units, (id) => !isTreated.has(id) || hpiPre(id)), "linear", "units_with_index"),
    unitsTreatedWithout: est(keepIf(units, (id) => !isTreated.has(id) || !hpiPre(id)), "linear", "units_without_index"),
  };

  // FHFA coverage by year, to show how the latest years thin out.
  const fhfa = readCsv(path.join(CLEAN_DIR, "fhfa_hpi.csv"));
  const hpiYearCount = (y: number) => {
    const i = fhfa.col(`hpi_${y}`);
    return fhfa.rows.filter((r) => r[i] !== "").length;
  };
  const cov = { 2017: hpiYearCount(2017), 2021: hpiYearCount(2021), 2022: hpiYearCount(2022), 2023: hpiYearCount(2023), 2024: hpiYearCount(2024) };

  // --- sanity checks --------------------------------------------------------
  const count = (f: (r: Rec) => boolean) => rows.filter(f).length;
  const checks: Check[] = [];
  const check = (name: string, ok: boolean, pass: string, fail: string) =>
    checks.push({ name, status: ok ? "pass" : "fail", detail: ok ? pass : fail });

  const designatedN = count((r) => r.designated === "1");
  const licN = count((r) => r.group === "designated_lic");
  const contigN = count((r) => r.group === "designated_contiguous");
  check(
    "2018 lists reconcile",
    designatedN === 8_764 && licN + contigN === 8_764,
    `${fmt(designatedN)} designated = ${fmt(licN)} LIC + ${fmt(contigN)} contiguous, matching the 8,764 on CDFI's final list (reference).`,
    `${fmt(designatedN)} designated (${fmt(licN)} LIC + ${fmt(contigN)} contiguous) does not match the 8,764 on CDFI's final list.`
  );

  const CENSUS_2020 = 334_735_155; // reference: 2020 Census, US + PR
  const censusPop20 = rows.reduce((s, r) => s + (num(r.pop20_census) ?? 0), 0);
  check(
    "Crosswalk conserves the 2020 Census",
    Math.round(censusPop20) === CENSUS_2020,
    `${fmt(Math.round(censusPop20))} people allocated to 2010 tracts, equal to the 2020 Census count of 334,735,155 (US + PR, reference).`,
    `${fmt(Math.round(censusPop20))} people allocated, but the 2020 Census counted 334,735,155.`
  );

  const acs24 = readCsv(path.join(CLEAN_DIR, "acs_2024.csv"));
  const iPop24 = acs24.col("population");
  const acsPop24 = acs24.rows.reduce((s, r) => s + (num(r[iPop24]) ?? 0), 0);
  const convertedPop24 = rows.reduce((s, r) => s + (num(r.post_pop_2024) ?? 0), 0);
  const convGap = Math.abs(convertedPop24 - acsPop24) / acsPop24;
  check(
    "2020-24 ACS population survives conversion to 2010 tracts",
    convGap < 0.001,
    `${fmt(Math.round(convertedPop24))} after conversion vs ${fmt(Math.round(acsPop24))} in the pulled tracts (${pct(convGap, 3)} apart).`,
    `${fmt(Math.round(convertedPop24))} after conversion vs ${fmt(Math.round(acsPop24))} in the pulled tracts (${pct(convGap, 3)} apart) — a join is losing tracts.`
  );

  const missing = readCsv(path.join(OUT_DIR, "acs2024_missing_tracts.csv"));
  const missingPop = missing.rows.reduce((s, r) => s + (num(r[1]) ?? 0), 0);
  const missingCounties = [...new Set(missing.rows.map((r) => r[0].slice(0, 5)))];
  checks.push({
    name: "Every populated 2020 tract is in the 2020-24 ACS",
    status: missing.rows.length === 0 ? "pass" : "note",
    detail:
      missing.rows.length === 0
        ? "All populated 2020 Census tracts appear in the 2020-24 ACS."
        : `${fmt(missing.rows.length)} populated 2020 tracts (${fmt(Math.round(missingPop))} people, county ${missingCounties.join(", ")}) are not published in the 2020-24 ACS; their outcomes are null. For Suffolk County, NY (36103) these tracts appear in the 2017-21 and 2018-22 releases and disappear from 2019-23 on. List: data/oz1/acs2024_missing_tracts.csv.`,
  });

  const tractsWithPop = rows.filter((r) => (num(r.pop_2016) ?? 0) >= 500 && num(r.pop20_census) != null);
  const wild = tractsWithPop.filter((r) => Math.abs(Math.log((num(r.pop20_census)! + 1) / (num(r.pop_2016)! + 1))) > Math.log(2));
  check(
    "Tract geography maps plausibly",
    wild.length / tractsWithPop.length < 0.02,
    `${fmt(wild.length)} of ${fmt(tractsWithPop.length)} tracts (${pct(wild.length / tractsWithPop.length, 2)}) more than doubled or halved between the 2012-16 ACS and the 2020 Census; a mis-mapped tract would show up here, as do real booms and busts.`,
    `${fmt(wild.length)} of ${fmt(tractsWithPop.length)} tracts more than doubled or halved between 2012-16 and 2020 — too many to be real change.`
  );

  // Urban Institute (Theodos, Meixell and Hedman 2018, Table 3) used the same
  // 2012-16 ACS on its own universe: every designated tract, and every eligible
  // tract not designated (LIC and contiguous), including Puerto Rico. Rebuilt
  // here, its published means should come back almost exactly.
  const URBAN = [
    { label: "Median household income", c: "median_hh_income_2016", t: 33_345, k: 44_446, money: true },
    { label: "Poverty rate", c: "poverty_rate_2016", t: 0.3175, k: 0.2112, money: false },
    { label: "Median home value", c: "median_home_value_2016", t: 145_187, k: 170_919, money: true },
    { label: "Median gross rent", c: "median_rent_2016", t: 768, k: 885, money: true },
    { label: "Owner-occupied share", c: "owner_share_2016", t: 0.4462, k: 0.5665, money: false },
    { label: "Vacancy rate", c: "vacancy_rate_2016", t: 0.1583, k: 0.1367, money: false },
  ];
  const meanWhere = (f: (r: Rec) => boolean, c: string) => {
    const v = rows.filter(f).map((r) => num(r[c])).filter((x): x is number => x != null);
    return v.reduce((a, b) => a + b, 0) / v.length;
  };
  const urbanT = (r: Rec) => r.designated === "1" && !ISLAND_AREAS.has(r.state_fips);
  const urbanC = (r: Rec) =>
    r.designated !== "1" && (r.eligible_lic === "1" || r.eligible_contiguous === "1") && !ISLAND_AREAS.has(r.state_fips);
  const urban = URBAN.map((x) => {
    const oursT = meanWhere(urbanT, x.c);
    const oursC = meanWhere(urbanC, x.c);
    const close = (a: number, b: number) => (x.money ? Math.abs(a - b) / b < 0.01 : Math.abs(a - b) < 0.002);
    return { ...x, oursT, oursC, okT: close(oursT, x.t), okC: close(oursC, x.k) };
  });
  const urbanOk = urban.filter((x) => x.okT && x.okC).length;
  checks.push({
    name: "Reproduces the Urban Institute's published tract means",
    status: urbanOk === urban.length ? "pass" : urbanOk >= urban.length - 1 ? "note" : "fail",
    detail: `On Urban's own universe and the same 2012-16 ACS, ${urbanOk} of ${urban.length} measures match its published designated and control means (within 1% for dollars, 0.2 pp for rates). ${
      urbanOk === urban.length ? "" : "See the table for the ones that do not."
    }`,
  });

  const cpiRows = new Map(readCsv(path.join(CLEAN_DIR, "cpi_u.csv")).rows.map((r) => [r[0], Number(r[1])]));
  const cpiFactor = cpiRows.get("2024")! / cpiRows.get("2016")!;
  check(
    "Inflation adjustment",
    Math.abs(cpiFactor - 313.689 / 240.007) < 1e-6,
    `CPI-U 2016-to-2024 factor ${cpiFactor.toFixed(3)}, from BLS annual averages 240.007 and 313.689 (reference).`,
    `CPI-U 2016-to-2024 factor ${cpiFactor.toFixed(3)} differs from the BLS annual averages (240.007, 313.689).`
  );

  // --- who is unmatched -----------------------------------------------------
  const unmatchedIds = main.result.unmatched.map((u) => u.id);
  const unmatchedRows = unmatchedIds.map((id) => byId.get(id)!);
  const missingBy = main.spec.covariates.map((c) => ({
    label: c.label,
    n: unmatchedRows.filter((r) => c.from(r) == null).length,
  }));
  const topMissing = missingBy.filter((m) => m.n > 0).sort((a, b) => b.n - a.n);
  const ownerShares = unmatchedRows.map((r) => num(r.owner_share_2016)).filter((x): x is number => x != null).sort((a, b) => a - b);
  const medianOwner = ownerShares.length ? ownerShares[Math.floor(ownerShares.length / 2)] : null;
  const byCounty = new Map<string, number>();
  for (const r of unmatchedRows) byCounty.set(r.county_fips, (byCounty.get(r.county_fips) ?? 0) + 1);
  const topCounties = [...byCounty].sort((a, b) => b[1] - a[1]).slice(0, 5);

  // --- the 2012-2016 designations -------------------------------------------
  const late = rows.filter((r) => r.designated_acs === "2012-2016");
  const lateLic = late.filter((r) => r.group === "designated_lic");
  const lateInScope = lateLic.filter(inScope);

  // --- residual imbalance and its consequences ------------------------------
  const residual = main.balance.filter((b) => Math.abs(b.smdAfter) > 0.1);
  const flips = OUTCOMES.flatMap((o) => {
    const p = main.effects.find((e) => e.outcome === o.col);
    const b = main.effectsBc.find((e) => e.outcome === o.col);
    if (!p || !b) return [];
    const signFlip = Math.sign(p.att) !== Math.sign(b.att) && significant(p) && significant(b);
    const sigChange = significant(p) !== significant(b);
    return signFlip || sigChange ? [{ o, p, b, signFlip }] : [];
  });

  // --- write JSON -----------------------------------------------------------
  const modelJson: Record<string, Record<string, Effect>> = {};
  for (const [col, m] of byModel) modelJson[col] = Object.fromEntries(m);
  writeFileSync(
    path.join(OUT_DIR, "results.json"),
    JSON.stringify(
      {
        generatedFrom: "data/oz1/analysis.csv",
        covariates: COVARIATES.map((c) => c.label),
        checks,
        specs: results.map((r) => ({
          id: r.spec.id,
          title: r.spec.title,
          description: r.spec.description,
          treated: r.treated,
          controls: r.controls,
          usableControls: r.usableControls,
          matched: r.result.matches.length,
          unmatched: r.result.unmatched.reduce<Record<string, number>>((a, u) => ((a[u.reason] = (a[u.reason] ?? 0) + 1), a), {}),
          maxAbsSmdAfter: Math.max(...r.balance.map((b) => Math.abs(b.smdAfter))),
          balance: r.balance,
          effects: r.effects,
          effectsBiasCorrected: r.effectsBc,
        })),
        outcomeModelSensitivity: modelJson,
        sensitivity1317: sens,
        placebo: { hpi_2013_2017: placebo, hpi_2012_2016: placeboEarly },
        homeValueDecomposition: decomposition,
        fhfaCoverageByYear: cov,
        urbanReproduction: urban,
      },
      null,
      2
    )
  );

  // --- write report ---------------------------------------------------------
  const L: string[] = [];
  const p = (s = "") => L.push(s);
  const outcomeOf = new Map(OUTCOMES.map((o) => [o.col, o]));

  p(`# OZ 1.0 retrospective: Phase 1 report`);
  p();
  p(`Generated by \`pipeline/oz1/compare.ts\` from \`data/oz1/analysis.csv\`. Every estimate below is recomputed on each run; figures taken from published sources are marked *(reference)*.`);
  p();
  p(`> **Informational only, not investment, tax or legal advice.** These are descriptive comparisons of places. They are not predictions of any investment's return and do not recommend any tract, fund or transaction.`);
  p();

  // Row counts
  p(`## Row counts`);
  p();
  p(`| | Tracts |`);
  p(`|---|---:|`);
  p(`| Analysis table (one row per 2010 tract) | ${fmt(rows.length)} |`);
  p(`| 2010 census tracts (50 states, DC, PR) | ${fmt(count((r) => !ISLAND_AREAS.has(r.state_fips)))} |`);
  p(`| Island-area tracts on the 2018 lists (no ACS coverage) | ${fmt(count((r) => ISLAND_AREAS.has(r.state_fips)))} |`);
  p(`| 2018 universe: eligible or designated | ${fmt(count((r) => r.group !== "not_eligible"))} |`);
  p(`| Designated, low-income community | ${fmt(licN)} (${fmt(count((r) => r.group === "designated_lic" && inScope(r)))} in the 50 states + DC) |`);
  p(`| Designated, non-LIC contiguous (excluded from comparison) | ${fmt(contigN)} |`);
  p(`| Eligible LIC, not designated (control pool) | ${fmt(count((r) => r.group === "eligible_lic_control"))} |`);
  p(`| Eligible contiguous, not designated | ${fmt(count((r) => r.group === "eligible_contiguous_not_designated"))} |`);
  p(`| Never eligible | ${fmt(count((r) => r.group === "not_eligible"))} |`);
  p();
  p(`The comparison uses the 50 states and DC. Puerto Rico is excluded because every eligible LIC tract there was designated, leaving no controls; the island areas have no ACS estimates.`);
  p();

  // Crosswalk
  const relCounts = (g: string) => {
    const out: Record<string, number> = {};
    for (const r of rows) if (r.group === g && inScope(r) && r.xw_relationship) out[r.xw_relationship] = (out[r.xw_relationship] ?? 0) + 1;
    return out;
  };
  const relTotal = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
  const rt = relCounts("designated_lic");
  const rc = relCounts("eligible_lic_control");
  p(`## Crosswalk coverage`);
  p();
  p(`2020-2024 ACS and the FHFA index are published on 2020 tracts; the 2018 zones are frozen on 2010 tracts. The crosswalk is built from every 2020 census block, weighted by 2020 population, housing units and jobs rather than land area. When a 2010 tract spans several 2020 tracts, median home values are combined weighting by owner-occupied units, rents by renter-occupied units, and incomes by households. Comparison universe (50 states + DC):`);
  p();
  p(`| | Designated LIC | Controls |`);
  p(`|---|---:|---:|`);
  for (const k of ["identical", "split", "merged", "complex", "unpopulated"]) {
    p(`| ${k} | ${fmt(rt[k] ?? 0)} (${pct((rt[k] ?? 0) / relTotal(rt))}) | ${fmt(rc[k] ?? 0)} (${pct((rc[k] ?? 0) / relTotal(rc))}) |`);
  }
  p();
  p(`*identical*: the 2010 tract is one 2020 tract (values exact). *split*: it divided cleanly into several 2020 tracts (counts exact, medians a weighted mean of the pieces). *merged*: it sits inside a larger 2020 tract (medians describe the larger area). *complex*: boundaries moved both ways.`);
  p();

  // Missing data
  p(`## Missing data`);
  p();
  p(`Share of tracts missing each value, 50 states + DC.`);
  p();
  p(`| Variable | Designated LIC | Controls |`);
  p(`|---|---:|---:|`);
  const missRate = (g: string, c: string) => {
    const sub = rows.filter((r) => r.group === g && inScope(r));
    return pct(sub.filter((r) => r[c] === "").length / sub.length);
  };
  for (const c of [
    "median_home_value_2016",
    "median_rent_2016",
    "median_hh_income_2016",
    "pre_dlog_home_value",
    "pre_dlog_rent",
    "log_jobs_2015",
    "out_dlog_home_value",
    "out_dlog_rent",
    "out_dlog_hh_income",
    "out_dlog_jobs_2017_2023",
    "out_hpi_real_dlog_2017_2022",
    "out_hpi_real_dlog_2017_2024",
  ]) {
    p(`| \`${c}\` | ${missRate("designated_lic", c)} | ${missRate("eligible_lic_control", c)} |`);
  }
  p();
  p(`The FHFA index is the weak point. It exists only where enough homes resold, so it is missing for most zones, and more often for designated tracts than controls. Its tract coverage also thins sharply in the most recent years (${fmt(cov[2021])} tracts in 2021, ${fmt(cov[2022])} in 2022, ${fmt(cov[2024])} in 2024: ${pct(1 - cov[2024] / cov[2021], 0)} fewer than 2021), so a 2024 endpoint selects tracts on their post-designation sales volume. The 2017-22 window is reported alongside for that reason.`);
  p();
  const tWithPre = rows.filter((r) => isTreated.has(r.geoid10) && hpiPre(r.geoid10));
  const tWithoutPre = rows.filter((r) => isTreated.has(r.geoid10) && !hpiPre(r.geoid10));
  const meanOf = (rs: Rec[], c: string) => {
    const v = rs.map((r) => num(r[c])).filter((x): x is number => x != null);
    return v.reduce((a, b) => a + b, 0) / v.length;
  };
  p(`Designated tracts in the comparison, split by whether FHFA had an index for them *before* designation (2012-16 and 2013-17):`);
  p();
  p(`| | With an index | Without |`);
  p(`|---|---:|---:|`);
  p(`| Count | ${fmt(tWithPre.length)} | ${fmt(tWithoutPre.length)} |`);
  p(`| Owner-occupied share, 2012-16 | ${pct(meanOf(tWithPre, "owner_share_2016"))} | ${pct(meanOf(tWithoutPre, "owner_share_2016"))} |`);
  p(`| Poverty rate, 2012-16 | ${pct(meanOf(tWithPre, "poverty_rate_2016"))} | ${pct(meanOf(tWithoutPre, "poverty_rate_2016"))} |`);
  p(`| Median household income, 2012-16 | $${fmt(Math.round(meanOf(tWithPre, "median_hh_income_2016")))} | $${fmt(Math.round(meanOf(tWithoutPre, "median_hh_income_2016")))} |`);
  p();

  // Sanity checks
  p(`## Sanity checks`);
  p();
  for (const c of checks) p(`- ${c.status === "pass" ? "PASS" : c.status === "note" ? "NOTE" : "**FAIL**"} **${c.name}.** ${c.detail}`);
  p();
  p(`Urban Institute reproduction (same 2012-16 ACS; Urban's universe includes Puerto Rico and the non-designated contiguous tracts, so its gaps are wider than this study's LIC-only comparison):`);
  p();
  p(`| 2012-16 mean | Designated (rebuilt) | Designated (Urban, reference) | Not designated (rebuilt) | Not designated (Urban, reference) |`);
  p(`|---|---:|---:|---:|---:|`);
  for (const x of urban) {
    const f = (v: number) => (x.money ? `$${fmt(Math.round(v))}` : pct(v, 2));
    p(`| ${x.label} | ${f(x.oursT)}${x.okT ? "" : " *"} | ${f(x.t)} | ${f(x.oursC)}${x.okC ? "" : " *"} | ${f(x.k)} |`);
  }
  if (urban.some((x) => !x.okT || !x.okC)) {
    // Test the one explanation on offer rather than leave a miss unexplained:
    // does the figure match once Puerto Rico is left out?
    const notes = urban
      .filter((x) => !x.okT)
      .map((x) => {
        const noPr = meanWhere((r) => urbanT(r) && r.state_fips !== PUERTO_RICO, x.c);
        const f = (v: number) => (x.money ? `$${fmt(Math.round(v))}` : pct(v, 2));
        return `${x.label.toLowerCase()} for designated tracts is ${f(noPr)} without Puerto Rico, against Urban's ${f(x.t)}`;
      });
    p(`\n\\* outside tolerance. ${notes.length ? `For comparison, ${notes.join("; ")} — so Urban appears to have left Puerto Rico out of that one figure.` : ""}`);
  }
  p();

  // Headline
  p(`## Headline: designated vs matched eligible tracts`);
  p();
  p(`Change from 2012-2016 to 2020-2024 unless noted. "Designated" and "Matched controls" are average growth over the period. Differences are designated minus matched controls, in **log points x100** — roughly the percent by which designated tracts' *ending value* exceeds their matches', so they do not subtract exactly from the two growth columns — or in percentage points for rates. 95% intervals from a county-clustered bootstrap; "n.s." marks intervals that include zero.`);
  p();
  p(`The **bias-corrected** difference also removes what the covariate gaps left by matching would produce on their own (Abadie-Imbens, linear outcome model). Because matches are not close (the median treated tract's nearest control is ${median(main.result.matches.map((m) => m.distances[0])).toFixed(2)} SD away), that correction extrapolates, so it is repeated under four outcome models; the **range** column shows how much the answer depends on that choice. "Stable" means all four agree on sign and significance.`);
  p();
  p(`| Outcome | n | Designated | Matched controls | Bias-corrected [95% CI] | Range, 4 models | Stable? | Matched only [95% CI] | Raw |`);
  p(`|---|---:|---:|---:|---|---|---|---|---:|`);
  const stability: Array<{ col: string; stable: boolean }> = [];
  for (const e of main.effectsBc) {
    const o = outcomeOf.get(e.outcome)!;
    const plain = main.effects.find((x) => x.outcome === e.outcome)!;
    const models = [...(byModel.get(e.outcome)?.values() ?? [])];
    const lo = Math.min(...models.map((m) => m.att));
    const hi = Math.max(...models.map((m) => m.att));
    const stable =
      models.every((m) => significant(m) === significant(e)) &&
      (!significant(e) || models.every((m) => Math.sign(m.att) === Math.sign(e.att)));
    stability.push({ col: e.outcome, stable });
    p(
      `| ${o.label}${o.note ? ` *(${o.note})*` : ""} | ${fmt(e.n)} | ${levelCell(e.meanTreated, o.kind)} | ${levelCell(e.meanMatchedControls, o.kind)} | ` +
        `${effectCell(e, o.kind)} | ${signed(lo, o.kind)} to ${signed(hi, o.kind)} | ${stable ? "stable" : "**model-dependent**"} | ` +
        `${effectCell(plain, o.kind)} | ${signed(e.rawDifference, o.kind)} |`
    );
  }
  p();
  if (residual.length > 0) {
    p(
      `**Why the corrected and matched-only numbers differ.** After matching, designated tracts still differ from their matches on ${residual
        .map((b) => `${b.covariate} (SMD ${b.smdAfter >= 0 ? "+" : ""}${b.smdAfter.toFixed(2)})`)
        .join(", ")}. Outcomes that move with those characteristics inherit the gap in a plain matched comparison; the correction removes it.` +
        (flips.length
          ? ` That changes the reading of ${flips.map((f) => `${f.o.label.toLowerCase()} (${f.signFlip ? "sign reverses" : "significance changes"}: ${signed(f.p.att, f.o.kind)} matched-only vs ${signed(f.b.att, f.o.kind)} corrected)`).join("; ")}.`
          : "")
    );
    p();
  }
  const unstable = stability.filter((s) => !s.stable).map((s) => outcomeOf.get(s.col)!.label.toLowerCase());
  p(
    `**Reading this.** These are gaps between zones and the eligible tracts that most resembled them in 2012-2016, in the same state, on levels and on 2006-2016 trends: what designation *came with*, not proof of what it *caused*. Governors chose tracts for reasons these data do not record, and work cited in Treasury OTA Working Paper 128 (Glancy et al.) attributes about two-thirds of the apparent OZ construction increase to that selection.` +
      (unstable.length
        ? ` Treat ${unstable.join(", ")} as unsettled: ${unstable.length === 1 ? "its" : "their"} answer depends on the outcome model.`
        : "")
  );
  p();

  // Robustness
  p(`## Robustness`);
  p();
  p(`Bias-corrected differences (linear outcome model) under each specification.`);
  p();
  p(`| Outcome | ${results.map((r) => r.spec.title).join(" | ")} |`);
  p(`|---|${results.map(() => "---").join("|")}|`);
  for (const o of OUTCOMES) {
    const cells = results.map((r) => {
      const e = r.effectsBc.find((x) => x.outcome === o.col);
      return e ? effectCell(e, o.kind) : "—";
    });
    p(`| ${o.label} | ${cells.join(" | ")} |`);
  }
  p();
  for (const r of results) {
    const reasons = r.result.unmatched.reduce<Record<string, number>>((a, u) => ((a[u.reason] = (a[u.reason] ?? 0) + 1), a), {});
    const un = r.result.unmatched.length;
    const maxSmd = Math.max(...r.balance.map((b) => Math.abs(b.smdAfter)));
    p(
      `- **${r.spec.title}.** ${r.spec.description} ${fmt(r.result.matches.length)} of ${fmt(r.treated)} treated matched against ${fmt(r.usableControls)} usable controls` +
        `${un ? `; ${fmt(un)} unmatched (${Object.entries(reasons).map(([k, v]) => `${fmt(v)} ${k}`).join(", ")})` : ""}. ` +
        `Largest post-match |SMD| ${maxSmd.toFixed(3)}${maxSmd > 0.25 ? " — balance is poor here, so this column leans heavily on the correction" : ""}.`
    );
  }
  p();
  if (topMissing.length) {
    p(
      `**Who the main specification leaves out.** The ${fmt(unmatchedRows.length)} unmatched designated tracts are missing ${topMissing
        .slice(0, 3)
        .map((m) => `${m.label} (${fmt(m.n)})`)
        .join(", ")}. They are overwhelmingly renter-dominated${medianOwner != null ? ` (median owner-occupied share ${pct(medianOwner, 0)})` : ""}, concentrated in counties ${topCounties.map(([c, n]) => `${c} (${n})`).join(", ")} — public-housing-type tracts with too few owner-occupied homes for a published median value. The "No home-value covariates" column keeps them.`
    );
    p();
  }
  p(`**2013-2017 baseline** (the ACS release that came out after designation, used only as an outcome baseline, bias-corrected):`);
  p();
  for (const { col, e } of sens) p(`- ${outcomeOf.get(col.replace("sens1317_", "out_"))?.label ?? col}: ${effectCell(e, "log")}, n=${fmt(e.n)}`);
  p();

  // Balance
  p(`## Balance (main specification)`);
  p();
  p(`Standardised mean differences. Below 0.1 in absolute value is the conventional bar for good balance.`);
  p();
  p(`| Covariate | Designated | All controls | Matched controls | SMD before | SMD after |`);
  p(`|---|---:|---:|---:|---:|---:|`);
  for (const b of main.balance) {
    p(`| ${b.covariate} | ${b.meanTreated.toFixed(3)} | ${b.meanControlAll.toFixed(3)} | ${b.meanControlMatched.toFixed(3)} | ${b.smdBefore.toFixed(3)} | ${b.smdAfter.toFixed(3)} |`);
  }
  p();

  // Placebo
  p(`## Pre-trend check (placebo)`);
  p();
  p(`House prices before designation were NOT used for matching (see the leakage note). If matching on ACS levels and trends produced comparable groups, designated and matched tracts should show no price gap *before* 2018.`);
  p();
  if (placebo) p(`- FHFA real price change 2013-2017: ${effectCell(placebo, "log")}, n=${fmt(placebo.n)}`);
  if (placeboEarly) p(`- FHFA real price change 2012-2016: ${effectCell(placeboEarly, "log")}, n=${fmt(placeboEarly.n)}`);
  p();
  const preTrend = [placebo, placeboEarly].filter((x): x is Effect => !!x && significant(x));
  p(
    preTrend.length
      ? `At least one window shows designated tracts' prices already rising faster before designation. That is consistent with governors favouring tracts already on the move, and it means part of any post-2018 gap may be a continuing pre-trend rather than something designation brought.`
      : `Neither window shows a significant pre-designation price gap.`
  );
  p();
  p(`Caveat: FHFA re-estimates its repeat-sales index as new sales arrive, so today's pre-2018 values partly reflect later sales. That is why prices are a check here and not a matching feature.`);
  p();

  // Median values vs same-home prices
  const d = decomposition;
  const row = (label: string, e: Effect | null) => p(`| ${label} | ${e ? effectCell(e, "log") : "—"} | ${e ? fmt(e.n) : "—"} |`);
  p(`## Median values versus same-home prices`);
  p();
  p(`Census median home values rose faster in zones than in their matches, while FHFA's repeat-sales index, which follows the *same homes*, shows little or no gap. That can come from *which* zones FHFA can see (it needs resales), from *when* each measure starts, or from *new, pricier housing* lifting a median without existing homes appreciating. The last one matters most for an owner: a building's holder captures same-home appreciation, not a shift in the median. The tests below use the main matches, bias-corrected; FHFA coverage is defined from pre-designation years only.`);
  p();
  p(`**Same tracts, both measures.** Every designated tract and control that has both an ACS home-value change and an FHFA change over the matching window (2014-2022, the ACS outcome's midpoints):`);
  p();
  p(`| Measure on identical tracts | Difference [95% CI] | n |`);
  p(`|---|---|---:|`);
  row("ACS median home value", d.commonAcs);
  row("FHFA same-home prices, 2014-22", d.commonFhfa);
  row("ACS minus FHFA, tract by tract", d.commonGap);
  p();
  p(`**Splitting by FHFA coverage.** Two constructions, which answer different questions and need not agree:`);
  p();
  p(`| ACS median home value | Difference [95% CI] | n |`);
  p(`|---|---|---:|`);
  row("Designated tracts WITH an index, all their matched controls", d.splitTreatedWith);
  row("Designated tracts WITHOUT an index, all their matched controls", d.splitTreatedWithout);
  row("WITH an index, controls also restricted to tracts with one", d.splitBothWith);
  row("WITHOUT an index, controls also restricted to tracts without one", d.splitBothWithout);
  row("Housing units: designated WITH an index", d.unitsTreatedWith);
  row("Housing units: designated WITHOUT an index", d.unitsTreatedWithout);
  p();
  const gapSig = d.commonGap && significant(d.commonGap);
  p(
    `**What this can and cannot say.** ` +
      (d.commonGap
        ? gapSig
          ? `On the same tracts, the ACS median gap exceeds the same-home price gap by ${signed(d.commonGap.att, "log")} log points, with an interval that excludes zero${d.commonGap.ciLow < 0.0025 && d.commonGap.ciLow > 0 ? ", though only just" : ""}. Because the tracts are identical, that part cannot be a sample effect; it is consistent with new or different housing raising the median faster in zones than in their matches. `
          : `On the same tracts, the ACS median gap and the same-home price gap are not distinguishable (${signed(d.commonGap.att, "log")}, n.s.), so on the tracts where both can be measured there is no evidence that medians and same-home prices diverge. `
        : "") +
      `The coverage splits cannot separate the explanations: splitting only the designated tracts and restricting the controls as well change which subset shows the larger gap, because the second construction also changes the comparison group and refits the correction. Housing grew faster in zones whether or not FHFA covers them, so new construction is present on both sides of the split.`
  );
  p();

  // Data gaps
  p(`## Data that could not be obtained, or only partly`);
  p();
  const lodesCov = readCsv(path.join(CLEAN_DIR, "lodes_coverage.csv"));
  const lodesGaps = lodesCov.rows.filter((r) => r[3] !== "1").map((r) => `${r[1]} ${r[2]}`);
  p(`- **CPI-U-RS** (the deflator Census recommends for ACS dollars): BLS serves it only to browsers (HTTP 403 to scripts). CPI-U from the BLS public API is used instead; since 2000 the two move almost identically.`);
  p(`- **LODES jobs** missing for: ${lodesGaps.join(", ")}. Jobs outcomes are null there, never zero.`);
  p(`- **FHFA tract HPI** covers ${fmt(count((r) => r.out_hpi_real_dlog_2017_2024 !== "" && inScope(r)))} of the in-scope 2010 tracts for 2017-2024 and ${fmt(count((r) => r.out_hpi_real_dlog_2017_2022 !== "" && inScope(r)))} for 2017-2022 (see missing data).`);
  if (missing.rows.length) {
    p(`- **2020-24 ACS**: ${fmt(missing.rows.length)} populated 2020 tracts (${fmt(Math.round(missingPop))} people) in county ${missingCounties.join(", ")} are not published; see the completeness check.`);
  }
  p(`- **Island areas** (AS, GU, MP, VI): designated and eligible in 2018 but never surveyed by the ACS, so no features or outcomes.`);
  p(`- **One CDFI data error, corrected:** the 2018 list's renumbering table maps Staten Island tract 36085000900 to 36085008900, but both are real, distinct 2010 tracts (1,880 people and 0). Applying it would have merged them; it is rejected by checking every renumbering against Census 2010 geography.`);
  p(`- **Connecticut** switched to planning-region GEOIDs in 2022; the 2020-24 ACS, FHFA and Treasury's OZ 2.0 file use them, the 2020 Census does not. All 884 Connecticut tracts are mapped back through Census's town-to-tract relationship file rather than dropped.`);
  p();

  // Method notes
  p(`## Method notes`);
  p();
  p(`- **No leakage.** Features use only data describing the world before nomination (March-April 2018) that could not have been revised with later information: ACS 2006-10 and 2012-16 (released Dec 2017), LODES 2012 and 2015. The 2013-17 ACS was released in Dec 2018, after designation, so it appears only as a sensitivity baseline. FHFA prices are excluded from features because the index is revised with later sales, and FHFA coverage splits use pre-designation years only.`);
  p(`- **Real terms.** Dollar changes are deflated with annual CPI-U.`);
  p(`- **Censoring.** A top- or bottom-coded median in 2012-16 (or 2006-10) nulls that tract's change. In 2020-24, a censored 2020 piece of a split or complex tract is dropped from the weighted mean, and the tract keeps a value only if at least half its weight remains.`);
  p(`- **Matching.** Nearest neighbours (k=5, with replacement) within state on ${COVARIATES.length} standardised covariates. Intervals come from ${fmt(REPS)} county-cluster bootstrap draws and condition on the matches and the outcome regression, so they understate total uncertainty somewhat.`);
  p(
    `- **Late designations.** ${fmt(late.length)} designations used 2012-2016 ACS data instead of the 2011-2015 data the eligible list was built from. The ${fmt(lateLic.length)} designated as low-income communities are treated (${fmt(lateInScope.length)} of them in the 50 states + DC); ${fmt(late.length - lateLic.length)} contiguous designation${late.length - lateLic.length === 1 ? " is" : "s are"} excluded with the other contiguous zones.`
  );
  p();

  writeFileSync(path.join(OUT_DIR, "REPORT.md"), L.join("\n"));
  log(`compare: wrote data/oz1/REPORT.md and data/oz1/results.json`);
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  compare().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
