/** Product access scope, not a legal certification of a property's zone status. */
export const RESEARCH_SCOPE_NOTICE = "Tract details, comparisons, and exports are available only for 2027-eligible tracts or designated Opportunity Zones. Other tracts remain visible for map context.";
export function researchStatusAllowed(eligible: unknown, designated: unknown, historicalShare: unknown): boolean {
  return eligible === 1 || designated === 1 || typeof historicalShare === "number" && historicalShare >= 0.5;
}
/** Same 2018 majority-population crosswalk classification used by the map. */
export function researchFlagsAllowed(bits: number | undefined): boolean {
  return bits != null && (bits & (1 | 4 | 64)) !== 0;
}
