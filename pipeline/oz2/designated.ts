/**
 * OZ 2.0 designations: the tracts governors nominate and Treasury certifies
 * for the round that takes effect 2027-01-01.
 *
 * NOT YET PUBLISHED. The nomination window closes 2026-09-28 (or 2026-10-28 if
 * extended) and Treasury certifies within 30 days after. This stage exists so
 * the list lands the day it appears: add each list Treasury publishes to
 * `RELEASES` and re-run the pipeline. In 2018 Treasury certified states in
 * batches over several weeks, so a release names the states it certifies (or
 * "all" for a final national list). Until a state is certified its tracts stay
 * pending: a tract is "not designated" only once its state's list is out, so
 * nothing downstream can mistake "not published" for "not chosen".
 *
 * The 2018 list is the model: a workbook whose sheet has a title block above a
 * header row naming the census tract column. The parser finds that column by
 * name rather than position, so a reordered or renamed file fails loudly
 * instead of reading the wrong column.
 *
 * Checks the file against the statute rather than trusting it:
 *  - Every designated tract must be on Treasury's 2027 eligible list. The
 *    contiguous-tract exception is repealed, so there is no other way in. A
 *    tract that is not is kept and flagged, never silently dropped: that is a
 *    disagreement to report, not a row to hide.
 *  - Each jurisdiction's count must be within its cap (§ 1400Z-1(d)), computed
 *    by `stateCap` from its eligible-LIC count.
 *
 * Output: pipeline/clean/oz2_designated.csv (designated tracts) and
 * pipeline/clean/oz2_designation_states.csv (certified states and when).
 */

import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { stateCap } from "../../lib/oz/eligibility";
import { CLEAN_DIR } from "../config";
import { readWorkbook, type Sheet } from "../lib/archive";
import { fetchCached, log } from "../lib/http";
import { readCsv, tractGeoid, writeCsv } from "../lib/table";

export interface Release {
  url: string;
  cacheName: string;
  /** Date Treasury published this list, YYYY-MM-DD. */
  published: string;
  /** States (FIPS) this list certifies, or "all" for a complete national list. */
  states: "all" | readonly string[];
  /** Treasury's own count for this list, which guards against a changed file. */
  expected?: { designated: number };
}

/** Every list Treasury has published for the 2027 round, oldest first. Empty until the first one. */
export const RELEASES: readonly Release[] = [];

/**
 * The published per-tract code: 1 designated, 0 not designated (its state's
 * list is out and the tract is not on it), null pending (its state's list is
 * not out yet).
 */
export function designationCode(geoid: string, designated: ReadonlySet<string>, certified: ReadonlyMap<string, string>): 1 | 0 | null {
  if (designated.has(geoid)) return 1;
  return certified.has(geoid.slice(0, 2)) ? 0 : null;
}

const TRACT_HEADER = /census\s*tract|tract\s*(number|id|geoid)|^geoid/i;

export interface Oz2Designation {
  geoid20: string;
  stateFips: string;
  /** On Treasury's 2027 eligible-LIC list. False is a disagreement to report. */
  onEligibleList: boolean;
}

export interface JurisdictionCount {
  stateFips: string;
  designated: number;
  eligibleLics: number;
  cap: number;
  overCap: boolean;
}

export interface Oz2Designated {
  designations: Oz2Designation[];
  byState: JurisdictionCount[];
  duplicates: number;
  notEligible: string[];
}

/** Locate the tract column in any sheet, below whatever title block sits above it. */
function findTractColumn(sheets: Sheet[]): { sheet: Sheet; row: number; col: number } {
  for (const sheet of sheets) {
    for (let row = 0; row < Math.min(sheet.rows.length, 50); row++) {
      const col = sheet.rows[row].findIndex((c) => TRACT_HEADER.test(String(c ?? "").trim()));
      if (col >= 0) return { sheet, row, col };
    }
  }
  throw new Error(
    `No census tract column found in sheets ${sheets.map((s) => `"${s.name}"`).join(", ")}; ` +
      `the published format differs from the 2018 list and the parser needs updating`
  );
}

/**
 * @param eligible Treasury's 2027 eligibility verdict by 2020 tract GEOID.
 */
export function parseOz2Designated(sheets: Sheet[], eligible: ReadonlyMap<string, boolean>): Oz2Designated {
  const { sheet, row, col } = findTractColumn(sheets);
  const seen = new Set<string>();
  const designations: Oz2Designation[] = [];
  let duplicates = 0;
  for (const r of sheet.rows.slice(row + 1)) {
    const geoid = tractGeoid(r[col]);
    if (!geoid) continue;
    if (seen.has(geoid)) {
      duplicates++;
      continue;
    }
    seen.add(geoid);
    designations.push({ geoid20: geoid, stateFips: geoid.slice(0, 2), onEligibleList: eligible.get(geoid) === true });
  }
  designations.sort((a, b) => (a.geoid20 < b.geoid20 ? -1 : 1));

  const licsByState = new Map<string, number>();
  for (const [geoid, isEligible] of eligible) {
    if (isEligible) licsByState.set(geoid.slice(0, 2), (licsByState.get(geoid.slice(0, 2)) ?? 0) + 1);
  }
  const designatedByState = new Map<string, number>();
  for (const d of designations) designatedByState.set(d.stateFips, (designatedByState.get(d.stateFips) ?? 0) + 1);
  const byState = [...designatedByState.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([stateFips, designated]) => {
      const eligibleLics = licsByState.get(stateFips) ?? 0;
      const cap = stateCap(eligibleLics);
      return { stateFips, designated, eligibleLics, cap, overCap: designated > cap };
    });

  return {
    designations,
    byState,
    duplicates,
    notEligible: designations.filter((d) => !d.onEligibleList).map((d) => d.geoid20),
  };
}

