/**
 * Browser-side place lookup shared by the Start page search, the guided check
 * and the property checker: an address (via /api/geocode, POST) or a tract
 * number, to the tract's published profile.
 */

export interface PlaceProfile {
  analysis?: import("../analysis/indicators").TractAnalysis;
  geoid: string;
  state: string | null;
  county: string | null;
  measures: Record<string, { value: number | null; source?: string; unit?: string | null; description?: string | null }>;
  sources?: Record<string, { name: string; publisher: string; vintage: string; geography: string; url: string }>;
  rural: { treasury: boolean | null; explanation?: string };
  designation2027: { status: "designated" | "not-designated" | "pending" | "not-eligible" | "unknown"; text: string; stateEligible: number; stateCap: number };
  center?: [number, number] | null;
  publishedAt?: string;
}

export interface PlaceResult {
  profile: PlaceProfile;
  /** The geocoded point, when an address was given: [lon, lat]. */
  point: [number, number] | null;
  matched: string | null;
}

export interface PlaceCandidate { geoid: string; lon: number; lat: number; label: string | null }
export type LookupResult = PlaceResult | { kind: "ambiguous"; candidates: PlaceCandidate[] } | "no-match" | "error" | "limited" | "out-of-scope";

export function isPlaceResult(value: LookupResult): value is PlaceResult {
  return typeof value === "object" && "profile" in value;
}

export async function lookupPlace(input: string, candidate?: PlaceCandidate, signal?: AbortSignal): Promise<LookupResult> {
  try {
  let geoid = input.replace(/\s/g, "");
  let matched: string | null = candidate?.label ?? null;
  let point: [number, number] | null = candidate ? [candidate.lon, candidate.lat] : null;
  if (candidate) geoid = candidate.geoid;
  else if (!/^\d{11}$/.test(geoid)) {
    if (input.trim().length < 5 || input.length > 200) return "no-match";
    const res = await fetch("/api/geocode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: input }), signal });
    // The input is validated above, so a failure here is the lookup, not the address.
    if (res.status === 429) return "limited";
    if (!res.ok) return "error";
    const { matches } = (await res.json()) as { matches: Array<{ geoid: string; lon: number; lat: number; label: string | null }> };
    if (!matches.length) return "no-match";
    if (matches.length > 1) return { kind: "ambiguous", candidates: matches };
    geoid = matches[0].geoid;
    matched = matches[0].label;
    point = [matches[0].lon, matches[0].lat];
  }
  const r = await fetch(`/api/tract/${geoid}`, { signal });
  if (r.status === 404) return "no-match";
  if (r.status === 429) return "limited";
  if (r.status === 403) return "out-of-scope";
  if (!r.ok) return "error";
  return { profile: (await r.json()) as PlaceProfile, point, matched };
  } catch {
    return "error";
  }
}

/** Link to a tract's place report; an address point rides in the hash, never the path or query. */
export function reportHref(geoid: string, point: [number, number] | null): string {
  return point ? `/tract/${geoid}#at=${point[1].toFixed(5)},${point[0].toFixed(5)}` : `/tract/${geoid}`;
}

export function mapHref(geoid: string, point: [number, number] | null): string {
  return `/map#t=${geoid}&m=map${point ? `&at=${point[1].toFixed(5)},${point[0].toFixed(5)}&v=${point[0]},${point[1]},13` : ""}`;
}

export function pointFromHash(hash: string): [number, number] | null {
  const at = new URLSearchParams(hash.replace(/^#/, "")).get("at");
  if (!at || !/^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/.test(at)) return null;
  const [lat, lon] = at.split(",").map(Number);
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? [lon, lat] : null;
}
