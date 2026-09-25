/**
 * County unemployment rate from BLS Local Area Unemployment Statistics (LAUS),
 * via the BLS Public Data API v2.
 *
 * STATUS: parsing verified against a real LAUS response (recorded with the
 * keyless v1 API, same format); live v2 calls need BLS_API_KEY, which is not set
 * yet. Without it the source reports "missing-key" by name. The keyless v1 API
 * is not used at runtime: it allows 25 requests a day.
 *
 * County LAUS figures are not seasonally adjusted, so the change is against the
 * same month a year earlier. Annual averages (period M13) are skipped, months
 * BLS could not collect ("-", e.g. October 2025 during the lapse in
 * appropriations) are missing, and preliminary values are flagged.
 *
 * The key is sent in the POST body, never in a URL.
 */

import { fetchJson, SourceError } from "../http";

export const SOURCE_ID = "blsLaus";

const ENDPOINT = "https://api.bls.gov/publicAPI/v2/timeseries/data/";

export interface LausSummary {
  county: string;
  /** e.g. "2026-07". */
  month: string;
  unemploymentRate: number;
  preliminary: boolean;
  /** Percentage-point change from the same month a year earlier. */
  changeFromYearAgo: number | null;
}

interface BlsPoint {
  year: string;
  period: string;
  value: string;
  footnotes?: Array<{ code?: string }>;
}
interface BlsResponse {
  status?: string;
  message?: string[];
  Results?: { series?: Array<{ seriesID: string; data: BlsPoint[] }> };
}

export const seriesId = (county: string) => `LAUCN${county}0000000003`;

export function summariseLaus(json: unknown, county: string): LausSummary | null {
  const body = json as BlsResponse;
  if (body?.status !== "REQUEST_SUCCEEDED") {
    throw new SourceError(SOURCE_ID, "rejected", `BLS status ${body?.status ?? "missing"}`);
  }
  const data = body.Results?.series?.[0]?.data ?? [];
  const months = data
    .filter((d) => /^M(0[1-9]|1[0-2])$/.test(d.period))
    .map((d) => ({
      key: `${d.year}-${d.period.slice(1)}`,
      value: Number(d.value),
      preliminary: (d.footnotes ?? []).some((f) => f.code === "P"),
    }))
    .filter((d) => Number.isFinite(d.value))
    .sort((a, b) => (a.key < b.key ? 1 : -1));
  const latest = months[0];
  if (!latest) return null;
  const [y, m] = latest.key.split("-");
  const yearAgo = months.find((d) => d.key === `${Number(y) - 1}-${m}`);
  return {
    county,
    month: latest.key,
    unemploymentRate: latest.value,
    preliminary: latest.preliminary,
    changeFromYearAgo: yearAgo ? Math.round((latest.value - yearAgo.value) * 10) / 10 : null,
  };
}

export async function countyUnemployment(county: string, today = new Date()): Promise<LausSummary | null> {
  if (!/^\d{5}$/.test(county)) throw new SourceError(SOURCE_ID, "rejected", "county must be a 5-digit FIPS code");
  const key = process.env.BLS_API_KEY?.trim();
  if (!key) throw new SourceError(SOURCE_ID, "missing-key", "BLS_API_KEY is not set");
  const endYear = today.getUTCFullYear();
  const json = await fetchJson<BlsResponse>(ENDPOINT, {
    sourceId: SOURCE_ID,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seriesid: [seriesId(county)], startyear: String(endYear - 2), endyear: String(endYear), registrationkey: key }),
    },
  });
  return summariseLaus(json, county);
}
