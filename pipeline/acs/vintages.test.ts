import { describe, expect, it } from "vitest";
import { rekeyTo2010 } from "./vintages";

describe("rekeyTo2010", () => {
  const newToOld = new Map([
    ["46102940500", "46113940500"], // Shannon County SD -> Oglala Lakota
    ["36085008900", "36085000900"], // a bad pair; must never merge two tracts
  ]);

  it("re-keys a renumbered tract to its 2010 number", () => {
    const r = rekeyTo2010(["46102940500", "01001020100"], newToOld);
    expect(r.keys).toEqual(["46113940500", "01001020100"]);
    expect(r.rekeyed).toBe(1);
  });

  it("leaves a code alone when its supposed original is present in the same vintage", () => {
    // The 2006-2010 ACS has both Staten Island tracts. Re-keying one onto the
    // other would silently overwrite the populated tract's data.
    const r = rekeyTo2010(["36085000900", "36085008900"], newToOld);
    expect(r.keys).toEqual(["36085000900", "36085008900"]);
    expect(r.rekeyed).toBe(0);
  });

  it("fails loudly on a duplicate instead of letting the last row win", () => {
    expect(() => rekeyTo2010(["01001020100", "01001020100"], new Map())).toThrow(/Duplicate tract/);
  });
});
