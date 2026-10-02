/**
 * Shared Find areas criteria, evaluated for each state's published rows.
 * Nationwide searches combine these results and preserve within-state bands.
 */

import { compileCriteria } from "./evidence";
import { NEIGHBOR_MEASURES, TRACT_MEASURES, type ExploreState } from "./measures";

export type DesignationFlag = "eligible" | "zone2027" | "oz2018" | "qct" | "dda" | "nmtc";
export type EligibilityChange = "2018-ineligible2027" | "2027-ineligible2037";
export const FORECAST_FILTER_UNAVAILABLE = "The 2037 eligibility filter is unavailable: no validated tract-level eligibility forecasts have been published. Historical growth models do not determine future eligibility.";
export type ExplicitTier = "lower50" | "lower25" | "lower10" | "higher50" | "higher25" | "higher10";
/** Legacy names are accepted only to preserve the meaning of existing research links/files. */
export type Tier = ExplicitTier | "top50" | "top25" | "top10";

export const TIERS: Record<ExplicitTier, { label: string; share: number; direction: "higher" | "lower" }> = {
  lower50: { label: "Lower 50% of values", share: 0.5, direction: "lower" },
  lower25: { label: "Lower 25% of values", share: 0.25, direction: "lower" },
  lower10: { label: "Lower 10% of values", share: 0.1, direction: "lower" },
  higher50: { label: "Higher 50% of values", share: 0.5, direction: "higher" },
  higher25: { label: "Higher 25% of values", share: 0.25, direction: "higher" },
  higher10: { label: "Higher 10% of values", share: 0.1, direction: "higher" },
};

export function explicitTier(column: string, tier: Tier): ExplicitTier {
  if (tier.startsWith("top")) return `${column === "unemployment_rate" ? "lower" : "higher"}${tier.slice(3)}` as ExplicitTier;
  return tier as ExplicitTier;
}

export interface Filters {
  flags: DesignationFlag[];
  /** "all": a tract must have every chosen flag; "any": at least one. */
  mode: "all" | "any";
  /** User-selected neighboring-area value band, compared within the state. */
  tiers: Partial<Record<string, Tier>>;
  rural?: "rural" | "not-rural" | "";
  /** Applied in addition to program flags, including when flags use OR. */
  eligibilityChange?: EligibilityChange | "";
  county?: string;
  ranges?: Partial<Record<string, { min?: number; max?: number }>>;
}

export const NO_FILTERS: Filters = { flags: [], mode: "all", tiers: {} };

export function filtersActive(f: Filters): boolean {
  return f.flags.length > 0 || Object.values(f.tiers).some(Boolean) || !!f.rural || !!f.county || !!f.eligibilityChange || Object.values(f.ranges ?? {}).some((range) => range?.min != null || range?.max != null);
}

/** GEOIDs whose published evidence meets every active criterion. */
export function matchingTracts(data: ExploreState, f: Filters): Set<string> {
  const evaluate = compileCriteria(data, f);
  return new Set(data.rows.filter((row) => evaluate(row).every((e) => e.result === "Meets")).map((row) => row[0]));
}

/** Public criteria only. Invalid fragment values cannot introduce arbitrary columns. */
export function parseFilters(raw: string | null): Filters {
  if (!raw || raw.length > 4000) return NO_FILTERS;
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object") return NO_FILTERS;
    const flags: DesignationFlag[] = ["eligible", "zone2027", "oz2018", "qct", "dda", "nmtc"];
    const tiers: Filters["tiers"] = {};
    for (const measure of NEIGHBOR_MEASURES) if ([...Object.keys(TIERS), "top50", "top25", "top10"].includes(value.tiers?.[measure.column])) tiers[measure.column] = explicitTier(measure.column, value.tiers[measure.column]);
    const ranges: NonNullable<Filters["ranges"]> = {};
    for (const measure of TRACT_MEASURES) {
      const range = value.ranges?.[measure.column];
      if (range && typeof range === "object") ranges[measure.column] = { min: typeof range.min === "number" && Number.isFinite(range.min) && range.min >= 0 ? range.min : undefined, max: typeof range.max === "number" && Number.isFinite(range.max) && range.max >= 0 ? range.max : undefined };
    }
    return { flags: Array.isArray(value.flags) ? flags.filter((flag) => value.flags.includes(flag)) : [], mode: value.mode === "any" ? "any" : "all", tiers, ranges,
      ...(value.eligibilityChange === "2018-ineligible2027" || value.eligibilityChange === "2027-ineligible2037" ? { eligibilityChange: value.eligibilityChange } : {}),
      county: typeof value.county === "string" && /^\d{5}$/.test(value.county) ? value.county : "", rural: value.rural === "rural" || value.rural === "not-rural" ? value.rural : "" };
  } catch { return NO_FILTERS; }
}

export function filterDescription(filters: Filters): string {
  const labels: Record<DesignationFlag, string> = { eligible: "2027 eligible", zone2027: "2027 designated", oz2018: "At least 50% population overlap with 2018 zones", qct: "HUD QCT", dda: "HUD DDA overlap", nmtc: "NMTC" };
  const parts = filters.flags.length ? [filters.flags.map((flag) => labels[flag]).join(filters.mode === "any" ? " OR " : " AND ")] : [];
  if (filters.eligibilityChange) parts.push(filters.eligibilityChange === "2018-ineligible2027" ? "2018 zone overlap ≥50% AND not eligible for 2027" : "2027 eligible → likely ineligible in 2037 (forecast unavailable)");
  if (filters.rural) parts.push(filters.rural === "rural" ? "Rural" : "Not rural");
  if (filters.county) parts.push(`County FIPS ${filters.county}`);
  for (const measure of TRACT_MEASURES) { const range = filters.ranges?.[measure.column]; if (range?.min != null) parts.push(`${measure.label} ≥ ${range.min.toLocaleString("en-US")}`); if (range?.max != null) parts.push(`${measure.label} ≤ ${range.max.toLocaleString("en-US")}`); }
  for (const measure of NEIGHBOR_MEASURES) { const tier = filters.tiers[measure.column]; if (tier) { const band = TIERS[explicitTier(measure.column, tier)]; parts.push(`${measure.label}: ${band.direction} ${band.share * 100}% within state`); } }
  return parts.join(" · ") || "All tracts in the search scope";
}
