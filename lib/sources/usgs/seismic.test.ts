import { afterEach, describe, expect, it, vi } from "vitest";
import { SourceError } from "../http";
import { parseDesignMaps, requestUrl, seismicDesignAt } from "./seismic";

afterEach(() => {
  vi.unstubAllGlobals();
});

// Shape of the ASCE 7-22 web service response (earthquake.usgs.gov/ws/designmaps/asce7-22.html),
// trimmed to the fields read; values are illustrative for a Los Angeles point.
const la = {
  request: { referenceDocument: "ASCE7-22", status: "success", parameters: { latitude: 34.05, longitude: -118.25, riskCategory: "II", siteClass: "Default" } },
  response: { data: { pgam: 0.93, sms: 2.1, sm1: 1.5, sds: 1.4, sd1: 1.0, sdc: "D", ss: 2.2, s1: 0.78 } },
};

describe("parseDesignMaps", () => {
  it("reads the category and design values", () => {
    expect(parseDesignMaps(la)).toMatchObject({ category: "D", sds: 1.4, sd1: 1.0, pgaM: 0.93 });
  });

  it("describes every category without advice", () => {
    for (const c of ["A", "B", "C", "D", "E", "F"]) {
      const r = parseDesignMaps({ response: { data: { sdc: c.toLowerCase() } } });
      expect(r.category).toBe(c);
      expect(r.description).toMatch(/seismic hazard/);
      expect(r.sds).toBeNull();
    }
  });

  it("rejects an error status or a missing category", () => {
    expect(() => parseDesignMaps({ request: { status: "error" } })).toThrow(SourceError);
    expect(() => parseDesignMaps({ response: { data: { sds: 1 } } })).toThrow(/no seismic design category/);
    expect(() => parseDesignMaps({ response: { data: { sdc: "Z" } } })).toThrow(SourceError);
  });
});

describe("seismicDesignAt", () => {
  it("sends USGS only the point rounded to two decimals, for an ordinary building on default soil", async () => {
    const url = new URL(requestUrl(-118.24368, 34.05223));
    expect(url.searchParams.get("latitude")).toBe("34.05");
    expect(url.searchParams.get("longitude")).toBe("-118.24");
    expect(url.searchParams.get("riskCategory")).toBe("II");
    expect(url.searchParams.get("siteClass")).toBe("Default");
    expect(url.search).not.toContain("24368");
  });

  it("fetches and parses", async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify(la)));
    vi.stubGlobal("fetch", f);
    expect((await seismicDesignAt(-118.24368, 34.05223)).category).toBe("D");
    expect(String(f.mock.calls[0][0])).toContain("latitude=34.05");
  });

  it("rejects coordinates out of range without calling out", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    await expect(seismicDesignAt(200, 0)).rejects.toThrow(SourceError);
    expect(f).not.toHaveBeenCalled();
  });
});
