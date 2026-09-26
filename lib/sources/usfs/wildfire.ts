/**
 * Wildfire likelihood around a site, from the USDA Forest Service's Wildfire
 * Risk to Communities burn probability (FSim simulation, 270 m cells).
 *
 * Reports the annual burn probability: the modelled chance, in a given year,
 * that a wildfire reaches the location, as a probability and as "about 1 in N
 * years". It is the authoritative national measure of wildfire likelihood, so
 * it is reported as published, with no classes or scoring of our own.
 *
 * Two things it is not, both said in the answer:
 *  - A value of zero means the national simulation found no wildland fire
 *    reaching that cell (typical of dense urban cores and farmland), not that
 *    fire cannot happen there.
 *  - It describes the landscape as of the end of 2020 (LANDFIRE 2020 fuels).
 *
 * Privacy: the service is asked for the cell at the point rounded to two
 * decimals (~1 km), as for the other live sources, so the answer describes the
 * area around the site. At 270 m cells the modelled probability is itself an
 * area measure.
 */

import { fetchJson, SourceError } from "../http";

export const SOURCE_ID = "usfsWildfireRisk";

const SERVICE = "https://apps.fs.usda.gov/fsgisx01/rest/services/RDW_Wildfire/RMRS_WRC_BurnProbability/ImageServer";

export interface WildfireLikelihood {
  status: "modelled" | "not-covered";
  /** Annual burn probability, 0-1. Null outside the model's coverage. */
  burnProbability: number | null;
  /** Rounded "1 in N years", or null when the probability is zero or missing. */
  oneInYears: number | null;
  description: string;
}

const NONE_MODELLED =
  "No wildland fire reached this area in the national simulation (common in dense urban areas and farmland); this is not a finding that fire cannot occur.";

interface IdentifyResponse {
  value?: string;
  error?: { code: number; message: string };
}

/** Read an ImageServer identify response. Exported for tests. */
export function parseIdentify(body: IdentifyResponse): WildfireLikelihood {
  if (body.error) throw new SourceError(SOURCE_ID, "rejected", `ArcGIS error ${body.error.code}`);
  if (typeof body.value !== "string") throw new SourceError(SOURCE_ID, "bad-response", "no pixel value");
  const raw = body.value.trim();
  if (raw === "" || /^nodata$/i.test(raw)) {
    return {
      status: "not-covered",
      burnProbability: null,
      oneInYears: null,
      description: "Outside the Forest Service wildfire model's coverage (for example, open water or a territory it does not model).",
    };
  }
  const bp = Number(raw);
  if (!Number.isFinite(bp) || bp < 0 || bp > 1) throw new SourceError(SOURCE_ID, "bad-response", "pixel value is not a probability");
  const oneInYears = bp > 0 ? oneIn(bp) : null;
  return {
    status: "modelled",
    burnProbability: bp,
    oneInYears,
    description:
      oneInYears == null
        ? NONE_MODELLED
        : `Modelled annual chance of wildfire reaching this area: ${(bp * 100).toPrecision(2)}%, about 1 in ${oneInYears.toLocaleString("en-US")} years.`,
  };
}

/** 1/bp rounded to two significant figures, so it does not read as more precise than the model. */
export function oneIn(bp: number): number {
  const n = 1 / bp;
  const mag = 10 ** Math.max(0, Math.floor(Math.log10(n)) - 1);
  return Math.round(n / mag) * mag;
}

export function identifyUrl(lon: number, lat: number): string {
  const u = new URL(`${SERVICE}/identify`);
  u.searchParams.set("geometry", JSON.stringify({ x: Number(lon.toFixed(2)), y: Number(lat.toFixed(2)), spatialReference: { wkid: 4326 } }));
  u.searchParams.set("geometryType", "esriGeometryPoint");
  u.searchParams.set("returnGeometry", "false");
  u.searchParams.set("returnCatalogItems", "false");
  u.searchParams.set("f", "json");
  return u.toString();
}

export async function wildfireLikelihoodAt(lon: number, lat: number): Promise<WildfireLikelihood> {
  if (!(Math.abs(lon) <= 180 && Math.abs(lat) <= 90)) throw new SourceError(SOURCE_ID, "rejected", "coordinates out of range");
  const body = await fetchJson<IdentifyResponse>(identifyUrl(lon, lat), { sourceId: SOURCE_ID, timeoutMs: 12_000 });
  return parseIdentify(body);
}
