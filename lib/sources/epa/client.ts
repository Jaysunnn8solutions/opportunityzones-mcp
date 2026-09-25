/**
 * EPA Superfund (National Priorities List) and Brownfields (ACRES) sites near a
 * point, from EPA's "Sites Reporting to EPA" map service (Envirofacts).
 *
 * Privacy: EPA never receives the searched site's exact coordinates. The query
 * goes out for a point rounded to two decimals (about 1 km) with the radius
 * padded to cover the rounding, and the results are filtered here against the
 * exact point. The answer is the same; the third party sees only a coarse area.
 *
 * Presence on either list describes the place's history, not a verdict on any
 * property: a brownfield site may already be cleaned up, and the product does
 * not say otherwise without EPA's record, which each result links to.
 */

import { fetchJson, SourceError } from "../http";

export const SOURCE_ID = "epaSites";

const SERVICE = "https://geopub.epa.gov/arcgis/rest/services/EMEF/efpoints/MapServer";
const LAYERS = { superfund: 0, brownfield: 5 } as const;
export type EpaProgram = keyof typeof LAYERS;

/** Largest search radius accepted, in miles. */
export const MAX_RADIUS_MILES = 5;
/** Rounding to two decimals moves a point at most ~0.49 miles (0.0071° diagonal). */
const ROUNDING_PAD_MILES = 0.5;
const MAX_RESULTS_PER_PROGRAM = 200;

export interface EpaSite {
  program: EpaProgram;
  name: string;
  address: string;
  city: string;
  state: string;
  epaId: string;
  lon: number;
  lat: number;
  distanceMiles: number;
  /** EPA's record for the site. */
  url: string | null;
}

interface RawResponse {
  features?: Array<{ attributes: Record<string, unknown> }>;
  exceededTransferLimit?: boolean;
  error?: { code: number; message: string };
}

export function milesBetween(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(a));
}

export function parseSites(json: unknown, program: EpaProgram, lon: number, lat: number, radiusMiles: number): EpaSite[] {
  const body = json as RawResponse;
  if (body?.error) throw new SourceError(SOURCE_ID, "rejected", `ArcGIS error ${body.error.code}`);
  if (!Array.isArray(body?.features)) throw new SourceError(SOURCE_ID, "bad-response", "no features array");
  const out: EpaSite[] = [];
  for (const { attributes: a } of body.features) {
    const sLat = Number(a.latitude);
    const sLon = Number(a.longitude);
    if (!Number.isFinite(sLat) || !Number.isFinite(sLon)) continue;
    const distanceMiles = milesBetween(lon, lat, sLon, sLat);
    if (distanceMiles > radiusMiles) continue;
    out.push({
      program,
      name: String(a.primary_name ?? "").trim(),
      address: String(a.location_address ?? "").trim(),
      city: String(a.city_name ?? "").trim(),
      state: String(a.state_code ?? "").trim(),
      epaId: String(a.pgm_sys_id ?? "").trim(),
      lon: sLon,
      lat: sLat,
      distanceMiles: Math.round(distanceMiles * 100) / 100,
      url: typeof (a.profile_url ?? a.facility_url) === "string" ? String(a.profile_url ?? a.facility_url) : null,
    });
  }
  return out.sort((x, y) => x.distanceMiles - y.distanceMiles);
}

function queryUrl(program: EpaProgram, lon: number, lat: number, radiusMiles: number): string {
  const u = new URL(`${SERVICE}/${LAYERS[program]}/query`);
  u.searchParams.set("geometry", `${lon.toFixed(2)},${lat.toFixed(2)}`);
  u.searchParams.set("geometryType", "esriGeometryPoint");
  u.searchParams.set("inSR", "4326");
  u.searchParams.set("spatialRel", "esriSpatialRelIntersects");
  u.searchParams.set("distance", String(radiusMiles + ROUNDING_PAD_MILES));
  u.searchParams.set("units", "esriSRUnit_StatuteMile");
  u.searchParams.set(
    "outFields",
    "primary_name,location_address,city_name,state_code,pgm_sys_id,latitude,longitude,facility_url" +
      (program === "superfund" ? ",profile_url" : "")
  );
  u.searchParams.set("returnGeometry", "false");
  u.searchParams.set("resultRecordCount", String(MAX_RESULTS_PER_PROGRAM));
  u.searchParams.set("f", "json");
  return u.toString();
}

export interface SitesNear {
  sites: EpaSite[];
  /** True if EPA capped a result list, so more sites may exist in the radius. */
  truncated: boolean;
}

/** Superfund and brownfield sites within `radiusMiles` of a point, nearest first. */
export async function sitesNear(lon: number, lat: number, radiusMiles = 1): Promise<SitesNear> {
  if (!(Math.abs(lon) <= 180 && Math.abs(lat) <= 90)) {
    throw new SourceError(SOURCE_ID, "rejected", "coordinates out of range");
  }
  if (!(radiusMiles > 0 && radiusMiles <= MAX_RADIUS_MILES)) {
    throw new SourceError(SOURCE_ID, "rejected", `radius must be between 0 and ${MAX_RADIUS_MILES} miles`);
  }
  const programs: EpaProgram[] = ["superfund", "brownfield"];
  const responses = await Promise.all(
    programs.map((p) => fetchJson<RawResponse>(queryUrl(p, lon, lat, radiusMiles), { sourceId: SOURCE_ID }))
  );
  const sites = responses
    .flatMap((json, i) => parseSites(json, programs[i], lon, lat, radiusMiles))
    .sort((x, y) => x.distanceMiles - y.distanceMiles);
  return { sites, truncated: responses.some((r) => r.exceededTransferLimit === true) };
}
