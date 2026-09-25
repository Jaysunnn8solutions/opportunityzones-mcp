import { describe, expect, it } from "vitest";
import { overlay, parseDda, type DdaRow } from "./qctDda";

describe("parseDda", () => {
  it("reads a small-area DDA by ZCTA", () => {
    expect(parseDda({ DDA_TYPE: "SA", ZCTA5: "10001", DDA_CODE: "SA10001", DDA_NAME: "New York" })).toMatchObject({
      type: "SA",
      zcta: "10001",
      area: null,
    });
  });

  it("reads a non-metro DDA's county from its code", () => {
    expect(parseDda({ DDA_TYPE: "NM", DDA_CODE: "NCNTY10005N10005", DDA_NAME: "Sussex County" }).area).toEqual({
      kind: "county",
      fips: "10005",
    });
  });

  it("recognises whole-territory and Puerto Rico nonmetro codes", () => {
    expect(parseDda({ DDA_TYPE: "NM", DDA_CODE: "NCNTY69999N69999", DDA_NAME: "Northern Mariana Islands" }).area).toEqual({
      kind: "territory",
      stateFips: "69",
    });
    expect(parseDda({ DDA_TYPE: "NM", DDA_CODE: "NCNTY72923N72923", DDA_NAME: "Puerto Rico Nonmetro Area" }).area).toEqual({
      kind: "nonmetro",
      stateFips: "72",
    });
  });

  it("fails loudly on an unknown type or code format", () => {
    expect(() => parseDda({ DDA_TYPE: "XX", DDA_CODE: "?" })).toThrow(/Unknown DDA_TYPE/);
    expect(() => parseDda({ DDA_TYPE: "NM", DDA_CODE: "COUNTY10005" })).toThrow(/does not name a county/);
    expect(() => parseDda({ DDA_TYPE: "SA", ZCTA5: null, DDA_CODE: "SA?" })).toThrow(/no valid ZCTA/);
  });
});

describe("overlay", () => {
  const ddas: DdaRow[] = [
    { type: "SA", zcta: "11111", area: null, name: "Metro A" },
    { type: "NM", zcta: null, area: { kind: "county", fips: "10005" }, name: "Sussex County" },
    { type: "NM", zcta: null, area: { kind: "nonmetro", stateFips: "72" }, name: "Puerto Rico Nonmetro Area" },
  ];
  const parts = [
    // Tract 01001000100: 60% of its land in DDA ZCTA 11111, 40% in 22222.
    { zcta: "11111", tract: "01001000100", landPart: 60, tractLand: 100 },
    { zcta: "22222", tract: "01001000100", landPart: 40, tractLand: 100 },
    // Tract 01001000200: entirely in DDA ZCTA 11111.
    { zcta: "11111", tract: "01001000200", landPart: 50, tractLand: 50 },
    // Connecticut tract in 2020 county codes, mapped to its planning-region GEOID.
    { zcta: "11111", tract: "09001010100", landPart: 10, tractLand: 10 },
  ];
  const tracts = ["01001000100", "01001000200", "10005050100", "72001956300", "72001956400", "09120010100"];
  const result = overlay(
    tracts,
    new Set(["01001000200"]),
    ddas,
    parts,
    new Map([["09001010100", "09120010100"]]),
    new Set(["72001956300"])
  );

  it("marks QCTs", () => {
    expect(result.get("01001000200")!.qct).toBe(true);
    expect(result.get("01001000100")!.qct).toBe(false);
  });

  it("gives the land share inside small-area DDAs", () => {
    expect(result.get("01001000100")).toMatchObject({ dda: "part", ddaZctaLandShare: 0.6 });
    expect(result.get("01001000200")).toMatchObject({ dda: "all", ddaZctaLandShare: 1 });
  });

  it("covers every tract of a non-metro county DDA", () => {
    expect(result.get("10005050100")).toMatchObject({ dda: "all", ddaCounty: "Sussex County" });
  });

  it("applies Puerto Rico's nonmetro DDA only to tracts inside it", () => {
    expect(result.get("72001956300")!.dda).toBe("all");
    expect(result.get("72001956400")!.dda).toBe("none");
  });

  it("carries Connecticut's 2020-code ZCTA parts to planning-region GEOIDs", () => {
    expect(result.get("09120010100")!.dda).toBe("all");
  });
});
