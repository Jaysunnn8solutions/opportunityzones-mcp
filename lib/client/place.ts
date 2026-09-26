/**
 * Browser-side place lookup shared by the Start page search, the guided check
 * and the property checker: an address (via /api/geocode, POST) or a tract
 * number, to the tract's published profile.
 */

export interface PlaceProfile {
  geoid: string;
  state: string | null;
  county: string | null;
  measures: Record<string, { value: number | null }>;
  rural: { treasury: boolean | null; explanation?: string };
  designation2027: { status: "designated" | "not-designated" | "pending" | "not-eligible" | "unknown"; text: string; stateEligible: number; stateCap: number };
}

export interface PlaceResult {
  profile: PlaceProfile;
  /** The geocoded point, when an address was given: [lon, lat]. */
  point: [number, number] | null;
  matched: string | null;
}

export async function lookupPlace(input: string): Promise<PlaceResult | "no-match" | "error"> {
  let geoid = input.replace(/\s/g, "");
  let matched: string | null = null;
  let point: [number, number] | null = null;
  if (!/^\d{11}$/.test(geoid)) {
    if (input.trim().length < 5 || input.length > 200) return "no-match";
    const res = await fetch("/api/geocode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: input }) });
    // The input is validated above, so a failure here is the lookup, not the address.
    if (!res.ok) return "error";
    const { matches } = (await res.json()) as { matches: Array<{ geoid: string; lon: number; lat: number; label: string | null }> };
    if (!matches.length) return "no-match";
    geoid = matches[0].geoid;
    matched = matches[0].label;
    point = [matches[0].lon, matches[0].lat];
  }
  const r = await fetch(`/api/tract/${geoid}`);
  if (r.status === 404) return "no-match";
  if (!r.ok) return "error";
  return { profile: (await r.json()) as PlaceProfile, point, matched };
}

/** Link to a tract's place report; an address point rides in the hash, never the path or query. */
export function reportHref(geoid: string, point: [number, number] | null): string {
  return point ? `/tract/${geoid}#at=${point[1].toFixed(5)},${point[0].toFixed(5)}` : `/tract/${geoid}`;
}
