import type { PlaceProfile } from "@/lib/client/place";
import { displayValue } from "@/lib/client/presentation";

export const MEASURES = [
  { column: "built_2020_or_later", label: "Housing built since 2020 (count)", unit: "count", period: "2020–2024 ACS" },
  { column: "built_2020_or_later_moe", label: "Housing built since 2020 (margin of error)", unit: "count", period: "2020–2024 ACS" },
  { column: "population", label: "Population", unit: "count", period: "2020–2024 ACS" },
  { column: "median_household_income", label: "Median household income", unit: "usd", period: "2020–2024 ACS" },
  { column: "median_home_value", label: "Median home value", unit: "usd", period: "2020–2024 ACS" },
  { column: "median_gross_rent", label: "Median gross rent", unit: "usd", period: "2020–2024 ACS" },
  { column: "poverty_rate", label: "Poverty rate", unit: "pct", period: "2020–2024 ACS" },
  { column: "unemployment_rate", label: "Unemployment rate", unit: "pct", period: "2020–2024 ACS" },
  { column: "vacancy_rate", label: "Housing vacancy", unit: "pct", period: "2020–2024 ACS" },
  { column: "owner_occupied_share", label: "Owner-occupied share", unit: "pct", period: "2020–2024 ACS" },
  { column: "share_built_before_1980", label: "Housing built before 1980", unit: "pct", period: "2020–2024 ACS" },
  { column: "share_built_2010_or_later", label: "Housing built since 2010", unit: "pct", period: "2020–2024 ACS" },
  { column: "jobs_2023", label: "Jobs located here", unit: "count", period: "2023 LODES" },
] as const;
export type MeasureKey = (typeof MEASURES)[number]["column"];
export const FOCUSES = {
  overview: { label: "Place overview", question: "What do the published facts say about these places?", measures: ["population", "median_household_income", "median_home_value", "median_gross_rent", "poverty_rate", "jobs_2023"] },
  housing: { label: "Housing context", question: "How do housing costs, occupancy, and housing age compare?", measures: ["median_home_value", "median_gross_rent", "vacancy_rate", "owner_occupied_share", "share_built_before_1980", "share_built_2010_or_later"] },
  work: { label: "People and work", question: "How do population, income, and employment measures compare?", measures: ["population", "median_household_income", "poverty_rate", "unemployment_rate", "jobs_2023"] },
} satisfies Record<string, { label: string; question: string; measures: MeasureKey[] }>;
export type Focus = keyof typeof FOCUSES;
export const DEFAULT_MEASURES: MeasureKey[] = [...FOCUSES.overview.measures];
export function selectedMeasures(keys: string[]) { return MEASURES.filter((m) => keys.includes(m.column)); }
export function sourceFor(profile: PlaceProfile, key: string) { const id = profile.measures[key]?.source; return id ? profile.sources?.[id] : undefined; }

/** Describe the selection, without ranking places or pooling medians/rates. */
export function comparisonOverview(profiles: PlaceProfile[], keys: string[]) {
  const tracts = [...new Map(profiles.map((profile) => [profile.geoid, profile])).values()];
  const statistics = selectedMeasures(keys)
    // A margin of error is uncertainty, not an additive housing count.
    .filter((measure) => measure.column !== "built_2020_or_later_moe")
    .map((measure) => {
      const entries = tracts.flatMap((profile) => {
        const value = profile.measures[measure.column]?.value;
        return typeof value === "number" && Number.isFinite(value)
          ? [{ value, source: sourceFor(profile, measure.column) }] : [];
      });
      const partial = entries.length < tracts.length;
      const method = measure.unit === "count" ? (partial ? "Partial total" : "Total")
        : measure.unit === "usd" ? "Median of tract medians" : "Median tract rate";
      const base = { key: measure.column, label: measure.label, unit: measure.unit, method,
        available: entries.length, total: tracts.length, partial };
      if (!entries.length) return { ...base, value: null, source: undefined, reason: "No published values in this selection." };
      if (entries.some(({ source }) => !source?.vintage || !source.name || !source.publisher || !source.geography)) {
        return { ...base, value: null, source: undefined, reason: "Source metadata is incomplete; summary withheld." };
      }
      const sources = new Set(entries.map(({ source }) => JSON.stringify([source!.name, source!.publisher, source!.vintage, source!.geography])));
      if (sources.size > 1) return { ...base, value: null, source: undefined, reason: "Sources, years, or geographies differ; summary withheld." };
      const values = entries.map(({ value }) => value).sort((a, b) => a - b);
      const middle = Math.floor(values.length / 2);
      const value = measure.unit === "count" ? values.reduce((sum, item) => sum + item, 0)
        : values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
      return { ...base, value, source: entries[0].source, reason: undefined };
    });
  return { tractCount: tracts.length,
    countyCount: new Set(tracts.map((profile) => profile.geoid.slice(0, 5))).size,
    stateCount: new Set(tracts.map((profile) => profile.geoid.slice(0, 2))).size,
    statistics };
}

export function placeNarrative(profile: PlaceProfile, focus: Focus) {
  const facts = selectedMeasures(FOCUSES[focus].measures).slice(0, 3).map((m) => ({ key: m.column, text: `${m.label}: ${displayValue(profile.measures[m.column]?.value, m.unit)}.`, period: m.period }));
  return { status: profile.designation2027.text, facts,
    unknowns: [profile.designation2027.status === "pending" ? "Certified 2027 designation is not recorded in this dataset." : null, "Tract estimates do not establish a property's value, condition, zoning, or project eligibility.", "A difference between estimates does not by itself establish a statistically significant difference."].filter((v): v is string => !!v) };
}
