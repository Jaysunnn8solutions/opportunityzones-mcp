/** Filter geometry itself so excluded places cannot remain visible or clickable.
 * null means no criteria; an empty set means no matches (including pending results).
 */
export function mapFeaturesForMatches<T extends { properties: Record<string, unknown> }>(
  features: Iterable<T>, matches: ReadonlySet<string> | null, geography: "tract" | "county",
): T[] {
  if (matches === null) return [...features];
  const ids = geography === "county" ? new Set([...matches].map((geoid) => geoid.slice(0, 5))) : matches;
  return [...features].filter((feature) => ids.has(String(feature.properties.GEOID)));
}
