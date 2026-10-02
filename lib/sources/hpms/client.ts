/**
 * Traffic on public roads near a point, from FHWA's Highway Performance
 * Monitoring System (HPMS), national full join, published by the U.S. DOT
 * (ArcGIS organization "usdot", credited to FHWA's Office of Highway Policy
 * Information).
 *
 * Measures, all descriptive: the busiest road segments within a radius, with
 * annual average daily traffic (AADT), truck share (single-unit plus
 * combination trucks), road class and lanes. There is no level-of-service or
 * congestion measure: no national source publishes one.
 *
 * Distance to the nearest Interstate is not queried here: live HPMS queries for
 * it took 2-17 s, so it is computed per tract offline
 * (pipeline/roads/interstate.ts).
 *
 * Privacy, as for EPA: the service is sent only a bounding box around the
 * point rounded to two decimals (~1 km), padded to cover the rounding; it
 * returns segment geometry and exact distances are computed here, so the exact
 * searched site is never sent.
 *
 * The service ignores "order by AADT" on plain spatial queries, so the busiest
 * roads come from a statistics query (max AADT per road within the radius),
 * then only those roads' segments are fetched with geometry.
 */

import { fetchJson, SourceError } from "../http";

export const SOURCE_ID = "fhwaHpms";

const LAYER = "https://services.arcgis.com/xOi1kZaI0eWDREZv/arcgis/rest/services/HPMS_National_Current/FeatureServer/0";
const ROUNDING_PAD_MILES = 0.5;
export const MAX_RADIUS_MILES = 2;
/** Roads kept from the statistics query; also the number returned. */
const TOP_ROADS = 5;

export const ROAD_CLASS: Record<number, string> = {
  1: "Interstate",
  2: "Other freeway or expressway",
  3: "Principal arterial",
  4: "Minor arterial",
  5: "Major collector",
  6: "Minor collector",
  7: "Local",
};

export interface RoadSegment {
  name: string | null;
  roadClass: string;
  aadt: number;
  /** Share of AADT that is trucks (single-unit + combination); null if not reported. */
  truckShare: number | null;
  lanes: number | null;
  dataYear: number | null;
  distanceMiles: number;
}

interface Feature {
  attributes: Record<string, unknown>;
  geometry?: { paths?: number[][][] };
}
interface QueryResponse {
  features?: Feature[];
  exceededTransferLimit?: boolean;
  error?: { code: number; message: string };
}

/** Miles from a point to a polyline, on a local equirectangular projection (accurate at these ranges). */
export function milesToPolyline(lon: number, lat: number, paths: number[][][]): number {
  const kx = 69.172 * Math.cos((lat * Math.PI) / 180);
  const ky = 69.0;
  let best = Infinity;
  for (const path of paths) {
    for (let i = 0; i + 1 < path.length; i++) {
      const ax = (path[i][0] - lon) * kx;
      const ay = (path[i][1] - lat) * ky;
      const bx = (path[i + 1][0] - lon) * kx;
      const by = (path[i + 1][1] - lat) * ky;
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
    }
    if (path.length === 1) best = Math.min(best, Math.hypot((path[0][0] - lon) * kx, (path[0][1] - lat) * ky));
  }
  return best;
}

/**
 * A bounding box around the rounded point, covering the radius plus the
 * rounding pad. A box is several times faster for this service than a
 * point-and-distance buffer (3 s against 12 s at 30 miles), and exact
 * distances are computed here anyway.
 */
export function envelope(lon: number, lat: number, radiusMiles: number): string {
  const rLon = Number(lon.toFixed(2));
  const rLat = Number(lat.toFixed(2));
  const miles = radiusMiles + ROUNDING_PAD_MILES;
  const dLat = miles / 69.0;
  const dLon = miles / (69.172 * Math.cos((rLat * Math.PI) / 180));
  const f = (n: number) => n.toFixed(4);
  return [f(rLon - dLon), f(rLat - dLat), f(rLon + dLon), f(rLat + dLat)].join(",");
}

function spatial(u: URL, lon: number, lat: number, radiusMiles: number): void {
  u.searchParams.set("geometry", envelope(lon, lat, radiusMiles));
  u.searchParams.set("geometryType", "esriGeometryEnvelope");
  u.searchParams.set("inSR", "4326");
  u.searchParams.set("spatialRel", "esriSpatialRelIntersects");
  u.searchParams.set("f", "json");
}

