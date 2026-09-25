/**
 * OZ 2.0 designations: the tracts governors nominate and Treasury certifies
 * for the round that takes effect 2027-01-01.
 *
 * NOT YET PUBLISHED. The nomination window closes 2026-09-28 (or 2026-10-28 if
 * extended) and Treasury certifies within 30 days after. This stage exists so
 * the list lands the day it appears: set `SOURCE.url` (and the expected counts
 * from Treasury's announcement) and re-run the pipeline. Until then it logs
 * that the list is pending and writes nothing, so nothing downstream can
 * mistake "not published" for "no tract designated".
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
 * Output: pipeline/clean/oz2_designated.csv
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { stateCap } from "../../lib/oz/eligibility";
import { CLEAN_DIR } from "../config";
import { readWorkbook, type Sheet } from "../lib/archive";
import { fetchCached, log } from "../lib/http";
import { readCsv, tractGeoid, writeCsv } from "../lib/table";

/** Set when Treasury publishes. `expected` guards against a changed file. */
export const SOURCE: { url: string | null; cacheName: string; expected: { designated: number } | null } = {
  url: null,
  cacheName: "oz2-designated.xlsx",
  expected: null,
};

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

export async function buildOz2Designated(): Promise<Oz2Designated | null> {
  if (!SOURCE.url) {
    log("oz2 designations: not yet published by Treasury; nothing written (set SOURCE.url in pipeline/oz2/designated.ts)");
    return null;
  }
  const buf = await fetchCached(SOURCE.url, SOURCE.cacheName);
  const result = parseOz2Designated(readWorkbook(buf), loadEligible());

  if (SOURCE.expected && result.designations.length !== SOURCE.expected.designated) {
    throw new Error(
      `OZ2 designations: expected ${SOURCE.expected.designated}, got ${result.designations.length}. The file has changed.`
    );
  }
  if (result.duplicates > 0) log(`oz2 designations: ${result.duplicates} duplicate rows ignored`);
  if (result.notEligible.length > 0) {
    log(`oz2 designations: ${result.notEligible.length} NOT on Treasury's eligible list (kept, flagged): ${result.notEligible.slice(0, 20).join(", ")}`);
  }
  for (const s of result.byState.filter((x) => x.overCap)) {
    log(`oz2 designations: state ${s.stateFips} designated ${s.designated}, over its cap of ${s.cap} (${s.eligibleLics} eligible LICs)`);
  }

  writeCsv(
    path.join(CLEAN_DIR, "oz2_designated.csv"),
    ["geoid20", "state_fips", "on_eligible_list"],
    result.designations.map((d) => [d.geoid20, d.stateFips, d.onEligibleList])
  );
  log(`oz2 designations: ${result.designations.length.toLocaleString("en-US")} tracts in ${result.byState.length} jurisdictions`);
  return result;
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  buildOz2Designated().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
