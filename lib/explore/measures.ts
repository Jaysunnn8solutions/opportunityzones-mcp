/**
 * The "surroundings" measures the map's Find areas panel filters on: for each
 * tract, the average of its neighboring tracts' published figures (2020-2024
 * ACS), weighted by population. Browser-safe (no data loading here).
 *
 * These describe places without assigning desirability or suitability.
 */

export interface NeighborMeasure {
  /** Column in data/ the neighbors' values come from. */
  column: string;
  label: string;
  format: "usd" | "pct";
}

export const NEIGHBOR_MEASURES: NeighborMeasure[] = [
  { column: "median_household_income", label: "Neighbors' median household income", format: "usd" },
  { column: "median_home_value", label: "Neighbors' median home value", format: "usd" },
  { column: "share_built_2010_or_later", label: "Neighbors' homes built since 2010", format: "pct" },
  { column: "bachelors_or_higher_share", label: "Neighbors' adults with a bachelor's degree", format: "pct" },
  { column: "unemployment_rate", label: "Neighbors' unemployment rate", format: "pct" },
];

/** One row per tract: GEOID, status flag bits (lib/data/status.ts), then one value per NEIGHBOR_MEASURES entry, then the neighbor count. */
export type ExploreRow = [geoid: string, bits: number, ...values: Array<number | null>];

export interface ExploreState {
  measures: string[];
  rows: ExploreRow[];
  tracts?: Record<string, AreaFacts>;
  generated?: string;
}

export interface AreaFacts {
  programs?: Record<string, number | null>;
  county: string;
  rural: boolean | null;
  values: Record<string, number | null>;
}

export const TRACT_MEASURES = [
  { column: "median_household_income", label: "Median household income", format: "usd" },
  { column: "median_home_value", label: "Median home value", format: "usd" },
  { column: "median_gross_rent", label: "Median gross rent", format: "usd" },
  { column: "population", label: "Population", format: "count" },
] as const;
