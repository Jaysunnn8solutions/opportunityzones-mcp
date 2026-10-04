import { describe, expect, it } from "vitest";
import type { PlaceProfile } from "@/lib/client/place";
import { comparisonOverview, placeNarrative } from "./measures";
import { parseResearchFile } from "./file";
import { compileCriteria, criteriaDiagnostics, removeCriterion } from "@/lib/explore/evidence";
import { matchingTracts, NO_FILTERS, type Filters } from "@/lib/explore/filter";
import type { ExploreState } from "@/lib/explore/measures";

function profile(id: string, value: number | null, vintage = "2020–2024"): PlaceProfile {
  return { geoid: id, state: "Georgia", county: "Test", rural: { treasury: null }, designation2027: { status: "pending", text: "Eligible; designation not recorded.", stateEligible: 10, stateCap: 2 }, measures: { poverty_rate: { value, source: "acs5" } }, sources: { acs5: { name: "ACS", publisher: "Census", geography: "tract", vintage, url: "https://www.census.gov/programs-surveys/acs" } } };
}
describe("descriptive research", () => {
  it("reports the unweighted middle tract rate for odd and even selections", () => {
    const profiles = [.1, .2, .6, .9].map((value, index) => profile(String(13001000100 + index), value));
    expect(comparisonOverview(profiles, ["poverty_rate"]).statistics[0]).toMatchObject({ value: .4, method: "Median tract rate", available: 4, partial: false });
    expect(comparisonOverview(profiles.slice(0, 3), ["poverty_rate"]).statistics[0].value).toBe(.2);
  });
  it("does not turn a missing value into zero", () => {
    expect(comparisonOverview([profile("13001000100", null), profile("13001000200", .3)], ["poverty_rate"]).statistics[0]).toMatchObject({ value: .3, available: 1, total: 2, partial: true });
    expect(placeNarrative(profile("13001000100", null), "work").facts.find((f) => f.key === "poverty_rate")?.text).toContain("Not available");
  });
  it("does not compare different source vintages", () => {
    expect(comparisonOverview([profile("13001000100", .2), profile("13001000200", .3, "2010–2014")], ["poverty_rate"]).statistics[0]).toMatchObject({ value: null, reason: "Sources, years, or geographies differ; summary withheld." });
  });
  it("keeps pending designation explicit", () => {
    expect(placeNarrative(profile("13001000100", .2), "overview").unknowns.join(" ")).toContain("not recorded");
  });
  it("handles empty selections, unavailable values, and actual zero", () => {
    expect(comparisonOverview([], []).statistics).toEqual([]);
    expect(comparisonOverview([profile("13001000100", null)], ["poverty_rate"]).statistics[0].value).toBeNull();
    expect(comparisonOverview([profile("13001000100", 0), profile("13001000200", NaN)], ["poverty_rate"]).statistics[0]).toMatchObject({ value: 0, available: 1, partial: true });
  });
  it("sums unique tract counts and labels partial totals", () => {
    const a = profile("13001000100", .2), b = profile("13003000200", .3), c = profile("01001000300", .4);
    a.measures.population = { value: 100, source: "acs5" };
    b.measures.population = { value: 300, source: "acs5" };
    const complete = comparisonOverview([a, b, a], ["population"]);
    expect(complete).toMatchObject({ tractCount: 2, countyCount: 2, stateCount: 1 });
    expect(complete.statistics[0]).toMatchObject({ value: 400, method: "Total", total: 2 });
    expect(comparisonOverview([a, b, c], ["population"]).statistics[0]).toMatchObject({ value: 400, method: "Partial total", available: 2, total: 3 });
  });
  it("labels median-of-medians and honors selected measures without aggregating margins of error", () => {
    const a = profile("13001000100", .2), b = profile("13001000200", .3);
    a.measures.median_household_income = { value: 40000, source: "acs5" };
    b.measures.median_household_income = { value: 80000, source: "acs5" };
    const overview = comparisonOverview([a, b], ["median_household_income", "built_2020_or_later_moe"]);
    expect(overview.statistics).toHaveLength(1);
    expect(overview.statistics[0]).toMatchObject({ value: 60000, method: "Median of tract medians" });
  });
  it("withholds statistics with missing or incompatible source metadata", () => {
    const a = profile("13001000100", .2), b = profile("13001000200", .3);
    for (const field of ["name", "publisher", "geography"] as const) {
      const changed = structuredClone(b);
      changed.sources!.acs5[field] = "Different";
      expect(comparisonOverview([a, changed], ["poverty_rate"]).statistics[0].value).toBeNull();
    }
    delete b.sources;
    expect(comparisonOverview([a, b], ["poverty_rate"]).statistics[0]).toMatchObject({ value: null, reason: "Source metadata is incomplete; summary withheld." });
  });
});

