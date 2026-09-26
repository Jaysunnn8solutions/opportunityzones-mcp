import { describe, expect, it } from "vitest";
import { interiorPoint } from "./interiorPoint";

const inside = (x: number, y: number, ring: number[][]) => {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};

describe("interiorPoint", () => {
  it("uses the centroid of a simple square", () => {
    const [x, y] = interiorPoint({ type: "Polygon", coordinates: [[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]]] })!;
    expect(x).toBeCloseTo(2);
    expect(y).toBeCloseTo(2);
  });

  it("finds a point inside a U shape, whose centroid is outside", () => {
    const u = [[0, 0], [6, 0], [6, 6], [4, 6], [4, 2], [2, 2], [2, 6], [0, 6], [0, 0]];
    const p = interiorPoint({ type: "Polygon", coordinates: [u] })!;
    expect(inside(p[0], p[1], u)).toBe(true);
  });

  it("avoids a hole at the centre", () => {
    const outer = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
    const hole = [[3, 3], [7, 3], [7, 7], [3, 7], [3, 3]];
    const p = interiorPoint({ type: "Polygon", coordinates: [outer, hole] })!;
    expect(inside(p[0], p[1], outer) && !inside(p[0], p[1], hole)).toBe(true);
  });

  it("picks the largest part of a multi-part tract", () => {
    const p = interiorPoint({
      type: "MultiPolygon",
      coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]], [[[10, 10], [20, 10], [20, 20], [10, 20], [10, 10]]]],
    })!;
    expect(p[0]).toBeGreaterThan(10);
  });

  it("returns null for anything that is not a polygon", () => {
    expect(interiorPoint({ type: "Point", coordinates: [0, 0] })).toBeNull();
  });
});
