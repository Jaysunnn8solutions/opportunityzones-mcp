import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SourceError } from "../http";
import { busiestRoadsNear, milesToPolyline, toSegment } from "./client";

// Real HPMS response recorded 2026-09-25 around a rounded point near the
// White House: four arterial segments.
const fixture = (name: string) =>
  JSON.parse(readFileSync(path.join(import.meta.dirname, "fixtures", name), "utf8")) as {
    features: Array<{ attributes: Record<string, unknown>; geometry?: { paths?: number[][][] } }>;
  };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("milesToPolyline", () => {
  it("measures to the nearest point of a segment, not just its vertices", () => {
    // A north-south line one mile east of the point, running past it.
    const oneMileEast = 1 / (69.172 * Math.cos((38.9 * Math.PI) / 180));
    const d = milesToPolyline(-77, 38.9, [[[-77 + oneMileEast, 38.8], [-77 + oneMileEast, 39.0]]]);
    expect(d).toBeCloseTo(1, 3);
  });
});

describe("toSegment", () => {
  it("reads AADT, truck share, class and lanes from a real segment", () => {
    const s = toSegment(fixture("roads-near.json").features[2], -77.0365, 38.8977)!;
    expect(s).toMatchObject({ name: "17TH ST NW", roadClass: "Principal arterial", aadt: 23681, lanes: 4, dataYear: 2024 });
    expect(s.truckShare).toBeCloseTo((789 + 21) / 23681, 3);
    expect(s.distanceMiles).toBeLessThan(1);
  });
});

describe("busiestRoadsNear", () => {
  it("asks for per-road maxima, then only those roads' segments, from a rounded point", async () => {
    const calls: URL[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        const u = new URL(url);
        calls.push(u);
        if (u.searchParams.get("outStatistics")) {
          return new Response(JSON.stringify({ features: [{ attributes: { max_aadt: 23681 } }, { attributes: { max_aadt: 13247 } }] }));
        }
        return new Response(JSON.stringify(fixture("roads-near.json")));
      })
    );
    const roads = await busiestRoadsNear(-77.036512, 38.897663, 1);
    expect(calls[1].searchParams.get("where")).toBe("AADT>=13247");
    for (const u of calls) {
      expect(u.searchParams.get("geometryType")).toBe("esriGeometryEnvelope");
      const [xmin, ymin, xmax, ymax] = u.searchParams.get("geometry")!.split(",").map(Number);
      // Centered on the rounded point, not the exact one.
      expect((xmin + xmax) / 2).toBeCloseTo(-77.04, 4);
      expect((ymin + ymax) / 2).toBeCloseTo(38.9, 4);
      expect(u.toString()).not.toContain("036512");
    }
    // One entry per road, busiest first.
    expect(roads.map((r) => r.name)).toEqual(["17TH ST NW", "H ST NW"]);
  });

  it("refuses a radius over the limit without calling out", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(busiestRoadsNear(-77, 38.9, 10)).rejects.toThrow(SourceError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
