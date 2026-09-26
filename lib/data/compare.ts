/**
 * Where a tract sits among the eligible tracts in its state, measure by
 * measure: shared by the compare_tract tool and the tract page. A
 * description of position, never a score.
 */

import { loadTractData, type TractData } from "./tracts";

/** Share of `values` strictly below `x`, plus half of ties (mid-rank percentile). */
export function percentile(values: readonly number[], x: number): number {
  let below = 0;
  let equal = 0;
  for (const v of values) {
    if (v < x) below++;
    else if (v === x) equal++;
  }
  return values.length ? (below + equal / 2) / values.length : NaN;
}

export interface Position {
  value: number | null;
  /** 0-1 share of the state's eligible tracts with a lower value; null when not computable. */
  percentile: number | null;
  /** Eligible tracts in the state with data for this measure. */
  peers: number;
}

/** Positions for `names` among the eligible tracts in the tract's state. */
export function statePositions(geoid: string, names: readonly string[], data: TractData = loadTractData()): Record<string, Position> {
  const { payload } = data;
  const i0 = payload.indexOf(geoid);
  const state = geoid.slice(0, 2);
  const eligible = payload.columns.get("eligible_2027")!;
  const peers: number[] = [];
  for (let i = 0; i < payload.count; i++) if (payload.geoids[i].startsWith(state) && eligible.get(i) === 1) peers.push(i);
  const out: Record<string, Position> = {};
  for (const name of names) {
    const col = payload.columns.get(name);
    const value = i0 >= 0 && col ? col.get(i0) : null;
    const values = col ? peers.map((i) => col.get(i)).filter((v): v is number => v != null) : [];
    out[name] = { value, percentile: value == null || values.length === 0 ? null : percentile(values, value), peers: values.length };
  }
  return out;
}
