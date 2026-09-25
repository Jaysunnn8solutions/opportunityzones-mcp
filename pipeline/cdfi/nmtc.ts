/**
 * New Markets Tax Credit low-income community (LIC) eligibility by 2020 tract,
 * from the CDFI Fund's 2016-2020 ACS file (in effect since 2023-09-01).
 *
 * Why it matters here: NMTC is a federal credit commonly paired with OZ
 * investment in the same places. The product reports the CDFI Fund's own
 * verdict and inputs; it does not say a project would receive an allocation.
 *
 * A tract is an NMTC LIC if its poverty rate is at least 20%, or its median
 * family income is at most 80% of the applicable benchmark (26 U.S.C. §
 * 45D(e)), or, in a high-migration rural county, at most 85% (the file's second
 * sheet). The CDFI Fund's verdict is taken as published, not recomputed.
 *
 * Geography: 2020 tracts, but the 2016-2020 ACS predates Connecticut's
 * planning regions, so Connecticut GEOIDs are mapped to the planning-region
 * GEOIDs of the rest of the product. The four island areas are released
 * separately by the CDFI Fund and are not in this file; they are reported as
 * not covered rather than as not eligible.
 *
 * Output: pipeline/clean/nmtc_lic.csv
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { CLEAN_DIR } from "../config";
import { findHeaderRow, readWorkbook, type Sheet } from "../lib/archive";
import { fetchCached, log } from "../lib/http";
import { readCsv, tractGeoid, writeCsv } from "../lib/table";

const URL = "https://www.cdfifund.gov/system/files/2023-08/NMTC_2016-2020_ACS_LIC_Sept1_2023.xlsb";

/** The file's own size, asserted so a replaced file cannot slip through. */
const EXPECTED_TRACTS = 85_395;

export interface NmtcTract {
  geoid: string;
  lic: boolean;
  /** Eligible only through the high-migration rural county rule. */
  highMigration: boolean;
  metro: boolean | null;
  povertyRate: number | null;
  /** Tract MFI as a share of the applicable benchmark (0.74 = 74%). */
  mfiRatio: number | null;
  unemploymentRatio: number | null;
}

function num(v: unknown): number | null {
  if (v == null || v === "" || /^n\/?a$/i.test(String(v).trim())) return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

function yes(v: unknown): boolean {
  return /^yes$/i.test(String(v ?? "").trim());
}

function sheetNamed(sheets: Sheet[], re: RegExp): Sheet {
  const s = sheets.find((x) => re.test(x.name));
  if (!s) throw new Error(`No sheet matching ${re} in the NMTC file; have ${sheets.map((x) => x.name).join(", ")}`);
  return s;
}

export function parseNmtc(sheets: Sheet[]): NmtcTract[] {
  const main = sheetNamed(sheets, /^2016-2020$/);
  const at = findHeaderRow(main.rows, [/Census Tract Number/i, /Qualify For NMTC Low-Income Community/i]);
  if (at < 0) throw new Error("NMTC main sheet header row not found");
  const h = main.rows[at].map((c) => String(c ?? ""));
  const col = (re: RegExp) => {
    const i = h.findIndex((x) => re.test(x));
    if (i < 0) throw new Error(`NMTC column ${re} missing`);
    return i;
  };
  const c = {
    geoid: col(/Census Tract Number/i),
    metro: col(/Metro\/Non-metro/i),
    lic: col(/Qualify For NMTC Low-Income Community/i),
    poverty: col(/Poverty Rate %/i),
    mfi: col(/Percent of Benchmarked Median Family Income/i),
    unemp: col(/Unemployment to National Unemployment Ratio\s*$/i),
  };

  const migration = sheetNamed(sheets, /high migration/i);
  const mAt = findHeaderRow(migration.rows, [/Census Tract Number/i]);
  const highMigration = new Set(
    migration.rows
      .slice(mAt + 1)
      .map((r) => tractGeoid(r[0]))
      .filter((g): g is string => g != null)
  );

  const out: NmtcTract[] = [];
  for (const r of main.rows.slice(at + 1)) {
    const geoid = tractGeoid(r[c.geoid]);
    if (!geoid) continue;
    const onMain = yes(r[c.lic]);
    const metroText = String(r[c.metro] ?? "").trim().toLowerCase();
    out.push({
      geoid,
      lic: onMain || highMigration.has(geoid),
      highMigration: !onMain && highMigration.has(geoid),
      metro: metroText === "metro" ? true : metroText.startsWith("non") ? false : null,
      povertyRate: ((p) => (p == null ? null : p / 100))(num(r[c.poverty])),
      mfiRatio: num(r[c.mfi]),
      unemploymentRatio: num(r[c.unemp]),
    });
  }
  return out;
}

export async function buildNmtc(): Promise<void> {
  const ctFile = path.join(CLEAN_DIR, "ct_tracts.csv");
  if (!existsSync(ctFile)) throw new Error("Run pipeline/crosswalk/connecticut.ts first: Connecticut GEOIDs need mapping");
  const ct = readCsv(ctFile);
  const toPlanning = new Map(ct.rows.map((r) => [r[ct.col("geoid_census2020")], r[ct.col("geoid_planning_region")]]));

  const tracts = parseNmtc(readWorkbook(await fetchCached(URL, "nmtc-2016-2020-lic-2023-09-01.xlsb")));
  if (tracts.length !== EXPECTED_TRACTS) {
    throw new Error(`NMTC file: expected ${EXPECTED_TRACTS} tracts, got ${tracts.length}. The file has changed.`);
  }
  let unmappedCt = 0;
  const rows = tracts.map((t) => {
    let geoid = t.geoid;
    if (geoid.startsWith("09")) {
      const mapped = toPlanning.get(geoid);
      if (mapped) geoid = mapped;
      else unmappedCt++;
    }
    return [geoid, t.lic, t.highMigration, t.metro, t.povertyRate, t.mfiRatio, t.unemploymentRatio];
  });
  if (unmappedCt > 0) log(`nmtc: ${unmappedCt} Connecticut tracts had no planning-region GEOID and keep their 2020 code`);

  writeCsv(
    path.join(CLEAN_DIR, "nmtc_lic.csv"),
    ["geoid20", "nmtc_lic", "nmtc_high_migration", "nmtc_metro", "nmtc_poverty_rate", "nmtc_mfi_ratio", "nmtc_unemployment_ratio"],
    rows
  );
  const lic = tracts.filter((t) => t.lic).length;
  const hm = tracts.filter((t) => t.highMigration).length;
  log(`nmtc: ${lic.toLocaleString("en-US")} of ${tracts.length.toLocaleString("en-US")} tracts are LICs (${hm} only via high migration)`);
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  buildNmtc().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
