import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SourceError } from "../http";
import { milesBetween, parseSites, sitesNear } from "./client";

// Real EPA responses recorded 2026-09-25: brownfields around a rounded point
// near the White House, and the Superfund site at the Washington Navy Yard.
const fixture = (name: string) =>
  JSON.parse(readFileSync(path.join(import.meta.dirname, "fixtures", name), "utf8")) as unknown;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("milesBetween", () => {
  it("measures a known distance", () => {
    // One degree of latitude is about 69 miles.
    expect(milesBetween(-77, 38, -77, 39)).toBeCloseTo(69.1, 0);
  });
});

describe("parseSites", () => {
  it("keeps only sites within the radius of the exact point, nearest first", () => {
    const all = parseSites(fixture("brownfields-near.json"), "brownfield", -77.0365, 38.8977, 10);
    const near = parseSites(fixture("brownfields-near.json"), "brownfield", -77.0365, 38.8977, 1);
    expect(all.length).toBe(5);
    expect(near.length).toBeLessThan(all.length);
    for (const s of near) expect(s.distanceMiles).toBeLessThanOrEqual(1);
    const d = all.map((s) => s.distanceMiles);
    expect([...d].sort((a, b) => a - b)).toEqual(d);
  });

  it("links a Superfund site to EPA's profile", () => {
    const [s] = parseSites(fixture("superfund-near.json"), "superfund", -76.99, 38.875, 1);
    expect(s).toMatchObject({ program: "superfund", name: "WASHINGTON NAVY YARD", state: "DC", epaId: "DC9170024310" });
    expect(s.url).toContain("cumulis.epa.gov");
  });

  it("reports an ArcGIS error body as rejected", () => {
    expect(() => parseSites({ error: { code: 400, message: "bad" } }, "superfund", 0, 0, 1)).toThrow(SourceError);
  });
});

describe("sitesNear", () => {
  it("sends EPA a rounded point with a padded radius, never the exact coordinates", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ features: [] })));
    vi.stubGlobal("fetch", fetchMock);
    await sitesNear(-77.036512, 38.897663, 1);
    for (const [url] of fetchMock.mock.calls as Array<[string]>) {
      const u = new URL(url);
      expect(u.searchParams.get("geometry")).toBe("-77.04,38.90");
      expect(Number(u.searchParams.get("distance"))).toBeGreaterThan(1);
      expect(url).not.toContain("036512");
    }
  });

  it("refuses bad input without calling EPA", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(sitesNear(-77, 38.9, 50)).rejects.toThrow(SourceError);
    await expect(sitesNear(500, 38.9, 1)).rejects.toThrow(SourceError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
