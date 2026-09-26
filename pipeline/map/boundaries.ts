/**
 * Map geometry the app serves itself, so drawing tracts never waits on (or
 * depends on) a Census web service.
 *
 *   public/boundaries/tracts/{state FIPS}.json   one file per state: every tract
 *   public/boundaries/counties.json              every county, for zoomed-out views
 *   public/boundaries/index.json                 vintage, source, and each state's
 *                                                 tract count and bounding box
 *
 * Sources: the Census Bureau's 2024 cartographic boundary files, which are
 * generalised for maps and carry 2020 tracts with Connecticut's planning-region
 * GEOIDs, the same keys as data/. Tracts come from the 1:500,000 file already
 * cached for pipeline/lib/tractIndex.ts; counties from the 1:20,000,000 file,
 * which is plenty for a national view.
 *
 * Only geometry and the GEOID (plus county NAME) are kept: every attribute the
 * map colours by comes from data/ through the API, joined on GEOID.
 *
 * Coordinates are rounded to COORD_DECIMALS (about 11 m at 4 decimals), well
 * inside the accuracy of a 1:500,000 file, and repeated points the rounding
 * creates are dropped. Shapefile rings are regrouped into polygons (outer rings
 * clockwise, holes counter-clockwise in the shapefile) and rewound to the
 * GeoJSON convention (outer counter-clockwise), so holes render as holes.
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { unzipBytes } from "../lib/archive";
import { fetchCached, log } from "../lib/http";
import { readDbfColumn, readShpPolygons } from "../lib/shapefile";
import { TRACT_BOUNDARY_URL } from "../lib/tractIndex";

export const BOUNDARIES_DIR = path.resolve(import.meta.dirname, "..", "..", "public", "boundaries");
export const COUNTY_BOUNDARY_URL = "https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_us_county_20m.zip";
export const BOUNDARY_FILE_VINTAGE = 2024;
export const COORD_DECIMALS = 4;
/** A state file over this is a sign something went wrong (California is the largest). */
const MAX_STATE_BYTES = 12 * 1024 * 1024;

type Position = [number, number];
type Ring = Position[];
export type Geometry = { type: "Polygon"; coordinates: Ring[] } | { type: "MultiPolygon"; coordinates: Ring[][] };

export interface BoundaryFeature {
  type: "Feature";
  properties: { GEOID: string; NAME?: string };
  geometry: Geometry;
}

/** Twice the signed area (shoelace); positive is counter-clockwise with y up. */
export function signedArea(ring: Ring): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  return a;
}

function contains(ring: Ring, [x, y]: Position): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** Round a flat shapefile ring, drop repeats, and close it. Null if it collapses. */
export function roundRing(flat: Float64Array, decimals = COORD_DECIMALS): Ring | null {
  const f = 10 ** decimals;
  const out: Ring = [];
  for (let i = 0; i < flat.length; i += 2) {
    const p: Position = [Math.round(flat[i] * f) / f, Math.round(flat[i + 1] * f) / f];
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  if (out.length > 1 && out[0][0] === out[out.length - 1][0] && out[0][1] === out[out.length - 1][1]) out.pop();
  if (out.length < 3) return null;
  out.push([out[0][0], out[0][1]]);
  return signedArea(out) === 0 ? null : out;
}

/**
 * Shapefile rings to one GeoJSON geometry. Each hole goes to the smallest outer
 * ring containing it; a hole with no container is kept as its own polygon rather
 * than lost.
 */
export function toGeometry(rings: readonly Float64Array[], decimals = COORD_DECIMALS): Geometry | null {
  const outers: Array<{ ring: Ring; area: number; holes: Ring[] }> = [];
  const holes: Ring[] = [];
  for (const flat of rings) {
    const r = roundRing(flat, decimals);
    if (!r) continue;
    // Shapefile: outer rings clockwise (negative area), holes counter-clockwise.
    if (signedArea(r) < 0) outers.push({ ring: r.reverse(), area: Math.abs(signedArea(r)), holes: [] });
    else holes.push(r);
  }
  for (const h of holes) {
    const host = outers.filter((o) => contains(o.ring, h[0])).sort((a, b) => a.area - b.area)[0];
    if (host) host.holes.push(h.reverse());
    else outers.push({ ring: h, area: Math.abs(signedArea(h)), holes: [] });
  }
  if (outers.length === 0) return null;
  const polys = outers.map((o) => [o.ring, ...o.holes]);
  return polys.length === 1 ? { type: "Polygon", coordinates: polys[0] } : { type: "MultiPolygon", coordinates: polys };
}

export function bbox(features: readonly BoundaryFeature[]): [number, number, number, number] {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const f of features) {
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const [outer] of polys) {
      for (const [x, y] of outer) {
        if (x < w) w = x;
        if (x > e) e = x;
        if (y < s) s = y;
        if (y > n) n = y;
      }
    }
  }
  return [w, s, e, n];
}

