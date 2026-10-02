import { describe, expect, it } from "vitest";
import { weightedMean } from "./explore";

describe("neighbors' averages", () => {
  it("weights by population and skips neighbors without a value", () => {
    expect(weightedMean([100, 200], [1, 3])).toBe(175);
    expect(weightedMean([100, null], [1, 5])).toBe(100);
    expect(weightedMean([null, 5], [2, 0])).toBeNull();
    expect(weightedMean([], [])).toBeNull();
  });
});
