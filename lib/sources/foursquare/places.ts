/**
 * Everyday amenities near a site from Foursquare Open Source Places
 * (Apache-2.0, attribution required): counts and nearest distance for grocery,
 * pharmacy, bank, restaurant and retail places.
 *
 * STATUS: NOT YET VERIFIED AGAINST THE LIVE CATALOG. OS Places is served from
 * an Iceberg REST catalog behind the Foursquare Places Portal, authenticated
 * with FSQ_PORTAL_TOKEN. The catalog endpoint, warehouse, namespace and table
 * names are published only on the portal's "OS Places -> Code" page, which
 * needs the owner's account. Until they are filled in below and a runner is
 * wired, `amenitiesNear` reports the source as unavailable instead of guessing.
 * The column names follow Foursquare's published OS Places schema.
 *
 * What is built and tested now: the query (a bounding box around a ~1 km-rounded
 * point, so the exact site never leaves the product; closed places excluded;
 * only the columns needed), category matching, and the per-category summary.
 *
 * Never bulk-downloaded: each lookup reads only the rows inside its box.
 */

import { SourceError } from "../http";

export const SOURCE_ID = "foursquarePlaces";

/**
 * Connection details from the Places Portal's code page. Not secrets (the
 * token is), but unknown until the owner signs in; null means not configured.
 */
export const CATALOG: { endpoint: string | null; warehouse: string | null; table: string | null } = {
  endpoint: null,
  warehouse: null,
  table: null,
};

export const MAX_RADIUS_MILES = 3;
const ROUNDING_PAD_MILES = 0.5;

/** Amenity groups, matched on Foursquare category labels ("Retail > Food and Beverage Retail > Grocery Store"). */
export const AMENITIES = {
  grocery: [/\bGrocery Store\b/i, /\bSupermarket\b/i],
  pharmacy: [/\bPharmacy\b/i, /\bDrugstore\b/i],
  bank: [/\bBank\b/i, /\bCredit Union\b/i],
  restaurant: [/^Dining and Drinking > Restaurant\b/i],
  retail: [/^Retail\b/i],
} as const;
export type Amenity = keyof typeof AMENITIES;

export interface PlaceRow {
  name: string;
  latitude: number;
  longitude: number;
  categoryLabels: string[];
  /** ISO date Foursquare last refreshed the record. */
  dateRefreshed: string | null;
}

export interface AmenitySummary {
  count: number;
  nearestMiles: number | null;
  nearestName: string | null;
}

export interface AmenitiesNear {
  radiusMiles: number;
  amenities: Record<Amenity, AmenitySummary>;
  /** Newest and median refresh dates of the places counted, as a freshness indicator. */
  newestRefresh: string | null;
  medianRefresh: string | null;
}

/** Runs one SQL statement against the catalog and returns rows; supplied by the DuckDB wiring. */
export type QueryRunner = (sql: string) => Promise<PlaceRow[]>;

function milesBetween(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(a));
}

/** The box sent to the catalog: around the rounded point, padded for the rounding. */
export function queryBox(lon: number, lat: number, radiusMiles: number) {
  const rLon = Number(lon.toFixed(2));
  const rLat = Number(lat.toFixed(2));
  const miles = radiusMiles + ROUNDING_PAD_MILES;
  const dLat = miles / 69.0;
  const dLon = miles / (69.172 * Math.cos((rLat * Math.PI) / 180));
  return { west: rLon - dLon, south: rLat - dLat, east: rLon + dLon, north: rLat + dLat };
}

/** SQL for one lookup. Numbers only are interpolated, so there is nothing to inject. */
export function buildSql(table: string, lon: number, lat: number, radiusMiles: number): string {
  if (!/^[A-Za-z0-9_.]+$/.test(table)) throw new SourceError(SOURCE_ID, "rejected", "invalid table name");
  const b = queryBox(lon, lat, radiusMiles);
  const n = (x: number) => x.toFixed(5);
  return [
    "SELECT name, latitude, longitude, fsq_category_labels, date_refreshed",
    `FROM ${table}`,
    "WHERE date_closed IS NULL",
    `  AND latitude BETWEEN ${n(b.south)} AND ${n(b.north)}`,
    `  AND longitude BETWEEN ${n(b.west)} AND ${n(b.east)}`,
  ].join("\n");
}

export function amenityOf(labels: readonly string[]): Amenity[] {
  const out: Amenity[] = [];
  for (const [amenity, patterns] of Object.entries(AMENITIES) as Array<[Amenity, readonly RegExp[]]>) {
    if (labels.some((l) => patterns.some((p) => p.test(l)))) out.push(amenity);
  }
  return out;
}

/** Summarise rows around the exact point; rows outside the radius are dropped. */
export function summarise(rows: readonly PlaceRow[], lon: number, lat: number, radiusMiles: number): AmenitiesNear {
  const amenities = Object.fromEntries(
    (Object.keys(AMENITIES) as Amenity[]).map((a) => [a, { count: 0, nearestMiles: null, nearestName: null }])
  ) as Record<Amenity, AmenitySummary>;
  const refreshed: string[] = [];
  for (const r of rows) {
    const d = milesBetween(lon, lat, r.longitude, r.latitude);
    if (!(d <= radiusMiles)) continue;
    const kinds = amenityOf(r.categoryLabels);
    if (kinds.length === 0) continue;
    if (r.dateRefreshed) refreshed.push(r.dateRefreshed);
    for (const k of kinds) {
      const s = amenities[k];
      s.count++;
      if (s.nearestMiles == null || d < s.nearestMiles) {
        s.nearestMiles = Math.round(d * 100) / 100;
        s.nearestName = r.name;
      }
    }
  }
  refreshed.sort();
  return {
    radiusMiles,
    amenities,
    newestRefresh: refreshed.at(-1) ?? null,
    medianRefresh: refreshed.length ? refreshed[Math.floor((refreshed.length - 1) / 2)] : null,
  };
}

/**
 * Amenities within `radiusMiles` of a point. `runner` executes SQL against the
 * catalog; without a configured catalog, a runner, or FSQ_PORTAL_TOKEN, the
 * source is reported unavailable.
 */
export async function amenitiesNear(
  lon: number,
  lat: number,
  radiusMiles = 1,
  runner: QueryRunner | null = null
): Promise<AmenitiesNear> {
  if (!(Math.abs(lon) <= 180 && Math.abs(lat) <= 90)) throw new SourceError(SOURCE_ID, "rejected", "coordinates out of range");
  if (!(radiusMiles > 0 && radiusMiles <= MAX_RADIUS_MILES)) {
    throw new SourceError(SOURCE_ID, "rejected", `radius must be between 0 and ${MAX_RADIUS_MILES} miles`);
  }
  if (!process.env.FSQ_PORTAL_TOKEN?.trim()) {
    throw new SourceError(SOURCE_ID, "missing-key", "FSQ_PORTAL_TOKEN is not set");
  }
  if (!CATALOG.endpoint || !CATALOG.table || !runner) {
    throw new SourceError(SOURCE_ID, "unavailable", "Foursquare catalog connection is not configured yet");
  }
  return summarise(await runner(buildSql(CATALOG.table, lon, lat, radiusMiles)), lon, lat, radiusMiles);
}
