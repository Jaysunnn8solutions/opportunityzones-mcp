import { describe, expect, it } from "vitest";
import { longDate, NEW_RULES_START, windowEnd } from "./timing";

describe("windowEnd", () => {
  it("adds 180 days, across month and year ends", () => {
    expect(longDate(windowEnd("2026-03-15")!)).toBe("September 11, 2026");
    expect(longDate(windowEnd("2026-09-26")!)).toBe("March 25, 2027");
  });

  it("tells whether the window reaches the 2027 rules", () => {
    expect(windowEnd("2026-03-15")! < NEW_RULES_START).toBe(true);
    expect(windowEnd("2026-09-26")! >= NEW_RULES_START).toBe(true);
  });

  it("rejects anything that is not a date", () => {
    expect(windowEnd("")).toBeNull();
    expect(windowEnd("next tuesday")).toBeNull();
    expect(windowEnd("2026-02-30x")).toBeNull();
  });
});
