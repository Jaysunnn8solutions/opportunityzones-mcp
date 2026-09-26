import { describe, expect, it } from "vitest";
import type { Sheet } from "../lib/archive";
import { designationCode, parseOz2Designated, RELEASES } from "./designated";

// Shaped like the 2018 list: a title block, then a header naming the tract
// column, with GEOIDs stored as numbers (so Alabama's leading zero is lost).
function workbook(rows: unknown[][]): Sheet[] {
  return [
    {
      name: "Designated QOZs",
      rows: [
        ["Designated Qualified Opportunity Zones", null, null],
        ["Source: U.S. Department of the Treasury", null, null],
        ["State", "County", "Census Tract Number"],
        ...rows,
      ],
    },
  ];
}

// 120 eligible LICs in Alabama (cap 30), 10 in Delaware (small-state floor: all
// 10), plus one Alabama tract that is not eligible.
const eligible = new Map<string, boolean>();
for (let i = 0; i < 120; i++) eligible.set(`01001${String(i).padStart(6, "0")}`, true);
for (let i = 0; i < 10; i++) eligible.set(`10001${String(i).padStart(6, "0")}`, true);
eligible.set("01001999999", false);

describe("parseOz2Designated", () => {
  it("finds the tract column below a title block and restores leading zeros", () => {
    const r = parseOz2Designated(workbook([["Alabama", "Autauga", 1001000000]]), eligible);
    expect(r.designations).toEqual([{ geoid20: "01001000000", stateFips: "01", onEligibleList: true }]);
  });

  it("flags, but keeps, a designation that is not on the eligible list", () => {
    const r = parseOz2Designated(
      workbook([
        ["Alabama", "Autauga", "01001000000"],
        ["Alabama", "Autauga", "01001999999"],
      ]),
      eligible
    );
    expect(r.designations).toHaveLength(2);
    expect(r.notEligible).toEqual(["01001999999"]);
  });

  it("counts duplicates instead of double-counting them", () => {
    const r = parseOz2Designated(
      workbook([
        ["Alabama", "Autauga", "01001000000"],
        ["Alabama", "Autauga", "01001000000"],
      ]),
      eligible
    );
    expect(r.designations).toHaveLength(1);
    expect(r.duplicates).toBe(1);
  });

  it("checks each jurisdiction against its statutory cap", () => {
    const alabama = Array.from({ length: 31 }, (_, i) => ["Alabama", "x", `01001${String(i).padStart(6, "0")}`]);
    const delaware = Array.from({ length: 10 }, (_, i) => ["Delaware", "x", `10001${String(i).padStart(6, "0")}`]);
    const r = parseOz2Designated(workbook([...alabama, ...delaware]), eligible);
    // Alabama: 25% of 120, rounded up, is 30, so 31 is over. Delaware has
    // fewer than 25 LICs, so all 10 may be designated.
    expect(r.byState).toEqual([
      { stateFips: "01", designated: 31, eligibleLics: 121 - 1, cap: 30, overCap: true },
      { stateFips: "10", designated: 10, eligibleLics: 10, cap: 10, overCap: false },
    ]);
  });

  it("fails loudly when no sheet names a tract column", () => {
    const sheets: Sheet[] = [{ name: "x", rows: [["State", "County", "Code"], ["Alabama", "Autauga", "01001000000"]] }];
    expect(() => parseOz2Designated(sheets, eligible)).toThrow(/No census tract column/);
  });
});

describe("designationCode", () => {
  const designated = new Set(["13121003500"]);
  const certified = new Map([["13", "2026-11-15"]]);

  it("is 1 for a designated tract", () => {
    expect(designationCode("13121003500", designated, certified)).toBe(1);
  });

  it("is 0 only once the tract's state is certified", () => {
    expect(designationCode("13121001100", designated, certified)).toBe(0);
  });

  it("stays pending (null) while the state's list is not out", () => {
    expect(designationCode("01001020100", designated, certified)).toBeNull();
    expect(designationCode("01001020100", new Set(), new Map())).toBeNull();
  });
});

describe("releases", () => {
  it("each carries a date, its states, and Treasury's count", () => {
    // Empty until Treasury publishes; when a release is added it must be complete.
    for (const r of RELEASES) {
      expect(r.published).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.states === "all" || r.states.length > 0).toBe(true);
      expect(r.expected?.designated).toBeGreaterThan(0);
    }
  });
});
