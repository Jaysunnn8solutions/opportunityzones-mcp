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

/** Factual ranges only. No composite score or preference direction. */
export function differences(profiles: PlaceProfile[], keys: string[]): string[] {
  if (profiles.length < 2) return [];
  return selectedMeasures(keys).map((measure) => {
    const entries = profiles.map((p) => ({ id: p.geoid, value: p.measures[measure.column]?.value, source: sourceFor(p, measure.column) }));
    if (entries.some((e) => e.value == null)) return `${measure.label}: comparison incomplete; one or more places have no published value.`;
    const vintages = new Set(entries.map((e) => e.source?.vintage).filter(Boolean));
    if (vintages.size > 1) return `${measure.label}: source vintages differ; review the sources before comparing.`;
    entries.sort((a, b) => a.value! - b.value!);
    const low = entries[0], high = entries[entries.length - 1];
    const lo = displayValue(low.value, measure.unit), hi = displayValue(high.value, measure.unit);
    if (lo === hi) return `${measure.label}: all selected tracts display ${lo} at this precision.`;
    const gap = measure.unit === "pct" ? `${((high.value! - low.value!) * 100).toFixed(1)} percentage points` : displayValue(high.value! - low.value!, measure.unit);
    return `${measure.label}: ${lo} in tract ${low.id} to ${hi} in tract ${high.id}; a displayed range of ${gap}.`;
  });
}

export function placeNarrative(profile: PlaceProfile, focus: Focus) {
  const facts = selectedMeasures(FOCUSES[focus].measures).slice(0, 3).map((m) => ({ key: m.column, text: `${m.label}: ${displayValue(profile.measures[m.column]?.value, m.unit)}.`, period: m.period }));
  return { status: profile.designation2027.text, facts,
    unknowns: [profile.designation2027.status === "pending" ? "Certified 2027 designation is not recorded in this dataset." : null, "Tract estimates do not establish a property's value, condition, zoning, or project eligibility.", "A difference between estimates does not by itself establish a statistically significant difference."].filter((v): v is string => !!v) };
}