/** Read a cartographic boundary zip into features keyed by GEOID (and NAME, if asked). */
export function readBoundaryZip(zip: Uint8Array, withName = false): BoundaryFeature[] {
  const [shp] = unzipBytes(zip, /\.shp$/);
  const [dbf] = unzipBytes(zip, /\.dbf$/);
  if (!shp || !dbf) throw new Error("Boundary zip lacks .shp or .dbf");
  const shapes = readShpPolygons(shp.bytes);
  const geoids = readDbfColumn(dbf.bytes, "GEOID");
  const names = withName ? readDbfColumn(dbf.bytes, "NAME") : null;
  if (shapes.length !== geoids.length) throw new Error(".shp and .dbf record counts differ");
  const out: BoundaryFeature[] = [];
  shapes.forEach((s, i) => {
    const geometry = s ? toGeometry(s.rings) : null;
    if (!geometry) return;
    const properties: BoundaryFeature["properties"] = { GEOID: geoids[i].trim() };
    if (names) properties.NAME = names[i].trim();
    out.push({ type: "Feature", properties, geometry });
  });
  return out;
}

export interface BoundaryIndex {
  vintage: number;
  source: string;
  states: Record<string, { tracts: number; bbox: [number, number, number, number]; bytes: number }>;
}

/** Split tracts by state and serialise. Pure, so it is tested without files. */
export function stateFiles(tracts: readonly BoundaryFeature[]): Map<string, { json: string; tracts: number; bbox: [number, number, number, number] }> {
  const byState = new Map<string, BoundaryFeature[]>();
  for (const f of tracts) {
    const g = f.properties.GEOID;
    if (!/^\d{11}$/.test(g)) throw new Error(`Tract GEOID ${JSON.stringify(g)} is not 11 digits`);
    const list = byState.get(g.slice(0, 2)) ?? [];
    list.push(f);
    byState.set(g.slice(0, 2), list);
  }
  const out = new Map<string, { json: string; tracts: number; bbox: [number, number, number, number] }>();
  for (const [fips, features] of [...byState].sort(([a], [b]) => (a < b ? -1 : 1))) {
    features.sort((a, b) => (a.properties.GEOID < b.properties.GEOID ? -1 : 1));
    out.set(fips, { json: JSON.stringify({ type: "FeatureCollection", features }), tracts: features.length, bbox: bbox(features) });
  }
  return out;
}

export async function buildMapBoundaries(): Promise<BoundaryIndex> {
  const tracts = readBoundaryZip(await fetchCached(TRACT_BOUNDARY_URL, "cb_2024_us_tract_500k.zip"));
  const counties = readBoundaryZip(await fetchCached(COUNTY_BOUNDARY_URL, "cb_2024_us_county_20m.zip"), true);

  const tractDir = path.join(BOUNDARIES_DIR, "tracts");
  rmSync(tractDir, { recursive: true, force: true });
  mkdirSync(tractDir, { recursive: true });

  const index: BoundaryIndex = {
    vintage: BOUNDARY_FILE_VINTAGE,
    source: "U.S. Census Bureau, 2024 cartographic boundary files (tracts 1:500,000; counties 1:20,000,000)",
    states: {},
  };
  for (const [fips, f] of stateFiles(tracts)) {
    const bytes = Buffer.byteLength(f.json);
    if (bytes > MAX_STATE_BYTES) throw new Error(`State ${fips} tract file is ${bytes} bytes, over ${MAX_STATE_BYTES}`);
    writeFileSync(path.join(tractDir, `${fips}.json`), f.json);
    index.states[fips] = { tracts: f.tracts, bbox: f.bbox, bytes };
  }
  writeFileSync(path.join(BOUNDARIES_DIR, "counties.json"), JSON.stringify({ type: "FeatureCollection", features: counties }));
  writeFileSync(path.join(BOUNDARIES_DIR, "index.json"), JSON.stringify(index, null, 1));

  const total = Object.values(index.states).reduce((a, s) => a + s.bytes, 0);
  log(
    `map boundaries: ${tracts.length.toLocaleString("en-US")} tracts in ${Object.keys(index.states).length} state files ` +
      `(${(total / 1e6).toFixed(1)} MB), ${counties.length.toLocaleString("en-US")} counties`
  );
  return index;
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  buildMapBoundaries().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
