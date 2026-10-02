/** Shared website limits; MCP tools have their own smaller request limits. */
export const MAX_COMPARISON_TRACTS = 25;
export const PUBLIC_COMPARISON_TRACTS = 2;
export const comparisonLimit = (member: boolean) => member ? MAX_COMPARISON_TRACTS : PUBLIC_COMPARISON_TRACTS;

export function comparisonIds(raw: string): string[] {
  const ids = [...new Set(raw.split(",").filter((id) => /^\d{11}$/.test(id)))];
  if (ids.length > MAX_COMPARISON_TRACTS) throw new Error("Comparison supports up to 25 tracts. Narrow the selection before opening it.");
  return ids;
}
