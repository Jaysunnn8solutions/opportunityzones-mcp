/**
 * Distance from each 2020 tract to the nearest Interstate, for screening.
 *
 * Measured from the tract's Gazetteer internal point to the nearest Interstate
 * centerline in the Census TIGER 2024 primary roads file (route type "I").
 * Interstates do not move, and the live HPMS query for this proved too slow
 * and erratic for a request (2-17 s), so it is computed once here; per-site
 * traffic on nearby roads stays live (lib/sources/hpms/client.ts). The value is
 * labelled as measured from the tract's interior point, not from any site.
 *
 * Output: pipeline/clean/interstate_distance.csv
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { CLEAN_DIR } from "../config";
import { unzipBytes } from "../lib/archive";
import { tractPoints } from "../lib/gazetteer";
import { fetchCached, log } from "../lib/http";
import { readDbfColumn, readShpPolygons } from "../lib/shapefile";
import { readCsv, writeCsv } from "../lib/table";

const PRIMARY_ROADS_URL = "https://www2.census.gov/geo/tiger/TIGER2024/PRIMARYROADS/tl_2024_us_primaryroads.zip";
const CELL_DEG = 0.1;
/** Stop looking beyond this; farther tracts get no value rather than a guess. */
export const MAX_MILES = 150;

interface Segment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  name: string;
}

function milesToSegment(lon: number, lat: number, s: Segment): number {
  const kx = 69.172 * Math.cos((lat * Math.PI) / 180);
  const ky = 69.0;
  const ax = (s.ax - lon) * kx;
  const ay = (s.ay - lat) * ky;
  const dx = (s.bx - s.ax) * kx;
  const dy = (s.by - s.ay) * ky;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy);
}

/** Grid of line segments for nearest-segment search. */
export class SegmentIndex {
  private readonly cells = new Map<string, Segment[]>();

  constructor(lines: Array<{ parts: Float64Array[]; name: string }>) {
    for (const l of lines) {
      for (const p of l.parts) {
        for (let i = 0; i + 3 < p.length; i += 2) {
          const s: Segment = { ax: p[i], ay: p[i + 1], bx: p[i + 2], by: p[i + 3], name: l.name };
          const x0 = Math.floor(Math.min(s.ax, s.bx) / CELL_DEG);
          const x1 = Math.floor(Math.max(s.ax, s.bx) / CELL_DEG);
          const y0 = Math.floor(Math.min(s.ay, s.by) / CELL_DEG);
          const y1 = Math.floor(Math.max(s.ay, s.by) / CELL_DEG);
          for (let x = x0; x <= x1; x++) {
            for (let y = y0; y <= y1; y++) {
              const k = `${x},${y}`;
              let list = this.cells.get(k);
              if (!list) this.cells.set(k, (list = []));
              list.push(s);
            }
          }
        }
      }
    }
  }

  /** Nearest segment, searching outward ring by ring until no closer one can exist. */
  nearest(lon: number, lat: number): { miles: number; name: string } | null {
    const cx = Math.floor(lon / CELL_DEG);
    const cy = Math.floor(lat / CELL_DEG);
    // Smallest distance one cell step can cover here (east-west shrinks with latitude).
    const cellMiles = CELL_DEG * 69.172 * Math.cos((Math.min(Math.abs(lat) + 1, 89) * Math.PI) / 180);
    const maxRing = Math.ceil(MAX_MILES / cellMiles) + 1;
    let best: { miles: number; name: string } | null = null;
    for (let r = 0; r <= maxRing; r++) {
      if (best && (r - 1) * cellMiles > best.miles) break;
      for (let x = cx - r; x <= cx + r; x++) {
        for (let y = cy - r; y <= cy + r; y++) {
          if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r) continue;
          for (const s of this.cells.get(`${x},${y}`) ?? []) {
            const d = milesToSegment(lon, lat, s);
            if (!best || d < best.miles) best = { miles: d, name: s.name };
          }
        }
      }
    }
    return best && best.miles <= MAX_MILES ? best : null;
  }
}

export async function buildInterstateDistance(): Promise<void> {
  const ctFile = path.join(CLEAN_DIR, "ct_tracts.csv");
  if (!existsSync(ctFile)) throw new Error("Run pipeline/crosswalk/connecticut.ts first: Connecticut GEOIDs need mapping");
  const ct = readCsv(ctFile);
  const toPlanning = new Map(ct.rows.map((r) => [r[ct.col("geoid_census2020")], r[ct.col("geoid_planning_region")]]));

  const zip = await fetchCached(PRIMARY_ROADS_URL, "tl_2024_us_primaryroads.zip");
  const [shp] = unzipBytes(zip, /\.shp$/);
  const [dbf] = unzipBytes(zip, /\.dbf$/);
  if (!shp || !dbf) throw new Error("Primary roads zip lacks .shp or .dbf");
  const shapes = readShpPolygons(shp.bytes);
  const routeType = readDbfColumn(dbf.bytes, "RTTYP");
  const names = readDbfColumn(dbf.bytes, "FULLNAME");
  const interstates = shapes.flatMap((s, i) => (s && routeType[i] === "I" ? [{ parts: s.rings, name: names[i] }] : []));
  const index = new SegmentIndex(interstates);
  log(`interstate: ${interstates.length.toLocaleString("en-US")} Interstate features of ${shapes.length.toLocaleString("en-US")} primary roads`);

  const rows: Array<[string, number | null, string | null]> = [];
  let none = 0;
  for (const p of await tractPoints()) {
    const n = index.nearest(p.lon, p.lat);
    if (!n) none++;
    const geoid = p.geoid.startsWith("09") ? (toPlanning.get(p.geoid) ?? p.geoid) : p.geoid;
    rows.push([geoid, n ? Math.round(n.miles * 100) / 100 : null, n?.name ?? null]);
  }
  rows.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  writeCsv(path.join(CLEAN_DIR, "interstate_distance.csv"), ["geoid20", "miles_to_interstate", "nearest_interstate"], rows);
  log(`interstate: ${rows.length.toLocaleString("en-US")} tracts; ${none} have no Interstate within ${MAX_MILES} miles (e.g. Alaska, Hawaii islands, territories)`);
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  buildInterstateDistance().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
