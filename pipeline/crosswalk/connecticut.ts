/**
 * Connecticut's two sets of tract GEOIDs.
 *
 * In 2022 Connecticut replaced its eight counties with nine planning regions as
 * county-equivalents. Tract boundaries did not move, but every tract GEOID
 * changed, because the county part of it did (09001... became 09110... etc.).
 * The 2020 Census and its block relationship files use the old codes; the
 * 2020-2024 ACS, FHFA's tract index and Treasury's OZ 2.0 file use the new ones.
 * Joined naively, every Connecticut tract silently drops out — which is how this
 * was found: the report's population-conservation check came up 3.66 million
 * people short, almost exactly Connecticut.
 *
 * The six-digit tract code is NOT unique across old counties, so it cannot be
 * used alone. The mapping is built from two Census files instead:
 *   - the 2022 town (county subdivision) to 2022 tract relationship file, and
 *   - the old-county to town crosswalk.
 * A 2022 tract lies in one or more towns; each town belonged to exactly one old
 * county; 2020 tracts nest within old counties. So every new tract resolves to
 * exactly one old tract GEOID, and any that does not is reported, not guessed.
 *
 * Output: pipeline/clean/ct_tracts.csv  geoid_planning_region, geoid_census2020
 */

import path from "node:path";
import { CLEAN_DIR } from "../config";
import { fetchCached, log } from "../lib/http";
import { writeCsv } from "../lib/table";

const TOWN_TRACT_URL = "https://www2.census.gov/geo/docs/maps-data/data/rel2022/acs22_cousub22_tract22_st09.txt";
const COUNTY_TOWN_URL = "https://www2.census.gov/geo/docs/reference/ct_change/ct_cou_to_cousub_crosswalk.txt";

/**
 * Parse delimited text where quoted fields may contain the delimiter or line
 * breaks. The county-to-town crosswalk puts newlines inside its quoted header.
 */
export function parseQuoted(text: string, delim: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) {
      row.push(cur);
      cur = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cur);
      cur = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

/** Normalize a header cell: "OLD_COUNTYFP\n(INCITS31)" -> "OLD_COUNTYFP". */
function headerName(h: string): string {
  return h.split(/\s|\(/)[0].trim();
}

export interface CtMapping {
  /** Planning-region GEOID -> 2020 Census GEOID. */
  toCensus: Map<string, string>;
  ambiguous: Array<{ planning: string; candidates: string[] }>;
}

export function buildCtMapping(townTractText: string, countyTownText: string): CtMapping {
  const cw = parseQuoted(countyTownText, "|");
  const ch = cw[0].map(headerName);
  const iOldCounty = ch.indexOf("OLD_COUNTYFP");
  const iNewTown = ch.indexOf("NEW_COUSUB_GEOID");
  if (iOldCounty < 0 || iNewTown < 0) throw new Error(`CT county-town crosswalk header changed: ${ch.join("|")}`);
  // The file ends with footnote definitions; only full rows for state 09 are data.
  const oldCountyOfTown = new Map<string, string>();
  for (const r of cw.slice(1)) {
    if (r.length < ch.length || r[0].trim() !== "09") continue;
    oldCountyOfTown.set(r[iNewTown].trim(), r[iOldCounty].trim().padStart(3, "0"));
  }

  const tt = parseQuoted(townTractText, "|");
  const th = tt[0].map(headerName);
  const iTown = th.indexOf("GEOID_COUSUB_22");
  const iTract = th.indexOf("GEOID_TRACT_22");
  const iLand = th.indexOf("AREALAND_PART");
  const iWater = th.indexOf("AREAWATER_PART");
  if (iTown < 0 || iTract < 0 || iLand < 0) throw new Error(`CT town-tract file header changed: ${th.join("|")}`);

  // Old counties each new tract touches, weighted by LAND overlap, so neither a
  // sliver of a neighboring town nor a shared stretch of open water (the
  // "County subdivisions not defined" water pseudo-towns) can outvote the
  // tract's real county. Water counts only for a tract with no land at all.
  const land = new Map<string, Map<string, number>>();
  const water = new Map<string, Map<string, number>>();
  for (const r of tt.slice(1)) {
    if (r.length <= Math.max(iTown, iTract, iLand)) continue;
    const tract = r[iTract].trim();
    const oldCounty = oldCountyOfTown.get(r[iTown].trim());
    if (!oldCounty) throw new Error(`Town ${r[iTown]} missing from the CT county crosswalk`);
    const add = (acc: Map<string, Map<string, number>>, v: number) => {
      const m = acc.get(tract) ?? new Map<string, number>();
      m.set(oldCounty, (m.get(oldCounty) ?? 0) + v);
      acc.set(tract, m);
    };
    add(land, Number(r[iLand]) || 0);
    add(water, iWater >= 0 ? Number(r[iWater]) || 0 : 0);
  }
  const touch = new Map<string, Map<string, number>>();
  for (const [tract, m] of land) {
    const hasLand = [...m.values()].some((v) => v > 0);
    touch.set(tract, hasLand ? new Map([...m].filter(([, v]) => v > 0)) : water.get(tract)!);
  }

  const toCensus = new Map<string, string>();
  const ambiguous: CtMapping["ambiguous"] = [];
  for (const [tract, counties] of touch) {
    const ranked = [...counties.entries()].sort((a, b) => b[1] - a[1]);
    const total = ranked.reduce((s, [, a]) => s + a, 0);
    const [county, area] = ranked[0];
    // A tract that genuinely straddles two old counties would break the nesting
    // assumption; flag anything where the runner-up holds real area.
    if (ranked.length > 1 && total > 0 && ranked[1][1] / total > 0.01) {
      ambiguous.push({ planning: tract, candidates: ranked.map(([c]) => `09${c}${tract.slice(5)}`) });
    }
    if (area >= 0) toCensus.set(tract, `09${county}${tract.slice(5)}`);
  }
  return { toCensus, ambiguous };
}

export async function buildCtTracts(): Promise<CtMapping> {
  const [townTract, countyTown] = await Promise.all([
    fetchCached(TOWN_TRACT_URL, "ct-cousub22-tract22.txt"),
    fetchCached(COUNTY_TOWN_URL, "ct-cou-to-cousub-crosswalk.txt"),
  ]);
  const m = buildCtMapping(townTract.toString("utf8"), countyTown.toString("utf8"));
  writeCsv(
    path.join(CLEAN_DIR, "ct_tracts.csv"),
    ["geoid_planning_region", "geoid_census2020"],
    [...m.toCensus.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
  );
  log(`connecticut: ${m.toCensus.size} planning-region tracts mapped to 2020 Census GEOIDs; ${m.ambiguous.length} straddle old counties`);
  for (const a of m.ambiguous) log(`connecticut: ${a.planning} touches ${a.candidates.join(", ")}`);
  return m;
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  buildCtTracts().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
