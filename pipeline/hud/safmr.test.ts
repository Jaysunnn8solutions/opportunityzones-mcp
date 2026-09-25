import { describe, expect, it } from "vitest";
import { dedupeZips, parseSafmr, rentsByTract } from "./safmr";

const row = (id: string, code: string, twoBr: number) => ({
  ID: id,
  HUD_CODE: code,
  FMR_NAME: "Area",
  SAFMR_0BR: 800,
  SAFMR_1BR: 900,
  SAFMR_2BR: twoBr,
  SAFMR_3BR: 1400,
  SAFMR_4BR: 1700,
});

describe("parseSafmr", () => {
  it("reads rents and the HUD area type", () => {
    expect(parseSafmr(row("76437", "METRO10180M10180", 1090))).toMatchObject({
      zip: "76437",
      areaType: "metro",
      rents: [800, 900, 1090, 1400, 1700],
    });
    expect(parseSafmr(row("35592", "NCNTY01075N01075", 950))!.areaType).toBe("nonmetro");
  });

  it("skips rows without a valid ZIP", () => {
    expect(parseSafmr({ ID: null, ZCTA_ID: null })).toBeNull();
  });
});

describe("dedupeZips", () => {
  it("keeps one row for a ZIP listed in two areas with identical rents", () => {
    const zips = dedupeZips([parseSafmr(row("11111", "METRO1", 1000))!, parseSafmr(row("11111", "METRO2", 1000))!]);
    expect(zips.size).toBe(1);
  });

  it("refuses to choose when the areas disagree", () => {
    expect(() =>
      dedupeZips([parseSafmr(row("11111", "METRO1", 1000))!, parseSafmr(row("11111", "METRO2", 1200))!])
    ).toThrow(/arbitrary/);
  });
});

describe("rentsByTract", () => {
  const zips = dedupeZips([parseSafmr(row("11111", "M", 1000))!, parseSafmr(row("22222", "M", 2000))!]);

  it("weights each ZIP's two-bedroom rent by the tract land it covers", () => {
    const r = rentsByTract(zips, [
      { zcta: "11111", tract: "01001000100", landPart: 75, tractLand: 100 },
      { zcta: "22222", tract: "01001000100", landPart: 25, tractLand: 100 },
    ]).get("01001000100")!;
    expect(r).toEqual({ twoBedroomWeighted: 1250, twoBedroomMin: 1000, twoBedroomMax: 2000, landCovered: 1 });
  });

  it("reports partial coverage and gives no rent where no ZIP is listed", () => {
    const m = rentsByTract(zips, [
      { zcta: "11111", tract: "01001000200", landPart: 40, tractLand: 100 },
      { zcta: "99999", tract: "01001000200", landPart: 60, tractLand: 100 },
      { zcta: "99999", tract: "01001000300", landPart: 10, tractLand: 10 },
    ]);
    expect(m.get("01001000200")).toMatchObject({ twoBedroomWeighted: 1000, landCovered: 0.4 });
    expect(m.get("01001000300")!.twoBedroomWeighted).toBeNull();
  });
});
