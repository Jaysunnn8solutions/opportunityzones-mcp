/** City lookup is map navigation, never a tract eligibility determination. */
export type CityLocation = { geoid: string; name: string; usps: string; view: [number, number, number] };
export type GazetteerRow = [string, string, string, number, number, number];

export function normalizePlaceName(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[.'’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

export function shortPlaceName(name: string): string {
  return name.replace(/ (?:city(?: and borough)?|town|village|borough|municipality|CDP|comunidad|zona urbana)(?: \(balance\))?$/i, "");
}

export function cityMapHref(city: CityLocation): string {
  return `/map#s=${city.geoid.slice(0, 2)}&v=${city.view.join(",")}&m=map`;
}

export function createPlaceIndex(rows: GazetteerRow[]) {
  return rows.map(([geoid, name, usps, lon, lat, zoom]) => ({
    location: { geoid, name, usps, view: [lon, lat, zoom] } as CityLocation,
    name: normalizePlaceName(name), short: normalizePlaceName(shortPlaceName(name)),
  }));
}

export function findCities(index: ReturnType<typeof createPlaceIndex>, input: string, states: readonly { name: string; usps: string }[]) {
  let query = normalizePlaceName(input);
  let usps: string | undefined;
  // Longest suffix first, so e.g. West Virginia isn't mistaken for Virginia.
  const suffixes = states.flatMap((state) => [state.name, state.usps].map((name) => ({ name: normalizePlaceName(name), usps: state.usps }))).sort((a, b) => b.name.length - a.name.length);
  for (const suffix of suffixes) {
    if (query.endsWith(` ${suffix.name}`)) { query = query.slice(0, -suffix.name.length).trim(); usps = suffix.usps; break; }
  }
  if (query.length < 2) return { matches: [], more: false };
  const scoped = usps ? index.filter((item) => item.location.usps === usps) : index;
  let matches = scoped.filter((item) => item.short === query || item.name === query);
  if (!matches.length && query.length >= 3) matches = scoped.filter((item) => item.short.startsWith(query));
  matches.sort((a, b) => a.location.name.localeCompare(b.location.name) || a.location.usps.localeCompare(b.location.usps) || a.location.geoid.localeCompare(b.location.geoid));
  return { matches: matches.slice(0, 12).map((item) => item.location), more: matches.length > 12 };
}
