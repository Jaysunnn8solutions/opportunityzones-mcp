import { afterEach, describe, expect, it, vi } from "vitest";
import { SourceError } from "../http";
import { identifyUrl, oneIn, parseIdentify, wildfireLikelihoodAt } from "./wildfire";

afterEach(() => {
  vi.unstubAllGlobals();
});

// ArcGIS ImageServer identify returns the pixel value as a string, "NoData" outside coverage.
const identify = (value: string) => ({ objectId: 0, name: "Pixel", value, location: { x: -116.5, y: 33.8, spatialReference: { wkid: 4326 } } });

describe("oneIn", () => {
  it("rounds 1/p to two significant figures", () => {
    expect(oneIn(0.004)).toBe(250);
    expect(oneIn(0.000123)).toBe(8100);
    expect(oneIn(0.5)).toBe(2);
  });
});

describe("parseIdentify", () => {
  it("reports the probability and the odds as published, with no classes of our own", () => {
    const r = parseIdentify(identify("0.004"));
    expect(r).toMatchObject({ status: "modelled", burnProbability: 0.004, oneInYears: 250 });
    expect(r.description).toContain("0.40%");
    expect(r.description).toContain("1 in 250 years");
    expect(r.description).not.toMatch(/\b(low|moderate|high)\b/i);
  });

  it("says zero is not 'no risk'", () => {
    const r = parseIdentify(identify("0"));
    expect(r).toMatchObject({ status: "modelled", burnProbability: 0, oneInYears: null });
    expect(r.description).toMatch(/not a finding that fire cannot occur/);
  });

  it("treats NoData as outside coverage", () => {
    expect(parseIdentify(identify("NoData"))).toMatchObject({ status: "not-covered", burnProbability: null });
  });

  it("rejects errors and values that are not probabilities", () => {
    expect(() => parseIdentify({ error: { code: 400, message: "x" } })).toThrow(SourceError);
    expect(() => parseIdentify({})).toThrow(/no pixel value/);
    expect(() => parseIdentify(identify("37"))).toThrow(/not a probability/);
  });
});

describe("wildfireLikelihoodAt", () => {
  it("sends the Forest Service only the point rounded to two decimals", () => {
    const url = new URL(identifyUrl(-116.54321, 33.81234));
    const geometry = JSON.parse(url.searchParams.get("geometry")!);
    expect(geometry).toEqual({ x: -116.54, y: 33.81, spatialReference: { wkid: 4326 } });
    expect(url.search).not.toContain("54321");
    expect(url.pathname).toMatch(/BurnProbability\/ImageServer\/identify$/);
  });

  it("fetches and parses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(identify("0.0021")))));
    expect((await wildfireLikelihoodAt(-116.54321, 33.81234)).oneInYears).toBe(480);
  });
});
