/**
 * County labor market from the Census Bureau's Quarterly Workforce Indicators
 * (QWI, LEHD program): employment, hires, separations and average monthly
 * earnings, all private and public ownership (ownercode A05).
 *
 * County-level, never presented as tract-level: it describes the labor market
 * around a tract. LODES (in the pipeline) stays the tract-level jobs count.
 *
 * States publish on different schedules, so a range of quarters is requested
 * and the newest quarter with each measure is used; the newest quarter is often
 * partly released (earnings and separations arrive later). Employment change
 * compares the same quarter a year earlier, so seasonality does not show as
 * growth. Earnings are nominal dollars.
 *
 * Needs CENSUS_API_KEY in the environment (the key rides in the query string,
 * and ../http.ts never puts a URL in an error).
 */

import { fetchJson, SourceError } from "../http";

export const SOURCE_ID = "censusQwi";

const ENDPOINT = "https://api.census.gov/data/timeseries/qwi/se";

export interface QwiSummary {
  county: string;
  /** Quarter of the employment figure, e.g. "2025-Q4". */
  quarter: string;
  employment: number;
  /** Change from the same quarter a year earlier, as a share; null if that quarter is missing. */
  employmentChangeYoY: number | null;
  /** Hires in the quarter as a share of employment. */
  hiresRate: number | null;
  /** Average monthly earnings of stable employees, nominal dollars, and its quarter. */
  monthlyEarnings: number | null;
  earningsQuarter: string | null;
}

type Row = { time: string; emp: number | null; hires: number | null; earn: number | null };

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function shiftYear(quarter: string, years: number): string {
  const [y, q] = quarter.split("-");
  return `${Number(y) + years}-${q}`;
}

export function summariseQwi(json: unknown): QwiSummary | null {
  if (!Array.isArray(json) || !Array.isArray(json[0])) {
    throw new SourceError(SOURCE_ID, "bad-response", "expected an array of rows");
  }
  const [header, ...raw] = json as string[][];
  const at = (n: string) => header.indexOf(n);
  const [iEmp, iHir, iEarn, iTime, iState, iCounty] = ["Emp", "HirA", "EarnS", "time", "state", "county"].map(at);
  if ([iEmp, iHir, iEarn, iTime].some((i) => i < 0)) throw new SourceError(SOURCE_ID, "bad-response", "missing QWI columns");
  const rows: Row[] = raw
    .map((r) => ({ time: r[iTime], emp: num(r[iEmp]), hires: num(r[iHir]), earn: num(r[iEarn]) }))
    .sort((a, b) => (a.time < b.time ? -1 : 1));
  const byTime = new Map(rows.map((r) => [r.time, r]));
  const latest = [...rows].reverse().find((r) => r.emp != null && r.emp > 0);
  if (!latest) return null;
  const earn = [...rows].reverse().find((r) => r.earn != null);
  const prior = byTime.get(shiftYear(latest.time, -1))?.emp;
  return {
    county: raw[0] ? `${raw[0][iState]}${raw[0][iCounty]}` : "",
    quarter: latest.time,
    employment: latest.emp!,
    employmentChangeYoY: prior ? Math.round(((latest.emp! - prior) / prior) * 1e4) / 1e4 : null,
    hiresRate: latest.hires != null ? Math.round((latest.hires / latest.emp!) * 1e4) / 1e4 : null,
    monthlyEarnings: earn?.earn ?? null,
    earningsQuarter: earn?.time ?? null,
  };
}

/** QWI summary for a county (5-digit FIPS). `fromYear` bounds the quarters requested. */
export async function countyLaborMarket(countyFips: string, fromYear = new Date().getUTCFullYear() - 3): Promise<QwiSummary | null> {
  if (!/^\d{5}$/.test(countyFips)) throw new SourceError(SOURCE_ID, "rejected", "county must be a 5-digit FIPS code");
  const key = process.env.CENSUS_API_KEY?.trim();
  if (!key) throw new SourceError(SOURCE_ID, "missing-key", "CENSUS_API_KEY is not set");
  const u = new URL(ENDPOINT);
  u.searchParams.set("get", "Emp,HirA,Sep,EarnS");
  u.searchParams.set("for", `county:${countyFips.slice(2)}`);
  u.searchParams.set("in", `state:${countyFips.slice(0, 2)}`);
  u.searchParams.set("time", `from ${fromYear}-Q1 to ${fromYear + 4}-Q4`);
  u.searchParams.set("ownercode", "A05");
  u.searchParams.set("key", key);
  const text = await fetchJson<unknown>(u.toString(), { sourceId: SOURCE_ID }).catch((err: unknown) => {
    // A bad key comes back as an HTML page, which surfaces here as bad-response.
    if (err instanceof SourceError && err.kind === "bad-response") {
      throw new SourceError(SOURCE_ID, "rejected", "Census API did not return data; check CENSUS_API_KEY");
    }
    throw err;
  });
  return summariseQwi(text);
}