const data: ExploreState = { measures: ["median_home_value"], rows: [["13001000100", 129, 100000], ["13001000200", 1, null], ["13001000300", 0, 300000]], tracts: {
  "13001000100": { county: "A", rural: true, values: { median_home_value: 90000 }, programs: { eligible_2027: 1, designated_2027: null } },
  "13001000200": { county: "A", rural: null, values: { median_home_value: null }, programs: { eligible_2027: 1, designated_2027: 0 } },
  "13001000300": { county: "B", rural: false, values: { median_home_value: 300000 }, programs: { eligible_2027: 0, designated_2027: 0 } },
} };
describe("auditable screening", () => {
  it("uses the same evidence for filtering, including unknowns", () => {
    const filters: Filters = { ...NO_FILTERS, rural: "rural", ranges: { median_home_value: { max: 100000 } } };
    const evaluate = compileCriteria(data, filters);
    expect([...matchingTracts(data, filters)]).toEqual(["13001000100"]);
    expect(evaluate(data.rows[0]).every((e) => e.result === "Meets")).toBe(true);
    expect(evaluate(data.rows[1]).every((e) => e.result === "Unknown")).toBe(true);
  });
  it("treats pending designation as unknown, but supports any-mode eligibility", () => {
    const all: Filters = { ...NO_FILTERS, flags: ["eligible", "zone2027"] };
    expect(compileCriteria(data, all)(data.rows[0])[0].result).toBe("Unknown");
    expect(compileCriteria(data, { ...all, mode: "any" })(data.rows[0])[0].result).toBe("Meets");
  });
  it("excludes missing neighbor columns instead of silently ignoring a filter", () => {
    const filters: Filters = { ...NO_FILTERS, tiers: { unemployment_rate: "top10" } };
    expect(matchingTracts(data, filters).size).toBe(0);
    expect(compileCriteria(data, filters)(data.rows[0])[0].result).toBe("Unknown");
  });
  it("shows the exact cutoff and reports removable constraints", () => {
    const filters: Filters = { ...NO_FILTERS, rural: "rural", tiers: { median_home_value: "top50" } };
    const evidence = compileCriteria(data, filters)(data.rows[2]);
    expect(evidence[1].requirement).toContain("$300,000");
    expect(evidence[1].requirement).toContain("2 state tracts");
    expect(criteriaDiagnostics(data, filters).find((e) => e.id === "rural")?.without).toBe(1);
    expect(matchingTracts(data, removeCriterion(filters, "rural")).size).toBe(1);
  });
});
describe("portable public research file", () => {
  const file = { format: "opportunity-zone-research", version: 1, savedAt: "2026-09-27T00:00:00Z", geoids: ["13001000100"], state: "13", focus: "housing", measures: ["median_home_value"], filters: NO_FILTERS };
  it("round trips public selections and strips private and embedded content", () => {
    const parsed = parseResearchFile(JSON.stringify({ ...file, address: "Private address", persona: "investor", amount: 1234, facts: { return: 100 } }));
    expect(parsed).not.toHaveProperty("address"); expect(parsed).not.toHaveProperty("persona"); expect(parsed).not.toHaveProperty("amount"); expect(parsed).not.toHaveProperty("facts");
    expect(parseResearchFile(JSON.stringify(parsed))).toEqual(parsed);
  });
  it("rejects invalid IDs, formats, measures and oversized files", () => {
    for (const update of [{ geoids: ["bad"] }, { version: 99 }, { measures: ["expected_return"] }, { focus: "__proto__" }, { state: "address" }]) expect(() => parseResearchFile(JSON.stringify({ ...file, ...update }))).toThrow();
    expect(() => parseResearchFile(" ".repeat(64001))).toThrow();
    expect(() => parseResearchFile("not json")).toThrow();
  });
  it("round trips 25 tracts without truncation and rejects 26", () => {
    const geoids = Array.from({ length: 25 }, (_, i) => String(13001000100 + i));
    expect(parseResearchFile(JSON.stringify({ ...file, geoids })).geoids).toEqual(geoids);
    expect(() => parseResearchFile(JSON.stringify({ ...file, geoids: [...geoids, "13001000200"] }))).toThrow();
  });
});
