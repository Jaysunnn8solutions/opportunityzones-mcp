import { describe, expect, it } from "vitest";
import { insideRings, TractIndex } from "./tractIndex";

const square = (x0: number, y0: number, x1: number, y1: number) => new Float64Array([x0, y0, x1, y0, x1, y1, x0, y1, x0, y0]);

describe("insideRings", () => {
  it("treats a hole as outside (even-odd rule)", () => {
    const rings = [square(0, 0, 10, 10), square(4, 4, 6, 6)];
    expect(insideRings(2, 2, rings)).toBe(true);
    expect(insideRings(5, 5, rings)).toBe(false);
  });
});

describe("TractIndex", () => {
  const index = new TractIndex([
    { geoid: "01001000100", rings: [square(-86.5, 32.4, -86.4, 32.5)] },
    // A two-part tract spanning a grid-cell boundary.
    { geoid: "01001000200", rings: [square(-86.1, 32.9, -85.9, 33.1), square(-85.5, 32.2, -85.4, 32.3)] },
  ]);

  it("finds the tract containing a point", () => {
    expect(index.locate(-86.45, 32.45)).toBe("01001000100");
  });

  it("finds a tract that spans grid cells, and either of its parts", () => {
    expect(index.locate(-85.95, 33.05)).toBe("01001000200");
    expect(index.locate(-86.05, 32.95)).toBe("01001000200");
    expect(index.locate(-85.45, 32.25)).toBe("01001000200");
  });

  it("returns null outside every tract", () => {
    expect(index.locate(-80, 25)).toBeNull();
  });
});
