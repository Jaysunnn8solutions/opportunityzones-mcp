/**
 * Wildfire likelihood around a site, from the USDA Forest Service's Wildfire
 * Risk to Communities burn probability (FSim simulation, 270 m cells).
 *
 * Reports the annual burn probability: the modeled chance, in a given year,
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
 * area around the site. At 270 m cells the modeled probability is itself an
 * area measure.
 */

import { fetchJson, SourceError } from "../http";

export const SOURCE_ID = "usfsWildfireRisk";

/**
 * The same Forest Service raster, published in two places. The federal
 * GeoPlatform copy is tried first: the Forest Service's own server refused
 * every request from GitHub's runners with HTTP 403 (checked 2026-09-26).
 */
export const SERVICES = [
  "https://imagery.geoplatform.gov/iipp/rest/services/Fire_Aviation/USFS_EDW_RMRS_WRC_BurnProbability/ImageServer",
  "https://apps.fs.usda.gov/fsgisx01/rest/services/RDW_Wildfire/RMRS_WRC_BurnProbability/ImageServer",
] as const;

/**
 * What one pixel unit means as an annual probability, per host.
 *
 * The GeoPlatform copy stores burn probability as unsigned 16-bit integers:
 * its service reports values 0-1352 with a mean of about 30 (read live
 * 2026-09-26). Only a factor of 10,000 fits the national model's known range
 * (up to ~0.135 a year, mean ~0.003); 100,000 would cap the country at 1.35%
 * and 1,000 would exceed 100%. The Forest Service copy is read as the
 * probability itself. `parseIdentify` rejects anything that does not come out
 * between 0 and 1, so a change in either service fails loudly.
 */
export const VALUE_SCALE: Record<(typeof SERVICES)[number], number> = {
  [SERVICES[0]]: 1e-4,
  [SERVICES[1]]: 1,
};

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
export function parseIdentify(body: IdentifyResponse, scale = 1): WildfireLikelihood {
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
  const bp = Number(raw) * scale;
  if (!Number.isFinite(bp) || bp < 0 || bp > 1) throw new SourceError(SOURCE_ID, "bad-response", "pixel value is not a probability");
  const oneInYears = bp > 0 ? oneIn(bp) : null;
  return {
    status: "modelled",
    burnProbability: bp,
    oneInYears,
    description:
      oneInYears == null
        ? NONE_MODELLED
        : `Modeled annual chance of wildfire reaching this area: ${(bp * 100).toPrecision(2)}%, about 1 in ${oneInYears.toLocaleString("en-US")} years.`,
  };
}

/** 1/bp rounded to two significant figures, so it does not read as more precise than the model. */
export function oneIn(bp: number): number {
  const n = 1 / bp;
  const mag = 10 ** Math.max(0, Math.floor(Math.log10(n)) - 1);
  return Math.round(n / mag) * mag;
}

export function identifyUrl(lon: number, lat: number, service: string = SERVICES[0]): string {
  const u = new URL(`${service}/identify`);
  u.searchParams.set("geometry", JSON.stringify({ x: Number(lon.toFixed(2)), y: Number(lat.toFixed(2)), spatialReference: { wkid: 4326 } }));
  u.searchParams.set("geometryType", "esriGeometryPoint");
  u.searchParams.set("returnGeometry", "false");
  u.searchParams.set("returnCatalogItems", "false");
  u.searchParams.set("f", "json");
  return u.toString();
}

export async function wildfireLikelihoodAt(lon: number, lat: number): Promise<WildfireLikelihood> {
  if (!(Math.abs(lon) <= 180 && Math.abs(lat) <= 90)) throw new SourceError(SOURCE_ID, "rejected", "coordinates out of range");
  let last: unknown;
  for (const service of SERVICES) {
    try {
      const body = await fetchJson<IdentifyResponse>(identifyUrl(lon, lat, service), { sourceId: SOURCE_ID, timeoutMs: 10_000, retries: 0 });
      return parseIdentify(body, VALUE_SCALE[service]);
    } catch (err) {
      // A malformed answer is a real problem; only an unreachable or refusing host falls through.
      if (err instanceof SourceError && err.kind === "bad-response") throw err;
      last = err;
    }
  }
  throw last;
}