async function query(u: URL, timeoutMs = 8_000): Promise<QueryResponse> {
  const body = await fetchJson<QueryResponse>(u.toString(), { sourceId: SOURCE_ID, timeoutMs });
  if (body.error) throw new SourceError(SOURCE_ID, "rejected", `ArcGIS error ${body.error.code}`);
  if (!Array.isArray(body.features)) throw new SourceError(SOURCE_ID, "bad-response", "no features array");
  return body;
}

export function toSegment(f: Feature, lon: number, lat: number): RoadSegment | null {
  const a = f.attributes;
  const aadt = Number(a.AADT);
  const paths = f.geometry?.paths;
  if (!Number.isFinite(aadt) || aadt <= 0 || !paths?.length) return null;
  const su = Number(a.AADT_SINGLE_UNIT);
  const comb = Number(a.AADT_COMBINATION);
  const trucks = (Number.isFinite(su) ? su : 0) + (Number.isFinite(comb) ? comb : 0);
  const reported = Number.isFinite(su) || Number.isFinite(comb);
  const cls = Number(a.F_SYSTEM);
  const lanes = Number(a.THROUGH_LANES);
  const year = Number(a.DATA_YEAR);
  return {
    name: typeof a.RouteName === "string" && a.RouteName.trim() ? a.RouteName.trim().replace(/\s+/g, " ") : null,
    roadClass: ROAD_CLASS[cls] ?? "Unclassified",
    aadt,
    truckShare: reported ? Math.round((trucks / aadt) * 1e3) / 1e3 : null,
    lanes: Number.isFinite(lanes) && lanes > 0 ? lanes : null,
    dataYear: Number.isFinite(year) ? year : null,
    distanceMiles: Math.round(milesToPolyline(lon, lat, paths) * 100) / 100,
  };
}

/** The busiest road segments within `radiusMiles`, busiest first (one per road). */
export async function busiestRoadsNear(lon: number, lat: number, radiusMiles = 0.5): Promise<RoadSegment[]> {
  if (!(Math.abs(lon) <= 180 && Math.abs(lat) <= 90)) throw new SourceError(SOURCE_ID, "rejected", "coordinates out of range");
  if (!(radiusMiles > 0 && radiusMiles <= MAX_RADIUS_MILES)) {
    throw new SourceError(SOURCE_ID, "rejected", `radius must be between 0 and ${MAX_RADIUS_MILES} miles`);
  }
  const stats = new URL(`${LAYER}/query`);
  spatial(stats, lon, lat, radiusMiles);
  stats.searchParams.set("where", "AADT>0");
  stats.searchParams.set("groupByFieldsForStatistics", "RouteName,F_SYSTEM");
  stats.searchParams.set(
    "outStatistics",
    JSON.stringify([{ statisticType: "max", onStatisticField: "AADT", outStatisticFieldName: "max_aadt" }])
  );
  stats.searchParams.set("orderByFields", "max_aadt DESC");
  stats.searchParams.set("resultRecordCount", String(TOP_ROADS));
  const top = (await query(stats)).features!.map((f) => Number(f.attributes.max_aadt)).filter((n) => n > 0);
  if (top.length === 0) return [];

  const segs = new URL(`${LAYER}/query`);
  spatial(segs, lon, lat, radiusMiles);
  segs.searchParams.set("where", `AADT>=${Math.min(...top)}`);
  segs.searchParams.set(
    "outFields",
    "AADT,AADT_SINGLE_UNIT,AADT_COMBINATION,F_SYSTEM,RouteName,THROUGH_LANES,DATA_YEAR"
  );
  segs.searchParams.set("returnGeometry", "true");
  segs.searchParams.set("outSR", "4326");
  // ~50 m generalisation and 5 decimals are ample for distances reported to
  // 0.01 mile, and cut this query from ~6 s to ~2 s in a dense city.
  segs.searchParams.set("maxAllowableOffset", "0.0005");
  segs.searchParams.set("geometryPrecision", "5");
  segs.searchParams.set("resultRecordCount", "200");
  const segments = (await query(segs)).features!
    .map((f) => toSegment(f, lon, lat))
    .filter((s): s is RoadSegment => s != null && s.distanceMiles <= radiusMiles);

  // One entry per road: its busiest segment within the radius.
  const byRoad = new Map<string, RoadSegment>();
  for (const s of segments) {
    const key = `${s.name ?? "(unnamed)"}|${s.roadClass}`;
    const prev = byRoad.get(key);
    if (!prev || s.aadt > prev.aadt || (s.aadt === prev.aadt && s.distanceMiles < prev.distanceMiles)) byRoad.set(key, s);
  }
  return [...byRoad.values()].sort((a, b) => b.aadt - a.aadt).slice(0, TOP_ROADS);
}
