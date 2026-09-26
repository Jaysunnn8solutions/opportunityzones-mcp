/**
 * Earthquake shaking the building code designs for at a site, from the USGS
 * Seismic Design Maps web service (ASCE 7-22).
 *
 * Reports the Seismic Design Category (A, lowest, to F) and the design
 * spectral accelerations behind it, for an ordinary building (Risk Category
 * II) on the code's default soil assumption. The category sets how much
 * seismic detailing the building code requires, so it bears on construction
 * cost at a site, and it is the authoritative, citable measure of the hazard.
 *
 * Privacy: the service is sent the point rounded to two decimals (~1 km), as
 * for the other live sources. Design ground motions vary over tens of
 * kilometres, so the rounding does not change the answer in practice, and the
 * response says it describes the area around the site.
 *
 * Informational only: a structural engineer determines design values for a
 * real project, with the site's measured soil class.
 */

import { fetchJson, SourceError } from "../http";

export const SOURCE_ID = "usgsSeismicDesign";

const SERVICE = "https://earthquake.usgs.gov/ws/designmaps/asce7-22.json";

export type SeismicDesignCategory = "A" | "B" | "C" | "D" | "E" | "F";

export interface SeismicDesign {
  /** Seismic Design Category for Risk Category II on the default site class. */
  category: SeismicDesignCategory;
  /** Design 5%-damped spectral response acceleration, short period (g). */
  sds: number | null;
  /** Design spectral response acceleration at 1 second (g). */
  sd1: number | null;
  /** Site-modified peak ground acceleration, MCE_G (g). */
  pgaM: number | null;
  description: string;
}

interface DesignMapsResponse {
  request?: { status?: string };
  response?: { data?: Record<string, unknown> };
}

const DESCRIPTIONS: Record<SeismicDesignCategory, string> = {
  A: "Very low seismic hazard: minimal code requirements for earthquake design.",
  B: "Low seismic hazard: modest code requirements for earthquake design.",
  C: "Moderate seismic hazard: the building code requires some earthquake-resistant detailing.",
  D: "High seismic hazard: the building code requires substantial earthquake-resistant design.",
  E: "Very high seismic hazard near a major active fault: stringent code requirements.",
  F: "Very high seismic hazard near a major active fault: the most stringent code requirements.",
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Read the USGS response. Exported for tests. */
export function parseDesignMaps(body: DesignMapsResponse): SeismicDesign {
  if (body.request?.status && body.request.status !== "success") {
    throw new SourceError(SOURCE_ID, "rejected", `status ${body.request.status}`);
  }
  const d = body.response?.data;
  const sdc = typeof d?.sdc === "string" ? d.sdc.trim().toUpperCase() : "";
  if (!d || !/^[A-F]$/.test(sdc)) throw new SourceError(SOURCE_ID, "bad-response", "no seismic design category");
  const category = sdc as SeismicDesignCategory;
  return { category, sds: num(d.sds), sd1: num(d.sd1), pgaM: num(d.pgam), description: DESCRIPTIONS[category] };
}

export function requestUrl(lon: number, lat: number): string {
  const u = new URL(SERVICE);
  u.searchParams.set("latitude", lat.toFixed(2));
  u.searchParams.set("longitude", lon.toFixed(2));
  u.searchParams.set("riskCategory", "II");
  u.searchParams.set("siteClass", "Default");
  u.searchParams.set("title", "");
  return u.toString();
}

export async function seismicDesignAt(lon: number, lat: number): Promise<SeismicDesign> {
  if (!(Math.abs(lon) <= 180 && Math.abs(lat) <= 90)) throw new SourceError(SOURCE_ID, "rejected", "coordinates out of range");
  const body = await fetchJson<DesignMapsResponse>(requestUrl(lon, lat), { sourceId: SOURCE_ID, timeoutMs: 12_000 });
  return parseDesignMaps(body);
}
