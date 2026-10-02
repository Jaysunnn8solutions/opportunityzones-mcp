import { describe, expect, it, vi } from "vitest";
import { searchPage, searchRows } from "./search";
import { NO_FILTERS } from "@/lib/explore/filter";
import { exploreState } from "@/lib/data/explore";
import type { ExploreState } from "@/lib/explore/measures";

vi.mock("@/lib/data/tracts", () => ({ loadTractData: () => ({ payload: { geoids: ["01001000100", "02001000100"] } }) }));
vi.mock("@/lib/data/explore", () => ({ exploreState: vi.fn() }));
const state = (fips: string, scale: number): ExploreState => ({
  measures: ["median_home_value"], rows: [0, 1, 2].map((i) => [`${fips}00100010${i}`, i === 2 ? 4 : 1, scale * (i + 1)]),
  tracts: Object.fromEntries([0, 1, 2].map((i) => [`${fips}00100010${i}`, { county: "Example", rural: i === 2 ? null : i === 1, values: { population: 100 * (i + 1) }, programs: { eligible_2027: i === 2 ? null : 1, designated_2027: null } }])),
});
describe("nationwide filtering", () => {
  const setup = () => vi.mocked(exploreState).mockImplementation((id) => state(id, id === "01" ? 1 : 100));
  it("filters rural status and program flags independently, excludes unknowns, and clears to all tracts", () => {
    setup();
    expect(searchRows("all", NO_FILTERS, "geoid").rows).toHaveLength(6);
    const rural = searchRows("all", { ...NO_FILTERS, rural: "not-rural" }, "geoid");
    expect(rural.rows.map((row) => row[0])).toEqual(["01001000100", "02001000100"]);
    expect(exploreState).toHaveBeenCalledWith("01", false);
    expect(searchRows("all", { ...NO_FILTERS, flags: ["eligible"] }, "geoid").rows).toHaveLength(4);
    expect(searchRows("all", { ...NO_FILTERS, flags: ["zone2027"] }, "geoid").rows).toHaveLength(0);
    expect(searchRows("01", { ...NO_FILTERS, rural: "not-rural", flags: ["eligible"] }, "geoid").rows).toHaveLength(1);
  });
  it("keeps neighboring percentiles relative to each state and supplies matching evidence", () => {
    setup();
    const page = searchPage("all", { ...NO_FILTERS, tiers: { median_home_value: "higher10" } }, "geoid", 0, true);
    expect(page.matches).toEqual(["01001000102", "02001000102"]);
    expect(exploreState).toHaveBeenCalledWith("02", true);
    for (const id of page.matches) expect(page.evidence[id].every((item) => item.result === "Meets")).toBe(true);
    expect(page.evidence[page.matches[0]][0].requirement).toContain("$3");
    expect(page.evidence[page.matches[1]][0].requirement).toContain("$300");
  });
  it("preserves public data limits and provides nationwide empty-result diagnostics", () => {
    setup();
    const page = searchPage("all", NO_FILTERS, "geoid", 0, false);
    expect(Object.values(page.tracts!).every((tract) => Object.keys(tract.values).length === 0)).toBe(true);
    const empty = searchPage("all", { ...NO_FILTERS, flags: ["zone2027"] }, "geoid", 0, false);
    expect(empty.total).toBe(0); expect(empty.diagnostics[0].unknown).toBe(6); expect(empty.diagnostics[0].without).toBe(6);
  });
});
