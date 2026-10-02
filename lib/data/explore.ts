/**
 * Per-tract data for the map's Find areas panel, for one state: the status
 * flags and, for each surroundings measure, the population-weighted average of
 * the neighboring tracts' values (lib/geo/tractNeighbors.ts).
 */

import { NEIGHBOR_MEASURES, TRACT_MEASURES, type ExploreRow, type ExploreState, type AreaFacts } from "@/lib/explore/measures";
import { stateNeighbors } from "@/lib/geo/tractNeighbors";
import { stateStatus } from "./status";
import { loadTractData } from "./tracts";
import { FLAG_COLUMNS } from "@/lib/explore/evidence";

const cache = new Map<string, ExploreState>();

/** Population-weighted mean of neighbors' values, skipping those without a value; null if none have one. Exported for tests. */
export function weightedMean(values: Array<number | null>, weights: Array<number | null>): number | null {
  let sum = 0;
  let w = 0;
  values.forEach((v, i) => {
    const wi = weights[i] ?? 0;
    if (v == null || !(wi > 0)) return;
    sum += v * wi;
    w += wi;
  });
  return w > 0 ? sum / w : null;
}

export function exploreState(state: string, withNeighbors = true): ExploreState | null {
  const cacheKey = `${state}:${withNeighbors}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;
  const status = stateStatus(state);
  const geoids = Object.keys(status);
  if (geoids.length === 0) return null;
  const { payload, lookups, manifest } = loadTractData();
  const pop = payload.columns.get("population")!;
  const cols = NEIGHBOR_MEASURES.map((m) => payload.columns.get(m.column)!);
  // Status and numeric tract filters need no boundary/adjacency loading.
  const adj = withNeighbors ? stateNeighbors(state) : new Map<string, string[]>();
  const round = (v: number | null, f: string) => (v == null ? null : f === "usd" ? Math.round(v) : Math.round(v * 1e4) / 1e4);

  const rows: ExploreRow[] = geoids.map((g) => {
    const nbrs = (adj.get(g) ?? []).map((n) => payload.indexOf(n)).filter((i) => i >= 0);
    const weights = nbrs.map((i) => pop.get(i));
    const values = cols.map((c, k) => round(weightedMean(nbrs.map((i) => c.get(i)), weights), NEIGHBOR_MEASURES[k].format));
    return [g, status[g], ...values, nbrs.length];
  });
  const tracts: Record<string, AreaFacts> = {};
  for (const geoid of geoids) {
    const index = payload.indexOf(geoid);
    const rural = payload.columns.get("rural_2027")?.get(index) ?? null;
    tracts[geoid] = { county: lookups.counties[geoid.slice(0, 5)]?.name ?? geoid.slice(0, 5), rural: rural == null ? null : rural === 1,
      programs: Object.fromEntries(Object.values(FLAG_COLUMNS).map((column) => [column, payload.columns.get(column)?.get(index) ?? null])),
      values: Object.fromEntries(TRACT_MEASURES.map((measure) => [measure.column, payload.columns.get(measure.column)?.get(index) ?? null])) };
  }
  const out = { measures: NEIGHBOR_MEASURES.map((m) => m.column), rows, tracts, generated: manifest.generated };
  cache.set(cacheKey, out);
  return out;
}
