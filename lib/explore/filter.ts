/**
 * The map's Find areas filters, applied in the browser to one state's rows
 * (lib/data/explore.ts). Pure, so it is tested without a map.
 */

import { FLAGS } from "@/lib/data/flags";
import { NEIGHBOR_MEASURES, type ExploreState } from "./measures";

export type DesignationFlag = "eligible" | "zone2027" | "oz2018" | "qct" | "dda" | "nmtc";
export type Tier = "top50" | "top25" | "top10";

export const TIERS: Record<Tier, { label: string; share: number }> = {
  top50: { label: "Top half of the state", share: 0.5 },
  top25: { label: "Top quarter", share: 0.25 },
  top10: { label: "Top tenth", share: 0.1 },
};

export interface Filters {
  flags: DesignationFlag[];
  /** "all": a tract must have every chosen flag; "any": at least one. */
  mode: "all" | "any";
  /** Surroundings measure (column) -> how strong its neighbours must be, within the state. */
  tiers: Partial<Record<string, Tier>>;
}

export const NO_FILTERS: Filters = { flags: [], mode: "all", tiers: {} };

export function filtersActive(f: Filters): boolean {
  return f.flags.length > 0 || Object.values(f.tiers).some(Boolean);
}

/** The cut-off that keeps the strongest `share` of sorted values (ties at the cut-off are kept too). */
function cutOff(sorted: number[], share: number, higherIsStronger: boolean): number {
  const k = Math.max(1, Math.ceil(share * sorted.length));
  return higherIsStronger ? sorted[sorted.length - k] : sorted[k - 1];
}

/** GEOIDs of the state's tracts that pass every active filter. */
export function matchingTracts(data: ExploreState, f: Filters): Set<string> {
  const flagBits = f.flags.map((k) => FLAGS[k]);
  const tests = NEIGHBOR_MEASURES.flatMap((m) => {
    const tier = f.tiers[m.column];
    const col = data.measures.indexOf(m.column);
    if (!tier || col < 0) return [];
    const values = data.rows
      .map((r) => r[2 + col])
      .filter((v): v is number => typeof v === "number")
      .sort((a, b) => a - b);
    if (values.length === 0) return [() => false];
    const cut = cutOff(values, TIERS[tier].share, m.higherIsStronger);
    return [(row: (typeof data.rows)[number]) => {
      const v = row[2 + col];
      return typeof v === "number" && (m.higherIsStronger ? v >= cut : v <= cut);
    }];
  });

  const out = new Set<string>();
  for (const row of data.rows) {
    const bits = row[1];
    if (flagBits.length > 0) {
      const has = flagBits.map((b) => (bits & b) !== 0);
      if (f.mode === "all" ? !has.every(Boolean) : !has.some(Boolean)) continue;
    }
    if (tests.every((t) => t(row))) out.add(row[0]);
  }
  return out;
}
