/**
 * Which per-state tract files (public/boundaries, built by
 * pipeline/map/boundaries.ts) cover the map view. Pure, so it is tested
 * without a map.
 */

import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import type { Bounds } from "./tiles";

export type BBox = [number, number, number, number];

export interface BoundaryIndex {
  vintage: number;
  source: string;
  states: Record<string, { tracts: number; bbox: BBox; bytes: number }>;
}

/** Zoom from which whole-state tract files are loaded (a state like Georgia fills the view around 6-7). */
export const STATE_TRACT_MIN_ZOOM = 6;
/** At most this many state files are fetched for one view, largest overlap first. */
export const MAX_STATES_PER_VIEW = 6;

export interface BoundaryFeatureLike {
  type: "Feature";
  properties: Record<string, string | number>;
  geometry: unknown;
}

/**
 * Features from a boundary file: TopoJSON (what the pipeline writes; `object`
 * names the layer inside it) or a plain GeoJSON FeatureCollection.
 */
export function featuresFrom(json: unknown, object: "tracts" | "counties"): BoundaryFeatureLike[] {
  const j = json as { type?: string; objects?: Record<string, unknown>; features?: BoundaryFeatureLike[] };
  if (j?.type === "Topology" && j.objects?.[object]) {
    const fc = feature(json as Topology, (json as Topology).objects[object]) as unknown as { features?: BoundaryFeatureLike[] };
    return fc.features ?? [];
  }
  if (j?.type === "FeatureCollection" && Array.isArray(j.features)) return j.features;
  return [];
}

export function isBoundaryIndex(v: unknown): v is BoundaryIndex {
  if (!v || typeof v !== "object") return false;
  const states = (v as { states?: unknown }).states;
  if (!states || typeof states !== "object") return false;
  return Object.entries(states).every(
    ([k, s]) => /^\d{2}$/.test(k) && Array.isArray((s as { bbox?: unknown }).bbox) && (s as { bbox: unknown[] }).bbox.length === 4
  );
}

/** State FIPS codes whose tract bounding box overlaps the view, most overlap first. */
export function statesInView(index: BoundaryIndex, view: Bounds, max = MAX_STATES_PER_VIEW): string[] {
  const hits: Array<[string, number]> = [];
  for (const [fips, { bbox: [w, s, e, n] }] of Object.entries(index.states)) {
    const dx = Math.min(e, view.east) - Math.max(w, view.west);
    const dy = Math.min(n, view.north) - Math.max(s, view.south);
    if (dx > 0 && dy > 0) hits.push([fips, dx * dy]);
  }
  return hits
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, max)
    .map(([fips]) => fips);
}
