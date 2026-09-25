import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SourceError } from "../http";
import { countyLaborMarket, summariseQwi } from "./qwi";

// Real QWI response recorded 2026-09-25 for Fulton County, GA (13121),
// 2023-Q1 to 2025-Q4; the newest quarter lacks separations and earnings.
const fixture = JSON.parse(readFileSync(path.join(import.meta.dirname, "fixtures", "qwi-fulton-ga.json"), "utf8"));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("summariseQwi", () => {
  const s = summariseQwi(fixture)!;

  it("uses the newest quarter with employment", () => {
    expect(s).toMatchObject({ county: "13121", quarter: "2025-Q4", employment: 916982 });
  });

  it("compares with the same quarter a year earlier", () => {
    // 2025-Q4 916,982 vs 2024-Q4 916,808.
    expect(s.employmentChangeYoY).toBeCloseTo((916982 - 916808) / 916808, 4);
  });

  it("takes earnings from the newest quarter that has them, and says which", () => {
    expect(s).toMatchObject({ monthlyEarnings: 8189, earningsQuarter: "2025-Q3" });
  });

  it("computes the hires rate", () => {
    expect(s.hiresRate).toBeCloseTo(162937 / 916982, 4);
  });

  it("rejects a body that is not QWI rows", () => {
    expect(() => summariseQwi({ error: "x" })).toThrow(SourceError);
  });
});

describe("countyLaborMarket", () => {
  it("names the missing key and calls nothing", async () => {
    vi.stubEnv("CENSUS_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const err = await countyLaborMarket("13121").catch((e: unknown) => e);
    expect((err as SourceError).kind).toBe("missing-key");
    expect((err as Error).message).toContain("CENSUS_API_KEY");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never exposes the key when the API fails", async () => {
    vi.stubEnv("CENSUS_API_KEY", "abc123secretvalue456");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>Invalid Key</html>")));
    const err = await countyLaborMarket("13121").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SourceError);
    expect((err as Error).message).not.toContain("abc123secretvalue456");
  });
});
