import { describe, expect, it, vi } from "vitest";
import gazetteer from "@/data/place-names.json";
import { cityMapHref, createPlaceIndex, findCities, type GazetteerRow } from "@/lib/geo/placeNames";

const states = [{ name: "Georgia", usps: "GA" }, { name: "Illinois", usps: "IL" }, { name: "Puerto Rico", usps: "PR" }];
const index = createPlaceIndex(gazetteer.rows as GazetteerRow[]);
vi.mock("@/lib/data/stateViews", () => ({ stateSummaries: () => states }));
const access = vi.hoisted(() => ({ sameOrigin: vi.fn(), limitRequest: vi.fn() }));
vi.mock("@/lib/access/http", () => ({ ...access, readBody: (req: Request) => req.json(), failure: () => Response.json({ error: "Rejected" }, { status: 403 }) }));
import { POST } from "@/app/api/places/route";

describe("Census city navigation", () => {
  it("finds cities by name and either state abbreviation or full state name", () => {
    const abbreviated = findCities(index, "Atlanta, GA", states);
    expect(abbreviated.matches).toHaveLength(1);
    expect(abbreviated.matches[0]).toMatchObject({ geoid: "1304000", name: "Atlanta city", usps: "GA" });
    expect(findCities(index, "atlanta Georgia", states)).toEqual(abbreviated);
    expect(findCities(index, "Atlanta city, GA", states)).toEqual(abbreviated);
    expect(cityMapHref(abbreviated.matches[0])).toMatch(/^\/map#s=13&v=-84\./);
    expect(cityMapHref(abbreviated.matches[0])).toContain("&m=map");
  });
  it("offers bounded, deterministic choices for ambiguous names", () => {
    const result = findCities(index, "Springfield", states);
    expect(result.matches).toHaveLength(12);
    expect(result.more).toBe(true);
    const local = findCities(index, "Springfield, Illinois", states);
    expect(local.matches).toHaveLength(1);
    expect(local.matches[0].usps).toBe("IL");
  });
  it("normalizes accents and punctuation and leaves addresses for the geocoder", () => {
    expect(findCities(index, "San Sebastian, PR", states).matches[0]?.name).toContain("San Sebastián");
    expect(findCities(index, "55 Trinity Ave SW, Atlanta, GA 30303", states).matches).toEqual([]);
    expect(findCities(index, "13001950100", states).matches).toEqual([]);
    expect(findCities(index, "nonexistent city zzzz", states).matches).toEqual([]);
  });
  it("ships valid reference points without placing the full national index in a response", async () => {
    expect(index.length).toBeGreaterThan(30_000);
    for (const item of index) {
      expect(item.location.geoid).toMatch(/^\d{7}$/);
      expect(item.location.view.every(Number.isFinite)).toBe(true);
    }
    const req = new Request("http://localhost/api/places", { method: "POST", body: JSON.stringify({ query: "Atlanta, GA" }) });
    const response = await POST(req);
    expect(access.sameOrigin).toHaveBeenCalledWith(req);
    expect(access.limitRequest).toHaveBeenCalledWith(req, "read");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect((await response.json()).matches).toHaveLength(1);
    const invalid = await POST(new Request("http://localhost/api/places", { method: "POST", body: JSON.stringify({ query: "x".repeat(201) }) }));
    expect(invalid.status).toBe(400);
  });
});
