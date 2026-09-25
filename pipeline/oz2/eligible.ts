/**
 * OZ 2.0 eligible tracts, on 2020 tracts, from Treasury's data transparency
 * file of 2026-03-23.
 *
 * Kept with Treasury's own inputs and comparison-area incomes, because those are
 * what let `lib/oz/eligibility.ts` be checked against the official verdict row
 * by row (`scripts/validate-eligibility.ts`).
 *
 * Units, which the data dictionary gets half wrong: poverty_rate is a percent
 * (17.4), mfi_ratio is a fraction (0.939) even though the dictionary calls it a
 * percent. Both are stored here as shares.
 *
 * Output: pipeline/clean/oz2_eligible.csv
 */

import path from "node:path";
import { CLEAN_DIR } from "../config";
import { findHeaderRow, readWorkbook } from "../lib/archive";
import { fetchCached, log } from "../lib/http";
import { tractGeoid, writeCsv } from "../lib/table";

const URL =
  "https://home.treasury.gov/system/files/131/OZ2-Eligible-LIC-Tracts-Data-Transparency-03232026.xlsx";

/** Treasury's own counts, asserted so a changed file cannot slip through. */
const EXPECTED = { rows: 85_529, eligible: 25_332, rural: 28_711, eligibleAndRural: 8_334 };

function n(v: unknown): number | null {
  if (v == null || v === "") return null;
  const x = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isFinite(x) ? x : null;
}

export async function buildOz2Eligible(): Promise<void> {
  const buf = await fetchCached(URL, "oz2-eligible-lic-tracts-2026-03-23.xlsx");
  const sheets = readWorkbook(buf);
  const data = sheets.find((s) => findHeaderRow(s.rows, [/census_tract_number/, /eligible_lic/]) >= 0);
  if (!data) throw new Error("No sheet with census_tract_number and eligible_lic columns");
  const at = findHeaderRow(data.rows, [/census_tract_number/, /eligible_lic/]);
  const header = data.rows[at].map((c) => String(c ?? "").trim());
  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`Column ${name} missing from Treasury file`);
    return i;
  };
  const c = {
    geoid: col("census_tract_number"),
    state: col("state"),
    county: col("county"),
    cbsa: col("cbsa"),
    poverty: col("poverty_rate"),
    mfi: col("mfi"),
    stateMfi: col("state_mfi"),
    cbsaMfi: col("cbsa_mfi"),
    areaMfi: col("area_mfi"),
    ratio: col("mfi_ratio"),
    eligible: col("eligible_lic"),
    rural: col("rural_status"),
  };

  const rows: Array<Array<string | number | boolean | null>> = [];
  let eligible = 0;
  let rural = 0;
  let both = 0;
  for (const r of data.rows.slice(at + 1)) {
    const geoid = tractGeoid(r[c.geoid]);
    if (!geoid) continue;
    const e = n(r[c.eligible]) === 1;
    const ru = n(r[c.rural]) === 1;
    if (e) eligible++;
    if (ru) rural++;
    if (e && ru) both++;
    const pov = n(r[c.poverty]);
    rows.push([
      geoid,
      String(r[c.state] ?? "").trim(),
      String(r[c.county] ?? "").trim(),
      String(r[c.cbsa] ?? "").trim() || null,
      pov == null ? null : pov / 100,
      n(r[c.mfi]),
      n(r[c.stateMfi]),
      n(r[c.cbsaMfi]),
      n(r[c.areaMfi]),
      n(r[c.ratio]),
      e,
      ru,
    ]);
  }

  const got = { rows: rows.length, eligible, rural, eligibleAndRural: both };
  for (const [k, v] of Object.entries(EXPECTED)) {
    const g = got[k as keyof typeof got];
    if (g !== v) throw new Error(`Treasury OZ2 file: expected ${k}=${v}, got ${g}. The file has changed.`);
  }

  writeCsv(
    path.join(CLEAN_DIR, "oz2_eligible.csv"),
    [
      "geoid20",
      "state_name",
      "county_name",
      "cbsa_name",
      "poverty_rate",
      "mfi",
      "state_mfi",
      "cbsa_mfi",
      "area_mfi",
      "mfi_ratio",
      "eligible",
      "rural",
    ],
    rows
  );
  log(`oz2 tracts ${rows.length.toLocaleString("en-US")}, eligible ${eligible.toLocaleString("en-US")}, rural ${rural.toLocaleString("en-US")}, both ${both.toLocaleString("en-US")}`);
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  buildOz2Eligible().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
