import { describe, expect, it } from "vitest";
import { mapFeaturesForMatches } from "./mapMatches";

const tracts = ["10001040100", "10001040200", "10003000100", "24001000100"].map((GEOID) => ({ properties: { GEOID }, geometry: { type: "Polygon" } }));
const counties = ["10001", "10003", "24001"].map((GEOID) => ({ properties: { GEOID } }));

describe("map geometry for search results", () => {
  it("includes only matching tracts in the rendered and clickable source", () => {
    expect(mapFeaturesForMatches(tracts, new Set(["10001040200"]), "tract")).toEqual([tracts[1]]);
  });
  it("shows no overlays for zero matches or pending results, and restores all geometry when cleared", () => {
    expect(mapFeaturesForMatches(tracts, new Set(), "tract")).toEqual([]);
    expect(mapFeaturesForMatches(counties, new Set(), "county")).toEqual([]);
    expect(mapFeaturesForMatches(tracts, null, "tract")).toEqual(tracts);
    expect(mapFeaturesForMatches(counties, null, "county")).toEqual(counties);
  });
  it("limits zoomed-out counties to those containing matching tracts without changing the cached boundaries", () => {
    const cache = new Map(counties.map((feature) => [feature.properties.GEOID, feature]));
    expect(mapFeaturesForMatches(cache.values(), new Set(["10001040100", "10001040200"]), "county")).toEqual([counties[0]]);
    expect(mapFeaturesForMatches(cache.values(), null, "county")).toEqual(counties);
  });
});
