/**
 * U.S. Census Bureau Geocoder: address or point to 2020-based census tract.
 *
 * Every live lookup starts here (docs/ARCHITECTURE.md). The address is sent to
 * the Census Bureau, which is unavoidable to geocode it, and goes nowhere else:
 * the caller keeps only the GEOID and coordinates. Nothing here logs or caches
 * the address, and errors never contain it (see ../http.ts).
 *
 * The "Current" vintage returns 2020 tracts with Connecticut's 2022
 * planning-region GEOIDs, the same scheme as the 2020-2024 ACS and Treasury's
 * 2027 eligibility file, so its GEOIDs join those directly.
 */

import { fetchJson, SourceError } from "../http";

export const SOURCE_ID = "censusGeocoder";

const BASE = "https://geocoding.geo.census.gov/geocoder/geographies";
const COMMON = {
  benchmark: "Public_AR_Current",
  vintage: "Current_Current",
  layers: "Census Tracts",
  format: "json",
};

export interface TractMatch {
  /** 11-digit tract GEOID: state (2) + county (3) + tract (6). */
  geoid: string;
  stateFips: string;
  countyFips: string;
  tractName: string;
  lon: number;
  lat: number;
  /** The Census Bureau's normalised form of the address; absent for point lookups. */
  matchedAddress?: string;
}

interface RawTract {
  GEOID?: unknown;
  STATE?: unknown;
  COUNTY?: unknown;
  NAME?: unknown;
}

interface RawAddressResponse {
  result?: {
    addressMatches?: Array<{
      matchedAddress?: unknown;
      coordinates?: { x?: unknown; y?: unknown };
      geographies?: { "Census Tracts"?: RawTract[] };
    }>;
  };
}

interface RawPointResponse {
  result?: { geographies?: { "Census Tracts"?: RawTract[] } };
}

/** At most this many candidates are returned, so the user can pick one. */
const MAX_MATCHES = 5;

function tractFrom(raw: RawTract | undefined): Omit<TractMatch, "lon" | "lat" | "matchedAddress"> | null {
  if (!raw) return null;
  const geoid = String(raw.GEOID ?? "");
  if (!/^\d{11}$/.test(geoid)) return null;
  return {
    geoid,
    stateFips: geoid.slice(0, 2),
    countyFips: geoid.slice(0, 5),
    tractName: typeof raw.NAME === "string" ? raw.NAME : `Census Tract ${geoid.slice(5)}`,
  };
}

export function parseAddressResponse(json: unknown): TractMatch[] {
  const matches = (json as RawAddressResponse)?.result?.addressMatches;
  if (!Array.isArray(matches)) {
    throw new SourceError(SOURCE_ID, "bad-response", "no addressMatches array");
  }
  const out: TractMatch[] = [];
  for (const m of matches) {
    const tract = tractFrom(m.geographies?.["Census Tracts"]?.[0]);
    const lon = Number(m.coordinates?.x);
    const lat = Number(m.coordinates?.y);
    if (!tract || !Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    out.push({
      ...tract,
      lon,
      lat,
      matchedAddress: typeof m.matchedAddress === "string" ? m.matchedAddress : undefined,
    });
    if (out.length === MAX_MATCHES) break;
  }
  return out;
}

export function parsePointResponse(json: unknown, lon: number, lat: number): TractMatch | null {
  const geographies = (json as RawPointResponse)?.result?.geographies;
  if (!geographies) throw new SourceError(SOURCE_ID, "bad-response", "no geographies object");
  const tract = tractFrom(geographies["Census Tracts"]?.[0]);
  return tract ? { ...tract, lon, lat } : null;
}

/** Candidate tracts for a one-line address; empty when the Census Bureau finds no match. */
export async function geocodeAddress(address: string): Promise<TractMatch[]> {
  const trimmed = address.trim();
  if (trimmed.length < 5 || trimmed.length > 200) {
    throw new SourceError(SOURCE_ID, "rejected", "address must be 5-200 characters");
  }
  const url = new URL(`${BASE}/onelineaddress`);
  url.searchParams.set("address", trimmed);
  for (const [k, v] of Object.entries(COMMON)) url.searchParams.set(k, v);
  return parseAddressResponse(await fetchJson(url.toString(), { sourceId: SOURCE_ID }));
}

/** The tract containing a point, or null outside any tract (e.g. open water). */
export async function tractAtPoint(lon: number, lat: number): Promise<TractMatch | null> {
  if (!(Math.abs(lon) <= 180 && Math.abs(lat) <= 90)) {
    throw new SourceError(SOURCE_ID, "rejected", "coordinates out of range");
  }
  const url = new URL(`${BASE}/coordinates`);
  url.searchParams.set("x", String(lon));
  url.searchParams.set("y", String(lat));
  for (const [k, v] of Object.entries(COMMON)) url.searchParams.set(k, v);
  return parsePointResponse(await fetchJson(url.toString(), { sourceId: SOURCE_ID }), lon, lat);
}
