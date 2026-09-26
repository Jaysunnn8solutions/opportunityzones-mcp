import { describe, expect, it } from "vitest";
import { isBoundaryIndex, statesInView, type BoundaryIndex } from "./stateBoundaries";

const index: BoundaryIndex = {
  vintage: 2024,
  source: "test",
  states: {
    "13": { tracts: 2796, bbox: [-85.61, 30.36, -80.84, 35.0], bytes: 1 }, // Georgia
    "01": { tracts: 1437, bbox: [-88.47, 30.14, -84.89, 35.01], bytes: 1 }, // Alabama
    "12": { tracts: 5160, bbox: [-87.63, 24.4, -79.97, 31.0], bytes: 1 }, // Florida
    "06": { tracts: 9129, bbox: [-124.48, 32.53, -114.13, 42.01], bytes: 1 }, // California
  },
};

describe("statesInView", () => {
  it("loads Georgia first for a view centred on Atlanta, then neighbours that overlap", () => {
    expect(statesInView(index, { west: -86.5, south: 32.0, east: -82.5, north: 35.5 })).toEqual(["13", "01"]);
    // Further south the view reaches Florida too.
    expect(statesInView(index, { west: -86.5, south: 30.0, east: -82.5, north: 34.0 })).toEqual(["13", "01", "12"]);
  });

  it("returns only states that overlap", () => {
    expect(statesInView(index, { west: -84.5, south: 33.5, east: -84.2, north: 33.9 })).toEqual(["13"]);
    expect(statesInView(index, { west: -100, south: 40, east: -99, north: 41 })).toEqual([]);
  });

  it("caps the number of files per view", () => {
    expect(statesInView(index, { west: -130, south: 20, east: -70, north: 50 }, 2)).toHaveLength(2);
  });
});

describe("isBoundaryIndex", () => {
  it("accepts the pipeline's index and rejects anything else", () => {
    expect(isBoundaryIndex(index)).toBe(true);
    expect(isBoundaryIndex(null)).toBe(false);
    expect(isBoundaryIndex({ states: { GA: { bbox: [0, 0, 1, 1] } } })).toBe(false);
    expect(isBoundaryIndex({ states: { "13": { bbox: [0, 0] } } })).toBe(false);
  });
});
