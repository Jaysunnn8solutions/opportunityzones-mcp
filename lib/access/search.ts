import { comparisonLimit } from "@/lib/research/comparisonLimits";
import { exploreState } from "@/lib/data/explore";
import { loadTractData } from "@/lib/data/tracts";
import { FORECAST_FILTER_UNAVAILABLE, matchingTracts, parseFilters, type Filters } from "@/lib/explore/filter";
import { compileCriteria, criteriaDiagnostics, type CriterionEvidence } from "@/lib/explore/evidence";
import type { ExploreState } from "@/lib/explore/measures";
import { AccessError } from "./store";
import { researchFlagsAllowed } from "@/lib/oz/researchScope";

export interface SearchPage extends ExploreState { total: number; matches: string[]; page: number; pages: number; counties: Array<{ fips: string; name: string }>; evidence: Record<string, CriterionEvidence[]>; diagnostics: ReturnType<typeof criteriaDiagnostics> }
export const SORTS = ["geoid", "median_home_value:asc", "median_home_value:desc", "median_household_income:asc", "median_household_income:desc", "population:desc"];
export function authorizeFilters(raw: unknown, member: boolean): Filters {
  const filters = parseFilters(JSON.stringify(raw ?? {}));
  if (filters.eligibilityChange === "2027-ineligible2037") throw new AccessError(FORECAST_FILTER_UNAVAILABLE, 422);
  const advanced = Object.values(filters.tiers).some(Boolean) || Object.values(filters.ranges ?? {}).some((r) => r?.min != null || r?.max != null);
  if (advanced && !member) throw new AccessError("Numeric and neighboring-area filters require a free research account. Sign in or clear those filters.", 401);
  return filters;
}
export function searchRows(state: string, filters: Filters, sort: string) {
  if (filters.eligibilityChange === "2027-ineligible2037") throw new AccessError(FORECAST_FILTER_UNAVAILABLE, 422);
  if (state !== "all" && !/^\d{2}$/.test(state)) throw new AccessError("Choose a valid state or nationwide scope.", 400);
  if (!SORTS.includes(sort)) throw new AccessError("Choose a supported sort.", 400);
  const withNeighbors = Object.values(filters.tiers).some(Boolean);
  const stateIds = state === "all" ? [...new Set(loadTractData().payload.geoids.map((id) => id.slice(0, 2)))] : [state];
  const groups = stateIds.flatMap((id) => { const data = exploreState(id, withNeighbors); return data ? [data] : []; });
  if (!groups.length) throw new AccessError("No data for this scope.", 404);
  const combined: ExploreState = groups.length === 1 ? groups[0] : { generated: groups[0].generated, measures: groups[0].measures, rows: groups.flatMap((group) => group.rows), tracts: Object.assign({}, ...groups.map((group) => group.tracts)) };
  const data = { ...combined, rows: combined.rows.filter((row) => researchFlagsAllowed(row[1])) };
  // Neighbor percentile bands retain their documented within-state meaning.
  const matches = new Set(groups.flatMap((group) => [...matchingTracts(group, filters)]));
  const [key, direction] = sort.split(":");
  const rows = data.rows.filter((r) => matches.has(r[0])).sort((a, b) => {
    if (key === "geoid") return a[0].localeCompare(b[0]);
    const av = data.tracts?.[a[0]]?.values[key], bv = data.tracts?.[b[0]]?.values[key];
    if (av == null || bv == null) return av == null && bv == null ? a[0].localeCompare(b[0]) : av == null ? 1 : -1;
    return (direction === "desc" ? bv - av : av - bv) || a[0].localeCompare(b[0]);
  });
  return { data, rows, groups };
}
export function searchPage(state: string, filters: Filters, sort: string, requestedPage: number, member: boolean, geoids?: string[]): SearchPage {
  const { data, rows, groups } = searchRows(state, filters, sort);
  const pageSize = member ? 100 : 25;
  const pages = Math.ceil(rows.length / pageSize);
  const page = Math.max(0, Math.min(Number.isSafeInteger(requestedPage) ? requestedPage : 0, Math.max(0, pages - 1)));
  const visible = geoids ? data.rows.filter((r) => geoids.includes(r[0])).slice(0, comparisonLimit(member)) : rows.slice(page * pageSize, (page + 1) * pageSize);
  const evaluators = new Map(groups.map((group) => [group.rows[0][0].slice(0, 2), compileCriteria(group, filters)]));
  const evaluate = (row: typeof data.rows[number]) => evaluators.get(row[0].slice(0, 2))!(row);
  const diagnostics = new Map<string, ReturnType<typeof criteriaDiagnostics>[number]>();
  if (!rows.length) for (const group of groups) for (const criterion of criteriaDiagnostics(group, filters, (row) => researchFlagsAllowed(row[1]))) {
    const previous = diagnostics.get(criterion.id);
    diagnostics.set(criterion.id, previous ? { ...previous, excluded: previous.excluded + criterion.excluded, unknown: previous.unknown + criterion.unknown, without: previous.without + criterion.without } : criterion);
  }
  return { generated: data.generated, measures: [], rows: visible.map((r) => [r[0], r[1]]), total: rows.length, matches: rows.map((r) => r[0]), page, pages,
    counties: state === "all" ? [] : [...new Map(data.rows.map((r) => [r[0].slice(0, 5), { fips: r[0].slice(0, 5), name: data.tracts?.[r[0]]?.county ?? r[0].slice(0, 5) }])).values()].sort((a, b) => a.name.localeCompare(b.name)),
    tracts: Object.fromEntries(visible.map((r) => { const facts = data.tracts?.[r[0]]; return [r[0], { county: facts?.county ?? "", rural: facts?.rural ?? null, values: member ? facts?.values ?? {} : {} }]; })),
    evidence: Object.fromEntries(visible.map((r) => [r[0], evaluate(r)])), diagnostics: [...diagnostics.values()] };
}
