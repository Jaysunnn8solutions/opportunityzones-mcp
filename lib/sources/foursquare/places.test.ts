import { afterEach, describe, expect, it, vi } from "vitest";
import { SourceError } from "../http";
import { amenitiesNear, amenityOf, buildSql, summarize, type PlaceRow } from "./places";

// Hand-made rows in Foursquare's published OS Places shape. Not recorded from
// the live catalog: the connection is not configured yet (see places.ts).
const origin = { lon: -84.388, lat: 33.749 };
const row = (name: string, dLat: number, labels: string[], refreshed = "2026-06-01"): PlaceRow => ({
  name,
  latitude: origin.lat + dLat,
  longitude: origin.lon,
  categoryLabels: labels,
  dateRefreshed: refreshed,
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("amenityOf", () => {
  it("matches grocery, pharmacy, bank, restaurant and retail labels", () => {
    expect(amenityOf(["Retail > Food and Beverage Retail > Grocery Store"])).toEqual(["grocery", "retail"]);
    expect(amenityOf(["Health and Medicine > Pharmacy"])).toEqual(["pharmacy"]);
    expect(amenityOf(["Business and Professional Services > Financial Service > Bank"])).toEqual(["bank"]);
    expect(amenityOf(["Dining and Drinking > Restaurant > Mexican Restaurant"])).toEqual(["restaurant"]);
    expect(amenityOf(["Arts and Entertainment > Museum"])).toEqual([]);
  });
});

describe("summarize", () => {
  const rows = [
    row("Near Grocer", 0.005, ["Retail > Food and Beverage Retail > Grocery Store"], "2026-05-01"),
    row("Far Grocer", 0.012, ["Retail > Food and Beverage Retail > Grocery Store"], "2026-07-01"),
    row("Outside", 0.05, ["Retail > Food and Beverage Retail > Grocery Store"]),
    row("Pharmacy", 0.008, ["Health and Medicine > Pharmacy"], "2026-03-01"),
  ];
  const s = summarize(rows, origin.lon, origin.lat, 1);

  it("counts places within the radius and names the nearest", () => {
    expect(s.amenities.grocery.count).toBe(2);
    expect(s.amenities.grocery.nearestName).toBe("Near Grocer");
    expect(s.amenities.grocery.nearestMiles).toBeCloseTo(0.35, 1);
    expect(s.amenities.bank).toEqual({ count: 0, nearestMiles: null, nearestName: null });
  });

  it("reports freshness from the refresh dates of places counted", () => {
    expect(s.newestRefresh).toBe("2026-07-01");
    expect(s.medianRefresh).toBe("2026-05-01");
  });
});

describe("buildSql", () => {
  it("queries a box around the rounded point and excludes closed places", () => {
    const sql = buildSql("fsq.places", -84.38812, 33.74911, 1);
    expect(sql).toContain("date_closed IS NULL");
    expect(sql).not.toContain("84.38812");
    expect(sql).not.toContain("33.74911");
  });

  it("refuses a table name that could inject SQL", () => {
    expect(() => buildSql("places; DROP TABLE x", 0, 0, 1)).toThrow(SourceError);
  });
});

describe("amenitiesNear", () => {
  it("reports a missing token by name, without calling anything", async () => {
    vi.stubEnv("FSQ_PORTAL_TOKEN", "");
    const runner = vi.fn();
    const err = await amenitiesNear(-84.388, 33.749, 1, runner).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SourceError);
    expect((err as SourceError).kind).toBe("missing-key");
    expect((err as Error).message).toContain("FSQ_PORTAL_TOKEN");
    expect(runner).not.toHaveBeenCalled();
  });

  it("reports unavailable while the catalog connection is unconfigured", async () => {
    vi.stubEnv("FSQ_PORTAL_TOKEN", "placeholder-for-test");
    const err = await amenitiesNear(-84.388, 33.749, 1, vi.fn()).catch((e: unknown) => e);
    expect((err as SourceError).kind).toBe("unavailable");
  });
});
