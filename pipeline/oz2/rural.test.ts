import { describe, expect, it } from "vitest";
import { classifyTracts, explain, lines, qualifyingCities, type PlaceRecord } from "./rural";

const places: PlaceRecord[] = [
  { key: "0100001", name: "Big City city", incorporated: true },
  { key: "0100002", name: "Small town", incorporated: true },
  { key: "0100003", name: "Big CDP", incorporated: false },
  { key: "1500001", name: "Urban Honolulu CDP", incorporated: false },
  { key: "0100004", name: "Exactly Fifty city", incorporated: true },
];
const population = new Map([
  ["0100001", 200_000],
  ["0100002", 8_000],
  ["0100003", 90_000],
  ["1500001", 350_000],
  ["0100004", 50_000],
]);

describe("qualifyingCities", () => {
  const cities = qualifyingCities(places, population);

  it("takes incorporated places over 50,000", () => {
    expect(cities.has("0100001")).toBe(true);
    expect(cities.has("0100002")).toBe(false);
  });

  it("requires more than 50,000, not 50,000 exactly", () => {
    expect(cities.has("0100004")).toBe(false);
  });

  it("uses CDPs only in Hawaii and Puerto Rico", () => {
    expect(cities.has("0100003")).toBe(false);
    expect(cities.has("1500001")).toBe(true);
  });
});

describe("classifyTracts", () => {
  const cities = qualifyingCities(places, population);
  // Tract A (01001000100) has a block in Big City. Tract B (01001000200) has a
  // block in the urban area that contains Big City's block. Tract C
  // (01001000300) is only in a separate urban area around a small town. Tract D
  // (01001000400) has no urban blocks at all.
  const cityBlocks: Array<[string, string]> = [["010010001001000", "0100001"]];
  const uaBlocks = [
    { block: "010010001001000", uace: "11111", uaName: "Big City, AL" },
    { block: "010010002001000", uace: "11111", uaName: "Big City, AL" },
    { block: "010010003001000", uace: "22222", uaName: "Small Town, AL" },
  ];
  const v = classifyTracts(cities, cityBlocks, uaBlocks);

  it("excludes a tract with any block in a qualifying city", () => {
    expect(v.get("01001000100")).toMatchObject({ rural: false, reason: "city", city: { name: "Big City city" } });
  });

  it("excludes a tract in an urban area that shares a block with such a city", () => {
    expect(v.get("01001000200")).toMatchObject({ rural: false, reason: "urban-area", urbanArea: "Big City, AL" });
  });

  it("leaves a tract rural when its urban area touches no qualifying city", () => {
    expect(v.has("01001000300")).toBe(false);
  });

  it("leaves a tract with no urban blocks rural", () => {
    expect(v.has("01001000400")).toBe(false);
  });

  it("ignores city blocks for places that do not qualify", () => {
    const w = classifyTracts(cities, [["010010005001000", "0100002"]], []);
    expect(w.size).toBe(0);
  });
});

describe("explain", () => {
  const city = { key: "0100001", name: "Big City city", population: 200_000 };

  it("verifies agreement and names the excluding city or urban area", () => {
    expect(explain({ rural: true }, true).status).toBe("verified");
    const ua = explain({ rural: false, reason: "urban-area", urbanArea: "Big City, AL", city }, false);
    expect(ua.status).toBe("verified");
    expect(ua.text).toContain("Big City, AL urban area");
    expect(ua.text).toContain("200,000");
  });

  it("marks disagreements unverified and names the likely cause", () => {
    const island = explain({ rural: false, reason: "urban-area", urbanArea: "Big City, AL", city }, true);
    expect(island.status).toBe("unverified");
    expect(island.text).toMatch(/detached parts/);
    const touch = explain({ rural: true }, false);
    expect(touch.status).toBe("unverified");
    expect(touch.text).toMatch(/boundary/);
  });

  it("says when a tract could not be computed", () => {
    expect(explain(null, true).status).toBe("not-computed");
  });
});

describe("lines", () => {
  it("splits a buffer on LF and CRLF and skips blank lines", () => {
    expect([...lines(Buffer.from("a|b\r\nc|d\n\ne|f"))]).toEqual(["a|b", "c|d", "e|f"]);
  });
});
