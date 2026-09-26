/**
 * The "surroundings" measures the map's Find areas panel filters on: for each
 * tract, the average of its neighbouring tracts' published figures (2020-2024
 * ACS), weighted by population. Browser-safe (no data loading here).
 *
 * These describe places. A tract with well-off neighbours is not a
 * recommendation, and nothing here predicts an investment's outcome.
 */

export interface NeighborMeasure {
  /** Column in data/ the neighbours' values come from. */
  column: string;
  label: string;
  /** Whether a higher value is the "stronger" end for the tier choices. */
  higherIsStronger: boolean;
  format: "usd" | "pct";
}

export const NEIGHBOR_MEASURES: NeighborMeasure[] = [
  { column: "median_household_income", label: "Neighbours' median household income", higherIsStronger: true, format: "usd" },
  { column: "median_home_value", label: "Neighbours' median home value", higherIsStronger: true, format: "usd" },
  { column: "share_built_2010_or_later", label: "Neighbours' homes built since 2010", higherIsStronger: true, format: "pct" },
  { column: "bachelors_or_higher_share", label: "Neighbours' adults with a bachelor's degree", higherIsStronger: true, format: "pct" },
  { column: "unemployment_rate", label: "Neighbours' unemployment rate (lower first)", higherIsStronger: false, format: "pct" },
];

/** One row per tract: GEOID, status flag bits (lib/data/status.ts), then one value per NEIGHBOR_MEASURES entry, then the neighbour count. */
export type ExploreRow = [geoid: string, bits: number, ...values: Array<number | null>];

export interface ExploreState {
  measures: string[];
  rows: ExploreRow[];
}
