/**
 * Which 2010 tracts touch which, for a spillover check.
 *
 * Freedman, Khanna and Neumark (NBER w34589, 2026) find most OZ job gains are
 * offset by losses in adjacent non-OZ tracts. An adjacent control is therefore
 * not a clean control: whatever happened in the zone may have leaked next door,
 * in either direction. The first-pass comparison is run twice, once with all
 * eligible non-designated tracts as controls and once excluding any that border
 * a designated zone ("donut"), and the gap between them is reported.
 *
 * Adjacency is queen contiguity (a shared vertex is enough), found by hashing
 * rounded vertex coordinates. Cartographic boundary files are generalised from
 * one topology, so neighbouring tracts carry identical vertices along their
 * shared edge, which makes this exact and linear-time rather than a pairwise
 * polygon intersection over 74,000 tracts.
 *
 * Output: pipeline/clean/tract2010_adjacency.csv  geoid10, neighbor
 */

import path from "node:path";
import { CLEAN_DIR, STATES } from "../config";
import { unzipBytes } from "../lib/archive";
import { fetchCached, log, mapLimit } from "../lib/http";
import { readDbfColumn, readShpPolygons } from "../lib/shapefile";
import { writeCsv } from "../lib/table";

const url = (fips: string) => `https://www2.census.gov/geo/tiger/GENZ2010/gz_2010_${fips}_140_00_500k.zip`;

/** GEO_ID in the 2010 CB files looks like "1400000US01001020100". */
function geoidFrom(geoId: string): string {
  const m = /US(\d{11})$/.exec(geoId);
  if (!m) throw new Error(`Unexpected GEO_ID ${geoId}`);
  return m[1];
}

export function vertexKey(x: number, y: number): string {
  // 1e-6 degrees is about 0.1 m; well inside the precision the files share.
  return `${Math.round(x * 1e6)},${Math.round(y * 1e6)}`;
}

/** Queen adjacency from a list of tracts and their rings. */
export function adjacency(tracts: ReadonlyArray<{ geoid: string; rings: Float64Array[] }>): Map<string, Set<string>> {
  const byVertex = new Map<string, string[]>();
  for (const t of tracts) {
    const seen = new Set<string>();
    for (const ring of t.rings) {
      for (let i = 0; i < ring.length; i += 2) {
        const k = vertexKey(ring[i], ring[i + 1]);
        if (seen.has(k)) continue;
        seen.add(k);
        const list = byVertex.get(k);
        if (list) list.push(t.geoid);
        else byVertex.set(k, [t.geoid]);
      }
    }
  }
  const out = new Map<string, Set<string>>();
  for (const t of tracts) out.set(t.geoid, new Set());
  for (const ids of byVertex.values()) {
    if (ids.length < 2) continue;
    for (const a of ids) for (const b of ids) if (a !== b) out.get(a)!.add(b);
  }
  return out;
}

export async function buildAdjacency(): Promise<void> {
  const perState = await mapLimit(STATES, 6, async (s) => {
    const zip = await fetchCached(url(s.fips), `gz_2010_${s.fips}_140_00_500k.zip`);
    const files = unzipBytes(zip, /\.(shp|dbf)$/i);
    const shp = files.find((f) => /\.shp$/i.test(f.name));
    const dbf = files.find((f) => /\.dbf$/i.test(f.name));
    if (!shp || !dbf) throw new Error(`2010 tract zip for ${s.usps} lacks .shp or .dbf`);
    const polys = readShpPolygons(shp.bytes);
    const ids = readDbfColumn(dbf.bytes, "GEO_ID").map(geoidFrom);
    // Official 2010 land area, square miles. The block relationship file's
    // land figures are 2020-vintage and drift in coastal tracts, so density
    // uses this instead.
    const areaSqMi = readDbfColumn(dbf.bytes, "CENSUSAREA").map(Number);
    if (polys.length !== ids.length) throw new Error(`${s.usps}: ${polys.length} shapes but ${ids.length} records`);
    return ids.map((geoid, i) => ({ geoid, rings: polys[i]?.rings ?? [], areaSqMi: areaSqMi[i] }));
  });

  // National pass, so tracts on either side of a state line find each other.
  const tracts = perState.flat();
  const adj = adjacency(tracts);
  const rows: string[][] = [];
  let isolated = 0;
  for (const [a, set] of adj) {
    if (set.size === 0) isolated++;
    for (const b of [...set].sort()) rows.push([a, b]);
  }
  rows.sort((x, y) => (x[0] === y[0] ? (x[1] < y[1] ? -1 : 1) : x[0] < y[0] ? -1 : 1));
  writeCsv(path.join(CLEAN_DIR, "tract2010_adjacency.csv"), ["geoid10", "neighbor"], rows);
  writeCsv(
    path.join(CLEAN_DIR, "tract2010_area.csv"),
    ["geoid10", "land_km2"],
    tracts
      .map((t) => [t.geoid, Number.isFinite(t.areaSqMi) ? t.areaSqMi * 2.589988110336 : null] as [string, number | null])
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
  );
  const crossState = rows.filter((r) => r[0].slice(0, 2) !== r[1].slice(0, 2)).length / 2;
  log(
    `adjacency: ${tracts.length.toLocaleString("en-US")} tracts, ${(rows.length / 2).toLocaleString("en-US")} neighbour pairs ` +
      `(${crossState.toLocaleString("en-US")} across state lines), ${isolated} with no neighbour`
  );
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  buildAdjacency().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
