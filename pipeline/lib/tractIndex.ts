/**
 * Which 2020 census tract contains a point, for placing point sources (EPA
 * sites, hospitals, colleges) in tracts offline.
 *
 * Boundaries: the Census 2024 cartographic boundary file of tracts, 1:500,000.
 * It carries 2020 tracts with Connecticut's planning-region GEOIDs, the same
 * keys as the rest of the product, and is the file the national map is built
 * from. Being generalised, it can put a point within roughly 100 m of a tract
 * edge in the neighbouring tract; outputs that use it say so.
 *
 * Point-in-polygon uses the even-odd rule across all rings of a tract, which
 * handles holes and multi-part tracts without needing ring orientation. A
 * one-degree grid of tract bounding boxes keeps each lookup to a handful of
 * candidates.
 */

import { unzipBytes } from "./archive";
import { fetchCached } from "./http";
import { readDbfColumn, readShpPolygons } from "./shapefile";

export const TRACT_BOUNDARY_URL = "https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_us_tract_500k.zip";

interface Indexed {
  geoid: string;
  rings: Float64Array[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Even-odd test of a point against every ring of one shape. */
export function insideRings(x: number, y: number, rings: readonly Float64Array[]): boolean {
  let inside = false;
  for (const ring of rings) {
    const n = ring.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = ring[2 * i];
      const yi = ring[2 * i + 1];
      const xj = ring[2 * j];
      const yj = ring[2 * j + 1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

export class TractIndex {
  private readonly cells = new Map<string, Indexed[]>();

  constructor(shapes: Array<{ geoid: string; rings: Float64Array[] }>) {
    for (const s of shapes) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const r of s.rings) {
        for (let i = 0; i < r.length; i += 2) {
          if (r[i] < minX) minX = r[i];
          if (r[i] > maxX) maxX = r[i];
          if (r[i + 1] < minY) minY = r[i + 1];
          if (r[i + 1] > maxY) maxY = r[i + 1];
        }
      }
      const entry: Indexed = { geoid: s.geoid, rings: s.rings, minX, minY, maxX, maxY };
      for (let cx = Math.floor(minX); cx <= Math.floor(maxX); cx++) {
        for (let cy = Math.floor(minY); cy <= Math.floor(maxY); cy++) {
          const key = `${cx},${cy}`;
          let list = this.cells.get(key);
          if (!list) this.cells.set(key, (list = []));
          list.push(entry);
        }
      }
    }
  }

  /** GEOID of the tract containing the point, or null (open water, outside the US). */
  locate(lon: number, lat: number): string | null {
    for (const t of this.cells.get(`${Math.floor(lon)},${Math.floor(lat)}`) ?? []) {
      if (lon < t.minX || lon > t.maxX || lat < t.minY || lat > t.maxY) continue;
      if (insideRings(lon, lat, t.rings)) return t.geoid;
    }
    return null;
  }
}

export async function loadTractIndex(): Promise<TractIndex> {
  const zip = await fetchCached(TRACT_BOUNDARY_URL, "cb_2024_us_tract_500k.zip");
  const [shp] = unzipBytes(zip, /\.shp$/);
  const [dbf] = unzipBytes(zip, /\.dbf$/);
  if (!shp || !dbf) throw new Error("Tract boundary zip lacks .shp or .dbf");
  const polygons = readShpPolygons(shp.bytes);
  const geoids = readDbfColumn(dbf.bytes, "GEOID");
  if (polygons.length !== geoids.length) throw new Error("Tract .shp and .dbf record counts differ");
  const shapes = polygons.flatMap((p, i) => (p ? [{ geoid: geoids[i].trim(), rings: p.rings }] : []));
  return new TractIndex(shapes);
}
