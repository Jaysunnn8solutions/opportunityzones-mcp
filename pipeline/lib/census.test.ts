import { describe, expect, it } from "vitest";
import { isTopCoded, parseTractResponse, ratio, sumCodes, toEstimate } from "./census";

describe("toEstimate", () => {
  it("keeps real values", () => {
    expect(toEstimate("56432")).toBe(56432);
    expect(toEstimate("0")).toBe(0);
    expect(toEstimate("0.4523")).toBe(0.4523);
  });

  it("maps every Census sentinel to null", () => {
    // Observed in the wild: 187 California tracts carry -666666666 for median
    // family income. Left as a number it would make them the poorest tracts in
    // the country and force them through the eligibility test as qualifying.
    for (const sentinel of ["-666666666", "-999999999", "-888888888", "-222222222"]) {
      expect(toEstimate(sentinel)).toBeNull();
    }
  });

  it("treats absent, empty and non-numeric as null", () => {
    expect(toEstimate(undefined)).toBeNull();
    expect(toEstimate(null)).toBeNull();
    expect(toEstimate("")).toBeNull();
    expect(toEstimate("null")).toBeNull();
    expect(toEstimate("N/A")).toBeNull();
  });

  it("keeps legitimate negative values above the sentinel ceiling", () => {
    // Net migration and some change measures are genuinely negative.
    expect(toEstimate("-1200")).toBe(-1200);
  });
});

describe("isTopCoded", () => {
  it("flags medians reported at the published cap", () => {
    expect(isTopCoded("B19113_001E", 250001)).toBe(true);
    expect(isTopCoded("B19013_001E", 250001)).toBe(true);
    expect(isTopCoded("B25064_001E", 3501)).toBe(true);
  });

  it("does not flag ordinary values or nulls", () => {
    expect(isTopCoded("B19113_001E", 94000)).toBe(false);
    expect(isTopCoded("B19113_001E", null)).toBe(false);
    expect(isTopCoded("B01003_001E", 250001)).toBe(false);
  });
});

describe("parseTractResponse", () => {
  const body = JSON.stringify([
    ["B19113_001E", "B17001_002E", "state", "county", "tract"],
    ["94000", "150", "06", "001", "400100"],
    ["-666666666", "0", "06", "001", "400200"],
  ]);

  it("keys rows by 11-digit GEOID assembled from the geography columns", () => {
    const table = parseTractResponse(body, ["B19113_001E", "B17001_002E"]);
    expect([...table.keys()]).toEqual(["06001400100", "06001400200"]);
    expect(table.get("06001400100")).toEqual({ B19113_001E: 94000, B17001_002E: 150 });
  });

  it("nulls sentinels while keeping a real zero", () => {
    const table = parseTractResponse(body, ["B19113_001E", "B17001_002E"]);
    expect(table.get("06001400200")).toEqual({ B19113_001E: null, B17001_002E: 0 });
  });

  it("explains the HTML-with-200 response instead of throwing a parse error", () => {
    // The API answers a missing key this way, which is how a keyless request
    // fails today. A bare JSON.parse would report "Unexpected token <".
    const html = '<html><head><title>Missing Key</title></head><body>...</body></html>';
    expect(() => parseTractResponse(html, ["B19113_001E"])).toThrow(/Missing Key/);
    expect(() => parseTractResponse(html, ["B19113_001E"])).toThrow(/CENSUS_API_KEY/);
  });

  it("rejects a response missing geography columns", () => {
    const noGeo = JSON.stringify([["B19113_001E"], ["94000"]]);
    expect(() => parseTractResponse(noGeo, ["B19113_001E"])).toThrow(/geography columns/);
  });

  it("rejects a response that silently dropped a requested variable", () => {
    expect(() => parseTractResponse(body, ["B19113_001E", "B99999_001E"])).toThrow(
      /omitted requested variables: B99999_001E/
    );
  });
});

describe("ratio", () => {
  it("returns null rather than zero when the denominator is missing or zero", () => {
    // A tract with no population must not read as 0% poverty.
    expect(ratio(0, 0)).toBeNull();
    expect(ratio(5, null)).toBeNull();
    expect(ratio(null, 100)).toBeNull();
  });

  it("rounds to five places", () => {
    expect(ratio(1, 3)).toBe(0.33333);
  });
});

describe("sumCodes", () => {
  it("sums the values that exist", () => {
    expect(sumCodes({ a: 1, b: 2, c: 3 }, ["a", "b", "c"])).toBe(6);
  });

  it("skips nulls but returns null when nothing is present", () => {
    // Age shares are built from many sex-by-age cells; one suppressed cell
    // should not discard the whole sum, but an entirely suppressed set should
    // not read as zero.
    expect(sumCodes({ a: 1, b: null }, ["a", "b"])).toBe(1);
    expect(sumCodes({ a: null, b: null }, ["a", "b"])).toBeNull();
  });
});
