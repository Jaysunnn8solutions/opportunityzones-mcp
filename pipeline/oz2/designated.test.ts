import { describe, expect, it } from "vitest";
import type { Sheet } from "../lib/archive";
import { parseOz2Designated, SOURCE } from "./designated";

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

describe("source", () => {
  it("is marked unpublished until Treasury releases the list", () => {
    // When this fails, the list has been wired in: add its expected count too.
    if (SOURCE.url) expect(SOURCE.expected).not.toBeNull();
    else expect(SOURCE.expected).toBeNull();
  });
});
