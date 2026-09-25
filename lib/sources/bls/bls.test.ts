import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SourceError } from "../http";
import { countyUnemployment, seriesId, summariseLaus } from "./laus";
import { countyJobs, summariseQcew } from "./qcew";

// Real responses recorded 2026-09-25 for Fulton County, GA (13121): the QCEW
// 2025-Q1 area file trimmed to the rows read, and the LAUS unemployment series
// from the keyless v1 API (same format as v2).
const qcewCsv = readFileSync(path.join(import.meta.dirname, "fixtures", "qcew-13121-2025q1.csv"), "utf8");
const laus = JSON.parse(readFileSync(path.join(import.meta.dirname, "fixtures", "laus-13121.json"), "utf8"));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("summariseQcew", () => {
  const s = summariseQcew(qcewCsv, "13121")!;

  it("reads the county total for the quarter", () => {
    expect(s).toMatchObject({
      county: "13121",
      quarter: "2025-Q1",
      establishments: 78045,
      employment: 945911,
      averageWeeklyWage: 2284,
    });
    expect(s.employmentChangeYoY).toBeCloseTo(0.005, 4);
    expect(s.wageChangeYoY).toBeCloseTo(0.033, 4);
  });

  it("ranks the largest private supersectors", () => {
    expect(s.topPrivateSectors.length).toBe(5);
    const e = s.topPrivateSectors.map((x) => x.employment);
    expect([...e].sort((a, b) => b - a)).toEqual(e);
  });

  it("treats a suppressed total as missing, not zero", () => {
    const suppressed = qcewCsv.replace(/^("13121","0","10","70","0","2025","1",)""/m, '$1"N"');
    expect(summariseQcew(suppressed, "13121")!.employment).toBeNull();
  });
});

describe("countyJobs", () => {
  it("steps back past unpublished quarters", async () => {
    const tried: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        tried.push(url.replace(/.*\/api\/(\d+)\/(\d)\/.*/, "$1-Q$2"));
        return tried.length < 3 ? new Response("", { status: 404 }) : new Response(qcewCsv);
      })
    );
    const s = await countyJobs("13121", new Date("2025-08-15T00:00:00Z"));
    expect(tried).toEqual(["2025-Q3", "2025-Q2", "2025-Q1"]);
    expect(s?.quarter).toBe("2025-Q1");
  });
});

describe("summariseLaus", () => {
  const s = summariseLaus(laus, "13121")!;

  it("takes the newest month, flagging it preliminary", () => {
    expect(s).toMatchObject({ county: "13121", month: "2026-07", unemploymentRate: 3.4, preliminary: true });
  });

  it("compares with the same month a year earlier (not seasonally adjusted)", () => {
    // July 2026 3.4 vs July 2025 3.5.
    expect(s.changeFromYearAgo).toBe(-0.1);
  });

  it("skips annual averages and months BLS could not collect", () => {
    const onlyOctober = {
      status: "REQUEST_SUCCEEDED",
      Results: { series: [{ seriesID: "x", data: [{ year: "2025", period: "M10", value: "-" }, { year: "2025", period: "M13", value: "3.5" }] }] },
    };
    expect(summariseLaus(onlyOctober, "13121")).toBeNull();
  });

  it("builds the county series ID", () => {
    expect(seriesId("13121")).toBe("LAUCN131210000000003");
  });
});

describe("countyUnemployment", () => {
  it("names the missing key and calls nothing", async () => {
    vi.stubEnv("BLS_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const err = await countyUnemployment("13121").catch((e: unknown) => e);
    expect((err as SourceError).kind).toBe("missing-key");
    expect((err as Error).message).toContain("BLS_API_KEY");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the key in the POST body, never the URL", async () => {
    vi.stubEnv("BLS_API_KEY", "k-for-test-0000");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(laus)));
    vi.stubGlobal("fetch", fetchMock);
    await countyUnemployment("13121");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain("k-for-test-0000");
    expect(JSON.parse(String(init.body)).registrationkey).toBe("k-for-test-0000");
  });
});
