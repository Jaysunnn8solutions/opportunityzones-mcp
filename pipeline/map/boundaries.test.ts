import { describe, expect, it } from "vitest";
import { bbox, roundRing, signedArea, stateFiles, toGeometry, type BoundaryFeature } from "./boundaries";

/** A flat shapefile ring from [x, y] pairs. */
const flat = (pts: Array<[number, number]>) => new Float64Array(pts.flat());
// Shapefile winding: outer rings clockwise, holes counter-clockwise (y up).
const outerCw = (x0: number, y0: number, s: number) => flat([[x0, y0], [x0, y0 + s], [x0 + s, y0 + s], [x0 + s, y0], [x0, y0]]);
const holeCcw = (x0: number, y0: number, s: number) => flat([[x0, y0], [x0 + s, y0], [x0 + s, y0 + s], [x0, y0 + s], [x0, y0]]);

describe("roundRing", () => {
  it("rounds, drops repeats the rounding creates, and closes the ring", () => {
    const r = roundRing(flat([[-84.123456, 33.1], [-84.123451, 33.1], [-84, 33.2], [-83.9, 33.1]]))!;
    expect(r).toEqual([[-84.1235, 33.1], [-84, 33.2], [-83.9, 33.1], [-84.1235, 33.1]]);
  });

  it("drops a ring that collapses to a line", () => {
    expect(roundRing(flat([[0, 0], [0.00001, 0], [0.00002, 0], [0, 0]]))).toBeNull();
  });
});

describe("toGeometry", () => {
  it("rewinds a single shapefile ring to a counter-clockwise GeoJSON polygon", () => {
    const g = toGeometry([outerCw(0, 0, 1)])!;
    expect(g.type).toBe("Polygon");
    expect(signedArea((g as { coordinates: Array<Array<[number, number]>> }).coordinates[0])).toBeGreaterThan(0);
  });

  it("puts a hole inside its outer ring, wound clockwise", () => {
    const g = toGeometry([outerCw(0, 0, 10), holeCcw(4, 4, 2)])!;
    expect(g.type).toBe("Polygon");
    const [outer, hole] = (g as { coordinates: Array<Array<[number, number]>> }).coordinates;
    expect(signedArea(outer)).toBeGreaterThan(0);
    expect(signedArea(hole)).toBeLessThan(0);
  });

  it("assigns each hole to the smallest ring containing it in a multi-part tract", () => {
    const g = toGeometry([outerCw(0, 0, 10), outerCw(20, 0, 5), holeCcw(21, 1, 1), holeCcw(2, 2, 1)])!;
    expect(g.type).toBe("MultiPolygon");
    const polys = g.coordinates as Array<Array<Array<[number, number]>>>;
    expect(polys.map((p) => p.length)).toEqual([2, 2]);
    expect(polys[1][1][0]).toEqual([21, 1]);
  });

  it("keeps an orphan hole as its own polygon rather than losing area", () => {
    const g = toGeometry([outerCw(0, 0, 1), holeCcw(5, 5, 1)])!;
    expect(g.type).toBe("MultiPolygon");
  });

  it("returns null when nothing survives", () => {
    expect(toGeometry([])).toBeNull();
  });
});

describe("stateFiles", () => {
  const feature = (geoid: string, x: number): BoundaryFeature => ({
    type: "Feature",
    properties: { GEOID: geoid },
    geometry: toGeometry([outerCw(x, 30, 1)])!,
  });

  it("splits by state, sorts by GEOID, and records counts and bounding boxes", () => {
    const files = stateFiles([feature("13121003500", -84), feature("01001020100", -86), feature("13089020100", -85)]);
    expect([...files.keys()]).toEqual(["01", "13"]);
    const ga = files.get("13")!;
    expect(ga.tracts).toBe(2);
    expect(ga.bbox).toEqual([-85, 30, -83, 31]);
    const parsed = JSON.parse(ga.json) as { features: BoundaryFeature[] };
    expect(parsed.features.map((f) => f.properties.GEOID)).toEqual(["13089020100", "13121003500"]);
    expect(Object.keys(parsed.features[0].properties)).toEqual(["GEOID"]);
  });

  it("rejects a GEOID that is not a tract", () => {
    expect(() => stateFiles([feature("13121", -84)])).toThrow(/not 11 digits/);
  });

  it("computes a bounding box over multi-part tracts", () => {
    const multi: BoundaryFeature = { type: "Feature", properties: { GEOID: "15001021010" }, geometry: toGeometry([outerCw(0, 0, 1), outerCw(5, 5, 1)])! };
    expect(bbox([multi])).toEqual([0, 0, 6, 6]);
  });
});
