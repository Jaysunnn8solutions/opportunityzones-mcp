/**
 * Tract and county boundaries for the map, from the Census Bureau's TIGERweb
 * ArcGIS services (public domain), one web-mercator tile at a time.
 *
 * "Current" vintage: 2020 tracts with Connecticut's planning-region GEOIDs, the
 * same keys as the published data. TIGERweb returns whole polygons that
 * intersect the tile (not clipped pieces), so the client merges tiles and
 * de-duplicates by GEOID. Geometry is generalised to about half a pixel at the
 * tile's zoom.
 *
 * Boundaries are the same for every viewer and carry nothing about users, so
 * the route in front of this caches them publicly.
 */

import { toleranceForZoom, tileBounds } from "../../geo/tiles";
import { fetchText, SourceError } from "../http";

export const SOURCE_ID = "censusTigerweb";

const TIGERWEB = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb";

export const LAYERS = {
  tracts: { url: `${TIGERWEB}/Tracts_Blocks/MapServer/0`, fields: "GEOID", minZoom: 8, maxZoom: 14 },
  counties: { url: `${TIGERWEB}/State_County/MapServer/1`, fields: "GEOID,NAME", minZoom: 3, maxZoom: 11 },
} as const;
export type BoundaryLayer = keyof typeof LAYERS;

export interface BoundaryFeature {
  type: "Feature";
  properties: { GEOID: string; NAME?: string };
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
}
export interface BoundaryCollection {
  type: "FeatureCollection";
  features: BoundaryFeature[];
}

export function boundaryUrl(layer: BoundaryLayer, z: number, x: number, y: number): string {
  const b = tileBounds(z, x, y);
  const u = new URL(`${LAYERS[layer].url}/query`);
  u.searchParams.set("geometry", [b.west, b.south, b.east, b.north].map((n) => n.toFixed(6)).join(","));
  u.searchParams.set("geometryType", "esriGeometryEnvelope");
  u.searchParams.set("inSR", "4326");
  u.searchParams.set("spatialRel", "esriSpatialRelIntersects");
  u.searchParams.set("outFields", LAYERS[layer].fields);
  u.searchParams.set("returnGeometry", "true");
  u.searchParams.set("outSR", "4326");
  u.searchParams.set("maxAllowableOffset", toleranceForZoom(z).toPrecision(3));
  u.searchParams.set("geometryPrecision", z >= 12 ? "6" : "5");
  u.searchParams.set("f", "geojson");
  return u.toString();
}

/** Keep only well-formed features with an 11-digit (tract) or 5-digit (county) GEOID. */
export function cleanCollection(json: unknown, layer: BoundaryLayer): BoundaryCollection {
  const fc = json as { type?: string; features?: unknown[] };
  if (fc?.type !== "FeatureCollection" || !Array.isArray(fc.features)) {
    throw new SourceError(SOURCE_ID, "bad-response", "not a GeoJSON FeatureCollection");
  }
  const geoidLength = layer === "tracts" ? 11 : 5;
  const features: BoundaryFeature[] = [];
  for (const f of fc.features as Array<{ properties?: Record<string, unknown>; geometry?: { type?: string; coordinates?: unknown } }>) {
    const geoid = String(f.properties?.GEOID ?? "");
    const type = f.geometry?.type;
    if (geoid.length !== geoidLength || !/^\d+$/.test(geoid) || (type !== "Polygon" && type !== "MultiPolygon")) continue;
    features.push({
      type: "Feature",
      properties: layer === "counties" ? { GEOID: geoid, NAME: String(f.properties?.NAME ?? "") } : { GEOID: geoid },
      geometry: { type, coordinates: f.geometry!.coordinates },
    });
  }
  return { type: "FeatureCollection", features };
}

export async function fetchBoundaries(layer: BoundaryLayer, z: number, x: number, y: number): Promise<BoundaryCollection> {
  const text = await fetchText(boundaryUrl(layer, z, x, y), { sourceId: SOURCE_ID, timeoutMs: 15_000 });
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new SourceError(SOURCE_ID, "bad-response", "response was not JSON");
  }
  return cleanCollection(json, layer);
}
