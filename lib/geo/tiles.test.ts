import { describe, expect, it } from "vitest";
import { isValidTile, tileBounds, tileOf, tilesCovering, toleranceForZoom } from "./tiles";

describe("tiles", () => {
  it("gives the whole world at zoom 0", () => {
    const b = tileBounds(0, 0, 0);
    expect(b.west).toBe(-180);
    expect(b.east).toBe(180);
    expect(b.north).toBeCloseTo(85.0511, 3);
  });

  it("round-trips a point through its tile", () => {
    const { x, y } = tileOf(-84.388, 33.749, 12);
    const b = tileBounds(12, x, y);
    expect(-84.388).toBeGreaterThanOrEqual(b.west);
    expect(-84.388).toBeLessThan(b.east);
    expect(33.749).toBeLessThanOrEqual(b.north);
    expect(33.749).toBeGreaterThan(b.south);
  });

  it("lists the tiles covering a box", () => {
    const b = tileBounds(10, 100, 200);
    expect(tilesCovering({ ...b, east: b.east - 1e-9, south: b.south + 1e-9 }, 10)).toEqual([{ x: 100, y: 200 }]);
  });

  it("rejects out-of-range tiles", () => {
    expect(isValidTile(3, 8, 0)).toBe(false);
    expect(isValidTile(3, 7, 7)).toBe(true);
    expect(isValidTile(1.5, 0, 0)).toBe(false);
  });

  it("halves the tolerance with each zoom", () => {
    expect(toleranceForZoom(9) / toleranceForZoom(10)).toBeCloseTo(2, 10);
  });
});
