/** Reuse already downloaded, registered Census files; never fetch while publishing. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { STATES, CACHE_DIR } from "../pipeline/config";
import { unzipBytes } from "../pipeline/lib/archive";
import { readDbfColumn, readShpPolygons } from "../pipeline/lib/shapefile";
import { toGeometry, toTopoJson, type BoundaryFeature } from "../pipeline/map/boundaries";
const output = path.join(process.cwd(), "public/boundaries/tracts2010"); mkdirSync(output, { recursive: true });
const available: string[] = [];
for (const state of STATES) {
  const file = path.join(CACHE_DIR, `gz_2010_${state.fips}_140_00_500k.zip`); if (!existsSync(file)) continue;
  const zip = readFileSync(file); const [shp] = unzipBytes(zip, /\.shp$/); const [dbf] = unzipBytes(zip, /\.dbf$/); if (!shp || !dbf) throw new Error(`Incomplete cached boundary ${state.fips}`);
  const shapes = readShpPolygons(shp.bytes); const ids = readDbfColumn(dbf.bytes, "GEO_ID").map((id) => /US(\d{11})$/.exec(id)?.[1]);
  if (shapes.length !== ids.length || ids.some((id) => !id)) throw new Error(`Invalid boundary identifiers ${state.fips}`);
  const features: BoundaryFeature[] = shapes.flatMap((shape, i) => { const geometry = shape ? toGeometry(shape.rings) : null; return geometry ? [{ type: "Feature", properties: { GEOID: ids[i]! }, geometry }] : []; });
  writeFileSync(path.join(output, `${state.fips}.json`), toTopoJson("tracts", features)); available.push(state.fips);
}
// A cache-free deployment retains its committed snapshots; no remote fallback.
if (available.length) writeFileSync(path.join(output, "index.json"), JSON.stringify({ vintage: 2010, sourceId: "tracts2010Cb", states: STATES.filter((state) => existsSync(path.join(output, `${state.fips}.json`))).map((state) => state.fips) }));
console.log(`Published historical cartographic boundaries for ${available.length} states/territories from the existing cache.`);
