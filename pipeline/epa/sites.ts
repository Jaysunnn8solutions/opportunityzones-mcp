/**
 * EPA Superfund (NPL) and Brownfields (ACRES) sites counted by 2020 tract, for
 * cross-tract screening and the map. Per-site detail near an address comes live
 * from lib/sources/epa/client.ts instead.
 *
 * Each site's point is placed in a tract with the 1:500,000 cartographic
 * boundaries (pipeline/lib/tractIndex.ts), so a site within ~100 m of a tract
 * edge can land in the neighboring tract. EPA's own coordinates are not
 * survey-grade either. Counts are therefore "sites recorded in or at the edge
 * of this tract", and are labeled as such.
 *
 * Output: pipeline/clean/epa_sites.csv
 */

import path from "node:path";
import { CLEAN_DIR } from "../config";
import { queryAllAttributes } from "../lib/arcgis";
import { log } from "../lib/http";
import { writeCsv } from "../lib/table";
import { loadTractIndex, type TractIndex } from "../lib/tractIndex";

const SERVICE = "https://geopub.epa.gov/arcgis/rest/services/EMEF/efpoints/MapServer";

export interface SiteCounts {
  npl: number;
  brownfield: number;
}

/** Count points per tract; returns the counts and how many points found no tract. */
export function countByTract(
  index: Pick<TractIndex, "locate">,
  points: Iterable<{ lon: number; lat: number; kind: keyof SiteCounts }>
): { counts: Map<string, SiteCounts>; unplaced: number } {
  const counts = new Map<string, SiteCounts>();
  let unplaced = 0;
  for (const p of points) {
    const geoid = Number.isFinite(p.lon) && Number.isFinite(p.lat) ? index.locate(p.lon, p.lat) : null;
    if (!geoid) {
      unplaced++;
      continue;
    }
    const c = counts.get(geoid) ?? { npl: 0, brownfield: 0 };
    c[p.kind]++;
    counts.set(geoid, c);
  }
  return { counts, unplaced };
}

async function points(layer: number, kind: keyof SiteCounts) {
  const rows = await queryAllAttributes({
    layer: `${SERVICE}/${layer}`,
    outFields: ["latitude", "longitude"],
    pageSize: 10_000,
    cacheKey: `epa-efpoints-${layer}`,
  });
  return rows.map((r) => ({ lon: Number(r.longitude), lat: Number(r.latitude), kind }));
}

export async function buildEpaSites(): Promise<void> {
  const [index, npl, brownfields] = await Promise.all([loadTractIndex(), points(0, "npl"), points(5, "brownfield")]);
  const { counts, unplaced } = countByTract(index, [...npl, ...brownfields]);
  log(
    `epa: ${npl.length.toLocaleString("en-US")} NPL and ${brownfields.length.toLocaleString("en-US")} brownfield sites; ` +
      `${counts.size.toLocaleString("en-US")} tracts have at least one; ${unplaced} points fell outside every tract`
  );
  writeCsv(
    path.join(CLEAN_DIR, "epa_sites.csv"),
    ["geoid20", "npl_sites", "brownfield_sites"],
    [...counts.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([g, c]) => [g, c.npl, c.brownfield])
  );
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  buildEpaSites().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
