/**
 * Per-tract data for the map's Find areas panel, for one state: the status
 * flags and, for each surroundings measure, the population-weighted average of
 * the neighbouring tracts' values (lib/geo/tractNeighbors.ts).
 */

import { NEIGHBOR_MEASURES, type ExploreRow, type ExploreState } from "@/lib/explore/measures";
import { stateNeighbors } from "@/lib/geo/tractNeighbors";
import { stateStatus } from "./status";
import { loadTractData } from "./tracts";

const cache = new Map<string, ExploreState>();

/** Population-weighted mean of neighbours' values, skipping those without a value; null if none have one. Exported for tests. */
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

export function exploreState(state: string): ExploreState | null {
  const hit = cache.get(state);
  if (hit) return hit;
  const status = stateStatus(state);
  const geoids = Object.keys(status);
  if (geoids.length === 0) return null;
  const { payload } = loadTractData();
  const pop = payload.columns.get("population")!;
  const cols = NEIGHBOR_MEASURES.map((m) => payload.columns.get(m.column)!);
  const adj = stateNeighbors(state);
  const round = (v: number | null, f: string) => (v == null ? null : f === "usd" ? Math.round(v) : Math.round(v * 1e4) / 1e4);

  const rows: ExploreRow[] = geoids.map((g) => {
    const nbrs = (adj.get(g) ?? []).map((n) => payload.indexOf(n)).filter((i) => i >= 0);
    const weights = nbrs.map((i) => pop.get(i));
    const values = cols.map((c, k) => round(weightedMean(nbrs.map((i) => c.get(i)), weights), NEIGHBOR_MEASURES[k].format));
    return [g, status[g], ...values, nbrs.length];
  });
  const out = { measures: NEIGHBOR_MEASURES.map((m) => m.column), rows };
  cache.set(state, out);
  return out;
}
