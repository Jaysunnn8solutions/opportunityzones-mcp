import { describe, expect, it } from "vitest";
import type { Sheet } from "../lib/archive";
import { parseOz1, validateRenumbering } from "./lists";

/** A miniature Information Resource and designated list with the real quirks. */
function eligible(renumber: Array<[string, string]>): Sheet[] {
  return [
    { name: "SUMMARY ", rows: [["State"]] },
    {
      name: "1)LICs",
      rows: [
        ["State", "Low Income Communities (LICs)"],
        ["Alabama", "01001020200"],
        ["Alabama", "01001020700"],
        // Stored as a number by the spreadsheet: leading zero lost.
        ["Alabama", 1001021100],
        ["New York", "36085000900"],
        ["Arizona", "04019002701"],
      ],
    },
    {
      name: "2)Contiguous",
      rows: [
        ["State", "Eligible Non-LIC Contiguous Tracts", "Contiguous LICs", "Additional Cross-state Tract?"],
        ["Alabama", "01001020300", "01001020200", "NO"],
        ["Alabama", "01003010100", "01001020700", "YES"],
      ],
    },
    {
      name: "3)Cross-State",
      rows: [["note"], ["State", "Tract", "LICs", "LIC State", "In-state?"], ["Alabama", "01003010100", "13233010300", "Georgia", "YES"]],
    },
    {
      name: "Tract Number Changes",
      rows: [["note"], ["State", "2010", "Post-2010"], ...renumber.map(([a, b]) => ["X", a, b])],
    },
  ];
}

function designated(rows: unknown[][]): Sheet[] {
  return [
    {
      name: "QOZs",
      rows: [
        [null, "Designated Qualified Opportunity Zones"],
        ["State", "County", "Census Tract Number", "Tract Type", "ACS Data Source"],
        ...rows,
      ],
    },
  ];
}

const TRACTS_2010 = new Set([
  "01001020200",
  "01001020700",
  "01001021100",
  "01001020300",
  "01003010100",
  "01013952800",
  "04019002701",
  "36085000900",
  "36085008900", // a real, empty 2010 tract on Staten Island
]);

describe("validateRenumbering", () => {
  it("accepts a genuine renumbering", () => {
    expect(validateRenumbering("04019002701", "04019002704", TRACTS_2010).valid).toBe(true);
  });

  it("rejects the Staten Island row that would merge two real tracts", () => {
    // Regression: CDFI lists 36085000900 -> 36085008900, but both are distinct
    // 2010 tracts. Applying it overwrote a populated tract's data with an empty
    // one's.
    const v = validateRenumbering("36085000900", "36085008900", TRACTS_2010);
    expect(v.valid).toBe(false);
    expect(v.reason).toMatch(/merge two tracts/);
  });

  it("rejects a pair whose original is not a 2010 tract", () => {
    expect(validateRenumbering("99999999999", "88888888888", TRACTS_2010).valid).toBe(false);
  });
});

describe("parseOz1", () => {
  const renumber: Array<[string, string]> = [
    ["04019002701", "04019002704"],
    ["36085000900", "36085008900"],
  ];

  const lists = parseOz1(
    eligible(renumber),
    designated([
      ["Alabama", "Autauga", "01001020200", "Low-Income Community", "2011-2015"],
      ["Alabama", "Autauga", "01001020300", "Non-LIC Contiguous", "2011-2015"],
      // Designated on 2012-2016 data, absent from the eligible list.
      ["Alabama", "Butler", "01013952800", "Low-Income Community", "2012-2016"],
      // Designated under the post-2010 number.
      ["Arizona", "Pima", "04019002704", "Low-Income Community", "2011-2015"],
    ]),
    TRACTS_2010
  );
  const by = new Map(lists.tracts.map((t) => [t.geoid10, t]));

  it("restores a leading zero lost to a numeric cell", () => {
    expect(by.get("01001021100")?.lic).toBe(true);
  });

  it("marks designated LIC and contiguous tracts with their type", () => {
    expect(by.get("01001020200")).toMatchObject({ designated: true, designatedType: "lic", lic: true });
    expect(by.get("01001020300")).toMatchObject({ designated: true, designatedType: "contiguous", contiguous: true });
  });

  it("keeps an eligible LIC that was not designated as a control", () => {
    expect(by.get("01001020700")).toMatchObject({ lic: true, designated: false });
  });

  it("does not double-count a tract on both contiguous tabs", () => {
    expect(lists.counts.contiguousOnly).toBe(2);
  });

  it("adds a 2012-2016 designation missing from the eligible list, with its own basis", () => {
    expect(by.get("01013952800")).toMatchObject({ designated: true, basis: "added-2012-2016", designatedAcs: "2012-2016" });
  });

  it("files a designation made under the new number against the original 2010 tract", () => {
    expect(by.get("04019002701")).toMatchObject({ designated: true, lic: true, renumberedTo: "04019002704" });
    expect(by.has("04019002704")).toBe(false);
  });

  it("does not apply the rejected Staten Island row", () => {
    expect(by.get("36085000900")?.renumberedTo).toBeNull();
    expect(lists.counts.renumberingRejected).toBe(1);
  });
});
