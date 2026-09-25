import { describe, expect, it } from "vitest";
import { countByTract } from "./sites";

describe("countByTract", () => {
  const index = { locate: (lon: number) => (lon < 0 ? "01001000100" : null) };

  it("counts each program per tract and reports points with no tract", () => {
    const { counts, unplaced } = countByTract(index, [
      { lon: -1, lat: 0, kind: "npl" },
      { lon: -1, lat: 0, kind: "brownfield" },
      { lon: -1, lat: 0, kind: "brownfield" },
      { lon: 1, lat: 0, kind: "brownfield" },
      { lon: Number.NaN, lat: 0, kind: "npl" },
    ]);
    expect(counts.get("01001000100")).toEqual({ npl: 1, brownfield: 2 });
    expect(unplaced).toBe(2);
  });
});
