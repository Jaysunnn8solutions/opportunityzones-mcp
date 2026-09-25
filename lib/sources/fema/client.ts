/**
 * FEMA flood zone at a site, from the National Flood Hazard Layer (NFHL).
 *
 * Reports the effective flood zone at the point: whether it lies in a Special
 * Flood Hazard Area (the 1%-annual-chance floodplain, zones A* and V*), in the
 * 0.2%-annual-chance zone, or in a minimal-hazard zone, with the base flood
 * elevation where FEMA publishes one. Where FEMA has no digital flood map the
 * answer is "no digital FIRM", never "no risk".
 *
 * Privacy: a flood zone depends on the exact location, so rounding the query
 * point alone would give wrong answers. Instead FEMA is sent only a small box
 * around the point rounded to two decimals (~1 km), just large enough to cover
 * the rounding; it returns the zone polygons in that box, and the exact point
 * is tested against them here. FEMA never receives the site itself.
 *
 * Informational only: this is FEMA's mapped zone, not a flood determination for
 * insurance or lending, which only an official determination provides.
 */

import { fetchJson, SourceError } from "../http";

export const SOURCE_ID = "femaNfhl";

const SERVICE = "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer";
const ZONES_LAYER = 28;
const AVAILABILITY_LAYER = 0;
/** Half-width of the box: covers a point moved up to 0.005° by rounding, plus a margin. */
const BOX_HALF_DEG = 0.006;

export type FloodCategory = "sfha" | "moderate" | "minimal" | "undetermined" | "open-water";

export interface FloodZone {
  status: "mapped" | "no-digital-firm" | "not-determined";
  zone: string | null;
  subtype: string | null;
  category: FloodCategory | null;
  /** In the 1%-annual-chance Special Flood Hazard Area. */
  sfha: boolean | null;
  /** Base flood elevation in feet, where published. */
  baseFloodElevationFt: number | null;
  description: string;
}

interface Feature {
  attributes: Record<string, unknown>;
  geometry?: { rings?: number[][][] };
}
interface QueryResponse {
  features?: Feature[];
  count?: number;
  error?: { code: number; message: string };
}

export function categorise(zone: string, subtype: string | null): FloodCategory {
  const z = zone.toUpperCase();
  if (/^(A|V)/.test(z)) return "sfha";
  if (z === "D") return "undetermined";
  if (z === "OPEN WATER") return "open-water";
  if (z === "X" && subtype && /0\.2 PCT/i.test(subtype)) return "moderate";
  return "minimal";
}

const DESCRIPTIONS: Record<FloodCategory, string> = {
  sfha: "In FEMA's Special Flood Hazard Area (1% annual chance of flooding).",
  moderate: "In FEMA's 0.2% annual chance flood hazard area (moderate).",
  minimal: "Outside FEMA's mapped 1% and 0.2% annual chance floodplains (minimal hazard as mapped).",
  undetermined: "FEMA zone D: flood hazard possible but undetermined.",
  "open-water": "Open water on FEMA's flood map.",
};

/** Even-odd point-in-polygon across all rings (handles holes). */
export function inside(lon: number, lat: number, rings: readonly number[][][]): boolean {
  let hit = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
    }
  }
  return hit;
}

/** The zone at the exact point from the polygons returned for the box, or null if none contains it. */
export function zoneAt(features: readonly Feature[], lon: number, lat: number): FloodZone | null {
  for (const f of features) {
    if (!f.geometry?.rings?.length || !inside(lon, lat, f.geometry.rings)) continue;
    const zone = String(f.attributes.FLD_ZONE ?? "").trim();
    if (!zone) continue;
    const subtypeRaw = f.attributes.ZONE_SUBTY;
    const subtype = typeof subtypeRaw === "string" && subtypeRaw.trim() ? subtypeRaw.trim() : null;
    const bfe = Number(f.attributes.STATIC_BFE);
    const category = categorise(zone, subtype);
    const levee = subtype != null && /LEVEE/i.test(subtype);
    return {
      status: "mapped",
      zone,
      subtype,
      category,
      sfha: f.attributes.SFHA_TF === "T" ? true : f.attributes.SFHA_TF === "F" ? false : category === "sfha",
      baseFloodElevationFt: Number.isFinite(bfe) && bfe > -9000 ? bfe : null,
      description: levee
        ? "Mapped by FEMA as an area with reduced flood risk because of a levee. The risk is reduced, not removed: levees can be overtopped or fail."
        : DESCRIPTIONS[category],
    };
  }
  return null;
}

function box(lon: number, lat: number): string {
  const x = Number(lon.toFixed(2));
  const y = Number(lat.toFixed(2));
  const f = (n: number) => n.toFixed(4);
  return [f(x - BOX_HALF_DEG), f(y - BOX_HALF_DEG), f(x + BOX_HALF_DEG), f(y + BOX_HALF_DEG)].join(",");
}

function queryUrl(layer: number, lon: number, lat: number, params: Record<string, string>): string {
  const u = new URL(`${SERVICE}/${layer}/query`);
  u.searchParams.set("geometry", box(lon, lat));
  u.searchParams.set("geometryType", "esriGeometryEnvelope");
  u.searchParams.set("inSR", "4326");
  u.searchParams.set("spatialRel", "esriSpatialRelIntersects");
  u.searchParams.set("f", "json");
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

async function query(url: string): Promise<QueryResponse> {
  const body = await fetchJson<QueryResponse>(url, { sourceId: SOURCE_ID, timeoutMs: 12_000 });
  if (body.error) throw new SourceError(SOURCE_ID, "rejected", `ArcGIS error ${body.error.code}`);
  return body;
}

export async function floodZoneAt(lon: number, lat: number): Promise<FloodZone> {
  if (!(Math.abs(lon) <= 180 && Math.abs(lat) <= 90)) throw new SourceError(SOURCE_ID, "rejected", "coordinates out of range");
  const [zones, availability] = await Promise.all([
    query(
      queryUrl(ZONES_LAYER, lon, lat, {
        outFields: "FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE",
        returnGeometry: "true",
        outSR: "4326",
        maxAllowableOffset: "0.00005",
      })
    ),
    query(queryUrl(AVAILABILITY_LAYER, lon, lat, { returnCountOnly: "true" })),
  ]);
  if (!Array.isArray(zones.features)) throw new SourceError(SOURCE_ID, "bad-response", "no features array");
  const found = zoneAt(zones.features, lon, lat);
  if (found) return found;
  const noFirm = (availability.count ?? 0) === 0 && zones.features.length === 0;
  return {
    status: noFirm ? "no-digital-firm" : "not-determined",
    zone: null,
    subtype: null,
    category: null,
    sfha: null,
    baseFloodElevationFt: null,
    description: noFirm
      ? "FEMA has no digital flood map (FIRM) here. This is not a finding of no flood risk."
      : "The site falls in a gap between FEMA's mapped flood zone polygons; the zone could not be determined.",
  };
}
