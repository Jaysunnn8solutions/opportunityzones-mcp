/**
 * Annual CPI-U, for putting dollars from different years on one footing.
 *
 * Census recommends CPI-U-RS for adjusting ACS dollars, but BLS serves that
 * research file only to browsers (HTTP 403 to any script, user agent or not).
 * CPI-U through BLS's public API is the reproducible substitute; since 2000 the
 * two series move almost identically, and every real-terms figure in the
 * analysis says which deflator it used.
 *
 * The keyless v1 API returns at most 10 years per request and 25 requests a day,
 * so the result is cached and the request count kept to two.
 *
 * Output: pipeline/clean/cpi_u.csv  (year, cpi_u annual average)
 */

import path from "node:path";
import { CLEAN_DIR } from "./config";
import { fetchCached, log } from "./lib/http";
import { writeCsv } from "./lib/table";

const SERIES = "CUUR0000SA0";
const API = "https://api.bls.gov/publicAPI/v1/timeseries/data/";

interface BlsResponse {
  status: string;
  message?: string[];
  Results?: { series: Array<{ data: Array<{ year: string; period: string; value: string }> }> };
}

/** Mean of the twelve monthly values. Refuses a year with a gap. */
export function annualAverages(
  points: ReadonlyArray<{ year: string; period: string; value: string }>
): Map<number, number> {
  const byYear = new Map<number, number[]>();
  for (const p of points) {
    if (!/^M(0[1-9]|1[0-2])$/.test(p.period)) continue;
    const y = Number(p.year);
    const v = Number(p.value);
    if (!Number.isFinite(v)) continue;
    const list = byYear.get(y) ?? [];
    list.push(v);
    byYear.set(y, list);
  }
  const out = new Map<number, number>();
  for (const [y, vs] of byYear) {
    if (vs.length !== 12) continue;
    out.set(y, Math.round((vs.reduce((a, b) => a + b, 0) / 12) * 1000) / 1000);
  }
  return out;
}

async function fetchWindow(start: number, end: number) {
  const body = JSON.stringify({ seriesid: [SERIES], startyear: String(start), endyear: String(end) });
  const buf = await fetchCached(API, `bls-${SERIES}-${start}-${end}.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const json = JSON.parse(buf.toString("utf8")) as BlsResponse;
  if (json.status !== "REQUEST_SUCCEEDED" || !json.Results) {
    throw new Error(`BLS API: ${json.status} ${(json.message ?? []).join("; ")}`);
  }
  return json.Results.series[0].data;
}

export async function buildCpi(): Promise<Map<number, number>> {
  const points = [...(await fetchWindow(2005, 2014)), ...(await fetchWindow(2015, 2024))];
  const annual = annualAverages(points);
  for (const y of [2010, 2016, 2017, 2024]) {
    if (!annual.has(y)) throw new Error(`CPI-U annual average missing for ${y}`);
  }
  const years = [...annual.keys()].sort((a, b) => a - b);
  writeCsv(path.join(CLEAN_DIR, "cpi_u.csv"), ["year", "cpi_u"], years.map((y) => [y, annual.get(y)!]));
  log(`cpi-u annual averages ${years[0]}-${years.at(-1)}; 2016 ${annual.get(2016)}, 2024 ${annual.get(2024)}`);
  return annual;
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  buildCpi().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
