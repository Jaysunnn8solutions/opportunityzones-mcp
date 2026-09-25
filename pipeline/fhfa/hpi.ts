/**
 * FHFA annual house price index by census tract.
 *
 * Repeat-sales based, so an index exists only where enough homes resold, and
 * that thins out in exactly the low-income tracts OZ analysis is about. Missing
 * stays missing: FHFA's own FAQ criticises products that silently substitute a
 * county or ZIP index for a missing tract one.
 *
 * FHFA's FAQ says tracts are on 2020 boundaries, and that is checked here
 * against the 2020-2024 ACS tract list rather than assumed.
 *
 * Only the level (`hpi`) is kept: the ratio of two years' levels is the price
 * change between them regardless of the index's base year.
 *
 * Output: pipeline/clean/fhfa_hpi.csv  geoid20, hpi_2010 ... hpi_2024
 */

import path from "node:path";
import { CLEAN_DIR } from "../config";
import { fetchCached, log } from "../lib/http";
import { readCsv, writeCsv } from "../lib/table";

const URL = "https://www.fhfa.gov/hpi/download/annual/hpi_at_tract.csv";
export const HPI_YEARS = Array.from({ length: 15 }, (_, i) => 2010 + i); // 2010-2024

export async function buildFhfaHpi(): Promise<void> {
  const buf = await fetchCached(URL, "fhfa-hpi-at-tract.csv", { timeoutMs: 600_000 });
  const text = buf.toString("utf8");
  const lines = text.split(/\r?\n/);
  const header = lines[0].split(",");
  const iTract = header.indexOf("tract");
  const iYear = header.indexOf("year");
  const iHpi = header.indexOf("hpi");
  if (iTract < 0 || iYear < 0 || iHpi < 0) throw new Error(`FHFA header changed: ${lines[0]}`);

  const byTract = new Map<string, Map<number, number>>();
  let blankLatest = 0;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const f = line.split(",");
    const year = Number(f[iYear]);
    if (!HPI_YEARS.includes(year)) {
      if (year === 2025 && f[iHpi] === "") blankLatest++;
      continue;
    }
    const v = f[iHpi] === "" ? NaN : Number(f[iHpi]);
    const geoid = f[iTract].padStart(11, "0");
    let m = byTract.get(geoid);
    if (!m) {
      m = new Map();
      byTract.set(geoid, m);
    }
    if (Number.isFinite(v) && v > 0) m.set(year, v);
  }

  // Verify the boundary vintage instead of trusting the FAQ.
  const acs2024 = readCsv(path.join(CLEAN_DIR, "acs_2024.csv"));
  const acs2016 = readCsv(path.join(CLEAN_DIR, "acs_2016.csv"));
  const ids2020 = new Set(acs2024.rows.map((r) => r[0]));
  const ids2010 = new Set(acs2016.rows.map((r) => r[0]));
  const tracts = [...byTract.keys()];
  const in2020 = tracts.filter((t) => ids2020.has(t)).length;
  const in2010Only = tracts.filter((t) => ids2010.has(t) && !ids2020.has(t)).length;
  log(
    `fhfa: ${tracts.length.toLocaleString("en-US")} tracts; ${in2020.toLocaleString("en-US")} match 2020 tract GEOIDs, ` +
      `${in2010Only.toLocaleString("en-US")} match only 2010 GEOIDs`
  );
  if (in2020 / tracts.length < 0.95) {
    throw new Error("FHFA tract GEOIDs do not look like 2020 tracts; check the file's boundary vintage");
  }

  const rows = tracts.sort().map((t) => {
    const m = byTract.get(t)!;
    return [t, ...HPI_YEARS.map((y) => m.get(y) ?? null)];
  });
  writeCsv(path.join(CLEAN_DIR, "fhfa_hpi.csv"), ["geoid20", ...HPI_YEARS.map((y) => `hpi_${y}`)], rows);

  for (const y of [2012, 2016, 2017, 2024]) {
    const n = rows.filter((r) => r[1 + HPI_YEARS.indexOf(y)] != null).length;
    log(`fhfa: ${y} index present for ${n.toLocaleString("en-US")} tracts (${((n / ids2020.size) * 100).toFixed(1)}% of 2020 tracts)`);
  }
  if (blankLatest > 0) log(`fhfa: ${blankLatest.toLocaleString("en-US")} blank 2025 placeholder rows ignored`);
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  buildFhfaHpi().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
