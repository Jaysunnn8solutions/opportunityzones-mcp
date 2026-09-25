import { describe, expect, it } from "vitest";
import { parseBps } from "./bps";

// The real layout of the BPS annual county file: two header lines, a blank
// line, then one row per county with estimated (imputed) groups first and
// "reported only" groups after. Rows copied from co2025a.txt.
const text = [
  "Survey,FIPS,FIPS,Region,Division,County,,1-unit,,,2-units,,,3-4 units,,,5+ units,,,1-unit rep,,,2-units rep,,,3-4 units rep,,, 5+units rep",
  "Date,State,County,Code,Code,Name,Bldgs,Units,Value,Bldgs,Units,Value,Bldgs,Units,Value,Bldgs,Units,Value,Bldgs,Units,Value,Bldgs,Units,Value,Bldgs,Units,Value,Bldgs,Units,Value",
  " ",
  "2025,01,003,3,6,Baldwin County                ,2517,2517,848168534,6,12,1754655,1,4,388350,13,132,19301135,2422,2422,829953600,6,12,1754655,1,4,388350,13,132,19301135",
  "2025,09,110,1,1,Capitol Planning Region       ,338,338,113014335,33,66,13163515,8,28,4420018,19,714,141448874,320,320,106930434,33,66,13163515,8,28,4420018,19,714,141448874",
].join("\r\n");

describe("parseBps", () => {
  const m = parseBps(text);

  it("skips the header lines and reads one row per county", () => {
    expect([...m.keys()]).toEqual(["01003", "09110"]);
  });

  it("uses the estimated groups, not the reported-only ones", () => {
    // Estimated 1-unit units are 2,517; reported-only would be 2,422.
    expect(m.get("01003")).toMatchObject({
      name: "Baldwin County",
      units1: 2517,
      units2to4: 12 + 4,
      units5plus: 132,
      unitsTotal: 2517 + 12 + 4 + 132,
      valueDollars: 848168534 + 1754655 + 388350 + 19301135,
    });
  });

  it("keys Connecticut by planning region, matching the tract GEOIDs", () => {
    expect(m.get("09110")!.unitsTotal).toBe(338 + 66 + 28 + 714);
  });
});
