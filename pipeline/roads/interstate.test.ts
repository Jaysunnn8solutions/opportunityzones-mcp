import { describe, expect, it } from "vitest";
import { MAX_MILES, SegmentIndex } from "./interstate";

const line = (coords: number[][], name: string) => ({ parts: [new Float64Array(coords.flat())], name });

describe("SegmentIndex", () => {
  // A north-south Interstate at lon -84.0 and a farther one at lon -83.0.
  const index = new SegmentIndex([
    line([[-84.0, 33.0], [-84.0, 34.0]], "I- 75"),
    line([[-83.0, 33.0], [-83.0, 34.0]], "I- 16"),
  ]);

  it("finds the nearest segment and its distance", () => {
    const n = index.nearest(-84.1, 33.5)!;
    expect(n.name).toBe("I- 75");
    // 0.1 degree of longitude at 33.5N is about 5.77 miles.
    expect(n.miles).toBeCloseTo(0.1 * 69.172 * Math.cos((33.5 * Math.PI) / 180), 1);
  });

  it("searches across several grid cells to reach a distant segment", () => {
    const n = index.nearest(-84.8, 33.5)!;
    expect(n.name).toBe("I- 75");
    expect(n.miles).toBeGreaterThan(40);
  });

  it("returns null beyond the search limit", () => {
    expect(index.nearest(-150, 60)).toBeNull();
    expect(MAX_MILES).toBeGreaterThan(0);
  });
});
