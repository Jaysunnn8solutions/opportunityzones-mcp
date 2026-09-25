import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SourceError } from "../http";
import { categorise, floodZoneAt, inside, zoneAt } from "./client";

// Five real NFHL zone polygons recorded 2026-09-25 in the French Quarter, New
// Orleans (AE with a 3 ft base flood elevation, and X behind levees).
const fixture = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "fixtures", "zones-new-orleans.json"), "utf8")
) as { features: Array<{ attributes: Record<string, unknown>; geometry?: { rings?: number[][][] } }> };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("categorise", () => {
  it("maps FEMA zones to plain categories", () => {
    expect(categorise("AE", null)).toBe("sfha");
    expect(categorise("VE", null)).toBe("sfha");
    expect(categorise("X", "0.2 PCT ANNUAL CHANCE FLOOD HAZARD")).toBe("moderate");
    expect(categorise("X", "AREA WITH REDUCED FLOOD RISK DUE TO LEVEE")).toBe("minimal");
    expect(categorise("D", null)).toBe("undetermined");
  });
});

describe("inside", () => {
  it("treats a hole as outside", () => {
    const outer = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
    const hole = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]];
    expect(inside(1, 1, [outer, hole])).toBe(true);
    expect(inside(5, 5, [outer, hole])).toBe(false);
  });
});

/** A point genuinely inside a polygon, found by scanning a grid over its bounding box. */
function interiorPoint(rings: number[][][]): [number, number] {
  const xs = rings.flat().map((p) => p[0]);
  const ys = rings.flat().map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  for (let i = 1; i < 200; i++) {
    for (let j = 1; j < 200; j++) {
      const p: [number, number] = [x0 + ((x1 - x0) * i) / 200, y0 + ((y1 - y0) * j) / 200];
      if (inside(p[0], p[1], rings)) return p;
    }
  }
  throw new Error("no interior point found");
}

describe("zoneAt", () => {
  it("reads the zone of the real polygon containing a point", () => {
    const ae = fixture.features.find((f) => f.attributes.STATIC_BFE === 3)!;
    const [lon, lat] = interiorPoint(ae.geometry!.rings!);
    expect(zoneAt([ae], lon, lat)).toMatchObject({
      status: "mapped",
      zone: "AE",
      category: "sfha",
      sfha: true,
      baseFloodElevationFt: 3,
    });
  });

  it("treats FEMA's -9999 as no base flood elevation, not a number", () => {
    const levee = fixture.features.find((f) => f.attributes.FLD_ZONE === "X")!;
    const [lon, lat] = interiorPoint(levee.geometry!.rings!);
    const z = zoneAt([levee], lon, lat)!;
    expect(z).toMatchObject({ zone: "X", category: "minimal", sfha: false, baseFloodElevationFt: null });
    // Levee-protected areas say the risk is reduced, not removed.
    expect(z.description).toMatch(/levee/i);
    expect(z.description).toMatch(/not removed/);
  });

  it("returns null where no polygon contains the point", () => {
    expect(zoneAt(fixture.features, 0, 0)).toBeNull();
  });
});

describe("floodZoneAt", () => {
  it("sends FEMA only a small box around the rounded point", async () => {
    const urls: URL[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        const u = new URL(url);
        urls.push(u);
        return new Response(JSON.stringify(u.searchParams.get("returnCountOnly") ? { count: 1 } : { features: [] }));
      })
    );
    await floodZoneAt(-90.063912, 29.958311);
    for (const u of urls) {
      const [x0, y0, x1, y1] = u.searchParams.get("geometry")!.split(",").map(Number);
      expect((x0 + x1) / 2).toBeCloseTo(-90.06, 4);
      expect((y0 + y1) / 2).toBeCloseTo(29.96, 4);
      expect(x1 - x0).toBeLessThan(0.02);
      expect(u.toString()).not.toContain("063912");
    }
  });

  it("says 'no digital FIRM' where FEMA has no map, never 'no risk'", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) =>
        new Response(JSON.stringify(new URL(url).searchParams.get("returnCountOnly") ? { count: 0 } : { features: [] }))
      )
    );
    const z = await floodZoneAt(-100, 40);
    expect(z.status).toBe("no-digital-firm");
    expect(z.description).toMatch(/not a finding of no flood risk/);
  });

  it("refuses out-of-range coordinates", async () => {
    await expect(floodZoneAt(500, 0)).rejects.toThrow(SourceError);
  });
});
