import { describe, expect, it } from "vitest";
import { FLAGS } from "@/lib/data/flags";
import { filtersActive, matchingTracts, NO_FILTERS } from "./filter";
import type { ExploreState } from "./measures";

const { eligible, qct, nmtc } = FLAGS;
// measures: income, home value, built since 2010, bachelor's, unemployment; then neighbour count.
const data: ExploreState = {
  measures: ["median_household_income", "median_home_value", "share_built_2010_or_later", "bachelors_or_higher_share", "unemployment_rate"],
  rows: [
    ["A", eligible | qct, 90000, 400000, 0.3, 0.5, 0.02, 5],
    ["B", eligible, 60000, 200000, 0.1, 0.3, 0.05, 4],
    ["C", qct | nmtc, 40000, 150000, 0.05, 0.2, 0.08, 6],
    ["D", 0, 30000, 100000, 0.02, 0.1, 0.1, 3],
  ],
};

describe("Find areas filters", () => {
  it("matches every tract with no filters, and says they are inactive", () => {
    expect(filtersActive(NO_FILTERS)).toBe(false);
    expect(matchingTracts(data, NO_FILTERS).size).toBe(4);
  });

  it("combines designations with all or any", () => {
    expect([...matchingTracts(data, { ...NO_FILTERS, flags: ["eligible", "qct"], mode: "all" })]).toEqual(["A"]);
    expect([...matchingTracts(data, { ...NO_FILTERS, flags: ["eligible", "nmtc"], mode: "any" })]).toEqual(["A", "B", "C"]);
  });

  it("keeps tracts whose neighbours rank in the chosen share of the state", () => {
    const top = matchingTracts(data, { ...NO_FILTERS, tiers: { median_household_income: "top50" } });
    expect([...top]).toEqual(["A", "B"]);
    // Lower unemployment is the stronger end.
    const lowUnemp = matchingTracts(data, { ...NO_FILTERS, tiers: { unemployment_rate: "top25" } });
    expect([...lowUnemp]).toEqual(["A"]);
  });

  it("applies designations and surroundings together", () => {
    const f = { flags: ["qct" as const], mode: "all" as const, tiers: { median_home_value: "top50" as const } };
    expect([...matchingTracts(data, f)]).toEqual(["A"]);
    expect(filtersActive(f)).toBe(true);
  });
});
