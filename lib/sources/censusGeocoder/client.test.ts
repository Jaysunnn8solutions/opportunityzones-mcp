import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SourceError } from "../http";
import { geocodeAddress, parseAddressResponse, parsePointResponse, tractAtPoint } from "./client";

// Fixtures are real Census Geocoder responses recorded 2026-09-25 for a public
// landmark (the White House), a nonsense address, and a point.
const fixture = (name: string) =>
  JSON.parse(readFileSync(path.join(import.meta.dirname, "fixtures", name), "utf8")) as unknown;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseAddressResponse", () => {
  it("returns the tract GEOID, parts and coordinates of a match", () => {
    const [m] = parseAddressResponse(fixture("address-match.json"));
    expect(m).toMatchObject({
      geoid: "11001980000",
      stateFips: "11",
      countyFips: "11001",
      tractName: "Census Tract 9800",
      matchedAddress: "1600 PENNSYLVANIA AVE NW, WASHINGTON, DC, 20500",
    });
    expect(m.lon).toBeCloseTo(-77.0352, 3);
    expect(m.lat).toBeCloseTo(38.8987, 3);
  });

  it("returns no candidates, not an error, when nothing matches", () => {
    expect(parseAddressResponse(fixture("address-no-match.json"))).toEqual([]);
  });

  it("rejects a body without addressMatches", () => {
    expect(() => parseAddressResponse({ errors: ["x"] })).toThrow(SourceError);
  });

  it("skips a match whose GEOID is malformed", () => {
    const bad = { result: { addressMatches: [{ coordinates: { x: 1, y: 2 }, geographies: { "Census Tracts": [{ GEOID: "123" }] } }] } };
    expect(parseAddressResponse(bad)).toEqual([]);
  });
});

describe("parsePointResponse", () => {
  it("returns the tract containing the point", () => {
    expect(parsePointResponse(fixture("coordinates.json"), -77.0352, 38.8987)).toMatchObject({
      geoid: "11001980000",
      lon: -77.0352,
      lat: 38.8987,
    });
  });

  it("returns null where no tract covers the point", () => {
    expect(parsePointResponse({ result: { geographies: { "Census Tracts": [] } } }, 0, 0)).toBeNull();
  });
});

describe("requests", () => {
  it("asks for current tracts and sends nothing but the query parameters", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(fixture("address-match.json"))));
    vi.stubGlobal("fetch", fetchMock);
    await geocodeAddress("1600 Pennsylvania Ave NW, Washington, DC 20500");
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toMatch(/onelineaddress$/);
    expect(url.searchParams.get("vintage")).toBe("Current_Current");
    expect(url.searchParams.get("layers")).toBe("Census Tracts");
  });

  it("refuses empty or oversized addresses without calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(geocodeAddress("  ")).rejects.toThrow(SourceError);
    await expect(geocodeAddress("x".repeat(201))).rejects.toThrow(SourceError);
    await expect(tractAtPoint(200, 10)).rejects.toThrow(SourceError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the address out of the error when the geocoder fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 502 })));
    const err = await geocodeAddress("742 Evergreen Terrace, Springfield").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SourceError);
    expect(String((err as Error).message)).not.toContain("Evergreen");
  });
});
