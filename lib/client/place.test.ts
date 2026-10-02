import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupPlace, mapHref, pointFromHash, reportHref } from "./place";
import { csvCell, overlapLabel } from "./presentation";

afterEach(() => vi.unstubAllGlobals());
describe("place research handoffs", () => {
  it("retains coordinates in fragments on reports and maps", () => {
    const point: [number, number] = [-84.3901, 33.7488];
    for (const href of [reportHref("13121003500", point), mapHref("13121003500", point)]) {
      const url = new URL(href, "https://example.test");
      expect(url.search).toBe("");
      expect(pointFromHash(url.hash)).toEqual(point);
    }
    expect(pointFromHash("#at=91,-80")).toBeNull();
    expect(pointFromHash("#at=33,-181")).toBeNull();
    expect(pointFromHash("#at=,0")).toBeNull();
  });
  it("asks the visitor to choose among address matches without fetching an arbitrary tract", async () => {
    const candidates = [{ geoid: "13121003500", lon: -84.39, lat: 33.75, label: "Match A" }, { geoid: "13121003600", lon: -84.40, lat: 33.76, label: "Match B" }];
    const fetcher = vi.fn().mockResolvedValue(Response.json({ matches: candidates }));
    vi.stubGlobal("fetch", fetcher);
    expect(await lookupPlace("55 Trinity Ave, Atlanta GA")).toEqual({ kind: "ambiguous", candidates });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe("/api/geocode");
    expect(fetcher.mock.calls[0][1].method).toBe("POST");
  });
  it("uses the selected candidate's point and distinguishes unavailable from no match", async () => {
    const candidate = { geoid: "13121003500", lon: -84.39, lat: 33.75, label: "Match A" };
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ geoid: candidate.geoid })).mockResolvedValueOnce(new Response(null, { status: 503 })).mockResolvedValueOnce(new Response(null, { status: 404 })).mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetcher);
    expect(await lookupPlace("address", candidate)).toMatchObject({ point: [-84.39, 33.75], matched: "Match A" });
    expect(fetcher.mock.calls[0][0]).toBe("/api/tract/13121003500");
    expect(await lookupPlace(candidate.geoid)).toBe("error");
    expect(await lookupPlace(candidate.geoid)).toBe("no-match");
    expect(await lookupPlace(candidate.geoid)).toBe("error");
  });
  it("never rounds partial historic overlap up to full overlap", () => {
    expect(overlapLabel(0.9999)).toContain("99%");
    expect(overlapLabel(0.0001)).toContain("<1%");
    expect(overlapLabel(null)).toContain("unknown");
  });
  it("neutralizes spreadsheet formulas in exported text", () => {
    expect(csvCell("=SUM(A1:A2)")).toContain("'=SUM");
    expect(csvCell('A, "B"')).toBe('"A, ""B"""');
  });
});
