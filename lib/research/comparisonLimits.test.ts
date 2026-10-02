import { expect, it } from "vitest";
import { comparisonIds, comparisonLimit } from "./comparisonLimits";

it("preserves selected order, deduplicates, and rejects oversized comparison links", () => {
  const ids = Array.from({ length: 25 }, (_, i) => String(13001000100 + i)).reverse();
  expect(comparisonIds([...ids, ids[0], "invalid"].join(","))).toEqual(ids);
  expect(() => comparisonIds([...ids, "13001000200"].join(","))).toThrow(/25/);
  expect(comparisonLimit(true)).toBe(25);
  expect(comparisonLimit(false)).toBe(2);
});
