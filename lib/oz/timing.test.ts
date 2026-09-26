import { describe, expect, it } from "vitest";
import { longDate, NEW_RULES_START, windowEnd } from "./timing";

describe("windowEnd", () => {
  it("counts the sale date as day 1 of the 180, across month and year ends", () => {
    expect(longDate(windowEnd("2026-03-15")!)).toBe("September 10, 2026");
    expect(longDate(windowEnd("2026-09-26")!)).toBe("March 24, 2027");
    // January 1 is day 1, so the period ends 179 days later (2026 is not a leap year).
    expect(longDate(windowEnd("2026-01-01")!)).toBe("June 29, 2026");
  });

  it("puts the first 2026 sale whose window reaches January 1, 2027, on July 6", () => {
    expect(longDate(windowEnd("2026-07-05")!)).toBe("December 31, 2026");
    expect(longDate(windowEnd("2026-07-06")!)).toBe("January 1, 2027");
    expect(windowEnd("2026-07-05")! < NEW_RULES_START).toBe(true);
    expect(windowEnd("2026-07-06")! >= NEW_RULES_START).toBe(true);
  });

  it("tells whether the window reaches the 2027 rules", () => {
    expect(windowEnd("2026-03-15")! < NEW_RULES_START).toBe(true);
    expect(windowEnd("2026-09-26")! >= NEW_RULES_START).toBe(true);
  });

  it("rejects anything that is not a date", () => {
    expect(windowEnd("")).toBeNull();
    expect(windowEnd("next tuesday")).toBeNull();
    expect(windowEnd("2026-02-30x")).toBeNull();
    expect(windowEnd("2026-02-30")).toBeNull();
  });
});
