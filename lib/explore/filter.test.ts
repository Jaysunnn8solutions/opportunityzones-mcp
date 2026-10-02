import { describe, expect, it } from "vitest";
import { FLAGS } from "@/lib/data/flags";
import { filtersActive, matchingTracts, NO_FILTERS, parseFilters, filterDescription } from "./filter";
import type { ExploreState } from "./measures";
import { compileCriteria, removeCriterion } from "./evidence";

const { eligible, qct, nmtc } = FLAGS;
// measures: income, home value, built since 2010, bachelor's, unemployment; then neighbor count.
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
  it("finds historical overlap with known 2027 ineligibility, excluding unknowns and below-threshold overlap", () => {
    const programs = [
      { oz2018_population_share: .5, eligible_2027: 0 },
      { oz2018_population_share: 1, eligible_2027: 1 },
      { oz2018_population_share: .49, eligible_2027: 0 },
      { oz2018_population_share: 1, eligible_2027: null },
      { oz2018_population_share: null, eligible_2027: 0 },
    ];
    const sample: ExploreState = { measures: [], rows: programs.map((_, i) => [String(i), FLAGS.oz2018 | FLAGS.qct]),
      tracts: Object.fromEntries(programs.map((program, i) => [String(i), { county: "Test", rural: null, values: {}, programs: { ...program, qct_2026: 1 } }])) };
    const filters = { ...NO_FILTERS, eligibilityChange: "2018-ineligible2027" as const };
    expect([...matchingTracts(sample, filters)]).toEqual(["0"]);
    expect(compileCriteria(sample, filters)(sample.rows[3])[0].result).toBe("Unknown");
    expect(compileCriteria(sample, filters)(sample.rows[4])[0].result).toBe("Unknown");
    expect(matchingTracts({ ...sample, tracts: undefined }, filters).size).toBe(0);
    expect(filtersActive(filters)).toBe(true);
    expect(parseFilters(JSON.stringify(filters)).eligibilityChange).toBe(filters.eligibilityChange);
    expect(filterDescription(filters)).toContain("AND not eligible for 2027");
    expect(filtersActive(removeCriterion(filters, "eligibilityChange"))).toBe(false);
    // Program OR must not turn eligibility change itself into an OR condition.
    expect([...matchingTracts(sample, { ...filters, mode: "any", flags: ["eligible", "qct"] })]).toEqual(["0"]);
  });
  it("preserves a requested unavailable forecast so it cannot silently broaden to all tracts", () => {
    const parsed = parseFilters(JSON.stringify({ ...NO_FILTERS, eligibilityChange: "2027-ineligible2037" }));
    expect(filtersActive(parsed)).toBe(true);
    expect(matchingTracts(data, parsed).size).toBe(0);
    expect(compileCriteria(data, parsed)(data.rows[0])[0].result).toBe("Unknown");
    expect(filterDescription(parsed)).toContain("forecast unavailable");
  });
  it("excludes unknown rural values and missing constrained measures", () => {
    const facts: ExploreState = { ...data, tracts: {
      A: { county: "A", rural: true, values: { median_home_value: 100000 } },
      B: { county: "B", rural: false, values: { median_home_value: 0 } },
      C: { county: "C", rural: null, values: { median_home_value: null } },
    } };
    expect([...matchingTracts(facts, { ...NO_FILTERS, rural: "not-rural" })]).toEqual(["B"]);
    expect([...matchingTracts(facts, { ...NO_FILTERS, ranges: { median_home_value: { max: 50000 } } })]).toEqual(["B"]);
    expect([...matchingTracts(facts, { ...NO_FILTERS, ranges: { median_home_value: { min: 200000, max: 100000 } } })]).toEqual([]);
  });
  it("round-trips public criteria and rejects unsupported or malformed inputs", () => {
    const parsed = parseFilters(JSON.stringify({ ...NO_FILTERS, flags: ["eligible", "bogus"], rural: "rural", ranges: { median_home_value: { min: 50000, max: 200000 }, bogus: { min: 1 } }, tiers: { unemployment_rate: "top25" } }));
    expect(parsed.flags).toEqual(["eligible"]);
    expect(parsed.ranges).not.toHaveProperty("bogus");
    expect(parseFilters(JSON.stringify(parsed))).toEqual(parsed);
    expect(filterDescription(parsed)).toContain("lower 25%");
    expect(parseFilters("invalid")).toEqual(NO_FILTERS);
  });
  it("matches every tract with no filters, and says they are inactive", () => {
    expect(filtersActive(NO_FILTERS)).toBe(false);
    expect(matchingTracts(data, NO_FILTERS).size).toBe(4);
  });

  it("combines designations with all or any", () => {
    expect([...matchingTracts(data, { ...NO_FILTERS, flags: ["eligible", "qct"], mode: "all" })]).toEqual(["A"]);
    expect([...matchingTracts(data, { ...NO_FILTERS, flags: ["eligible", "nmtc"], mode: "any" })]).toEqual(["A", "B", "C"]);
  });

  it("keeps tracts whose neighbors rank in the chosen share of the state", () => {
    const top = matchingTracts(data, { ...NO_FILTERS, tiers: { median_household_income: "top50" } });
    expect([...top]).toEqual(["A", "B"]);
    // Preserve the lower direction of legacy unemployment links.
    const lowUnemp = matchingTracts(data, { ...NO_FILTERS, tiers: { unemployment_rate: "top25" } });
    expect([...lowUnemp]).toEqual(["A"]);
  });

  it("applies designations and surroundings together", () => {
    const f = { flags: ["qct" as const], mode: "all" as const, tiers: { median_home_value: "top50" as const } };
    expect([...matchingTracts(data, f)]).toEqual(["A"]);
    expect(filtersActive(f)).toBe(true);
  });

  it("lets every neighboring measure use either direction without a preferred default", () => {
    for (const column of data.measures) {
      const lower = [...matchingTracts(data, { ...NO_FILTERS, tiers: { [column]: "lower50" } })];
      const higher = [...matchingTracts(data, { ...NO_FILTERS, tiers: { [column]: "higher50" } })];
      expect(lower.length).toBe(2);
      expect(higher.length).toBe(2);
      expect(lower.filter((id) => higher.includes(id))).toEqual([]);
      expect(new Set([...lower, ...higher]).size).toBe(4);
    }
  });

  it("migrates old links without changing their selected tracts", () => {
    for (const column of data.measures) {
      const legacy = { ...NO_FILTERS, tiers: { [column]: "top25" as const } };
      const restored = parseFilters(JSON.stringify(legacy));
      expect([...matchingTracts(data, restored)]).toEqual([...matchingTracts(data, legacy)]);
      expect(restored.tiers[column]).toBe(column === "unemployment_rate" ? "lower25" : "higher25");
    }
  });

  it("includes boundary ties, excludes unknown values, and ignores unsupported targeting fields", () => {
    const sample: ExploreState = { measures: ["median_household_income"], rows: [["A", 0, 10], ["B", 0, 10], ["C", 0, null], ["D", 0, 30]] };
    const parsed = parseFilters(JSON.stringify({ ...NO_FILTERS, tiers: { median_household_income: "lower10", religion: "higher10" }, ranges: { race: { min: 1 } } }));
    expect([...matchingTracts(sample, parsed)]).toEqual(["A", "B"]);
    expect(parsed.tiers).not.toHaveProperty("religion");
    expect(parsed.ranges).not.toHaveProperty("race");
  });
});