function loadEligible(): Map<string, boolean> {
  const file = path.join(CLEAN_DIR, "oz2_eligible.csv");
  if (!existsSync(file)) throw new Error("Run pipeline/oz2/eligible.ts first: designations are checked against it");
  const t = readCsv(file);
  const g = t.col("geoid20");
  const e = t.col("eligible");
  return new Map(t.rows.map((r) => [r[g], r[e] === "1"]));
}

export async function buildOz2Designated(releases: readonly Release[] = RELEASES): Promise<Oz2Designated | null> {
  const outDesignated = path.join(CLEAN_DIR, "oz2_designated.csv");
  const outStates = path.join(CLEAN_DIR, "oz2_designation_states.csv");
  if (releases.length === 0) {
    // Remove any stale output so publish cannot report designations that were withdrawn.
    rmSync(outDesignated, { force: true });
    rmSync(outStates, { force: true });
    log("oz2 designations: not yet published by Treasury; every eligible tract stays pending (add a release in pipeline/oz2/designated.ts)");
    return null;
  }
  const eligible = loadEligible();
  const allStates = [...new Set([...eligible.keys()].map((g) => g.slice(0, 2)))];
  const certified = new Map<string, string>();
  const seen = new Map<string, Oz2Designation>();
  let duplicates = 0;
  for (const release of releases) {
    const result = parseOz2Designated(readWorkbook(await fetchCached(release.url, release.cacheName)), eligible);
    if (release.expected && result.designations.length !== release.expected.designated) {
      throw new Error(`OZ2 designations (${release.published}): expected ${release.expected.designated}, got ${result.designations.length}. The file has changed.`);
    }
    const states = release.states === "all" ? allStates : release.states;
    const outside = result.designations.filter((d) => !states.includes(d.stateFips));
    if (outside.length > 0) {
      throw new Error(`OZ2 designations (${release.published}): ${outside.length} tracts in states the release does not list, e.g. ${outside[0].geoid20}`);
    }
    for (const st of states) if (!certified.has(st)) certified.set(st, release.published);
    duplicates += result.duplicates;
    for (const d of result.designations) {
      if (seen.has(d.geoid20)) duplicates++;
      else seen.set(d.geoid20, d);
    }
  }
  const designations = [...seen.values()].sort((a, b) => (a.geoid20 < b.geoid20 ? -1 : 1));
  const merged = parseMerged(designations, eligible, duplicates);

  if (merged.duplicates > 0) log(`oz2 designations: ${merged.duplicates} duplicate rows ignored`);
  if (merged.notEligible.length > 0) {
    log(`oz2 designations: ${merged.notEligible.length} NOT on Treasury's eligible list (kept, flagged): ${merged.notEligible.slice(0, 20).join(", ")}`);
  }
  for (const st of merged.byState.filter((x) => x.overCap)) {
    log(`oz2 designations: state ${st.stateFips} designated ${st.designated}, over its cap of ${st.cap} (${st.eligibleLics} eligible LICs)`);
  }

  writeCsv(outDesignated, ["geoid20", "state_fips", "on_eligible_list"], merged.designations.map((d) => [d.geoid20, d.stateFips, d.onEligibleList]));
  writeCsv(outStates, ["state_fips", "certified_on"], [...certified].sort(([a], [b]) => (a < b ? -1 : 1)));
  log(
    `oz2 designations: ${merged.designations.length.toLocaleString("en-US")} tracts; ` +
      `${certified.size} of ${allStates.length} jurisdictions certified`
  );
  return merged;
}

/** Totals and checks over designations merged from several releases. */
function parseMerged(designations: Oz2Designation[], eligible: ReadonlyMap<string, boolean>, duplicates: number): Oz2Designated {
  const licsByState = new Map<string, number>();
  for (const [geoid, isEligible] of eligible) if (isEligible) licsByState.set(geoid.slice(0, 2), (licsByState.get(geoid.slice(0, 2)) ?? 0) + 1);
  const designatedByState = new Map<string, number>();
  for (const d of designations) designatedByState.set(d.stateFips, (designatedByState.get(d.stateFips) ?? 0) + 1);
  const byState = [...designatedByState.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([stateFips, designated]) => {
      const eligibleLics = licsByState.get(stateFips) ?? 0;
      const cap = stateCap(eligibleLics);
      return { stateFips, designated, eligibleLics, cap, overCap: designated > cap };
    });
  return { designations, byState, duplicates, notEligible: designations.filter((d) => !d.onEligibleList).map((d) => d.geoid20) };
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  buildOz2Designated().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
