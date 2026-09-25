import { afterEach, describe, expect, it, vi } from "vitest";
import { checkAddressHandler } from "./checkAddress";
import { compareTractHandler, ordinal, percentile } from "./compareTract";
import { getTractHandler } from "./getTract";
import { listTractsHandler } from "./listTracts";
import { nearbyHandler } from "./nearby";
import { extractSection, oz1FindingsHandler } from "./oz1Findings";
import { DISCLAIMER } from "./shared";

// Handlers run against the committed data/ (vitest sets OZ_DATA_DIR); any
// network call is stubbed.
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const textOf = (r: { content: Array<{ text: string }> }) => r.content[0].text;

/** No tool may recommend. These phrases would turn a description into advice. */
const ADVICE = /\b(you should|we recommend|recommended investment|best (tract|investment)|buy|invest here|good investment)\b/i;

function expectCompliant(body: string) {
  expect(body).toContain(DISCLAIMER);
  expect(body).not.toMatch(ADVICE);
}

describe("get_tract", () => {
  it("describes a real tract with its status, measures and sources", () => {
    const r = getTractHandler({ geoid: "13121003500" });
    const body = textOf(r);
    expect(body).toContain("Fulton");
    expect(body).toContain("2027 designation eligibility");
    expect(body).toContain("Sources:");
    expect(body).toContain("U.S. Department of the Treasury");
    expectCompliant(body);
  });

  it("errors, with the disclaimer, for an unknown tract", () => {
    const r = getTractHandler({ geoid: "99999999999" });
    expect(r).toHaveProperty("isError", true);
    expectCompliant(textOf(r));
  });
});

describe("list_tracts", () => {
  it("filters by state and eligibility and sorts by one raw measure", () => {
    const body = textOf(listTractsHandler({ state: "DE", eligible2027: true, sortBy: "poverty_rate", limit: 5 }));
    expect(body).toMatch(/tracts match in Delaware/);
    const rows = body.split("\n").filter((l) => /^\| 10\d{9} /.test(l));
    expect(rows.length).toBe(5);
    for (const row of rows) expect(row).toContain("| yes |");
    expectCompliant(body);
  });

  it("rejects an unknown state", () => {
    expect(listTractsHandler({ state: "ZZ" })).toHaveProperty("isError", true);
  });
});

describe("compare_tract", () => {
  it("computes mid-rank percentiles and English ordinals", () => {
    expect(percentile([1, 2, 3, 4], 3)).toBeCloseTo(0.625, 5);
    expect([1, 2, 3, 4, 11, 12, 13, 21, 62, 100].map(ordinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "62nd", "100th",
    ]);
  });

  it("compares a tract with eligible tracts in its state, measure by measure", () => {
    const body = textOf(compareTractHandler({ geoid: "09110504500" }));
    expect(body).toMatch(/eligible tracts in Connecticut/);
    expect(body).not.toMatch(/score/i);
    expectCompliant(body);
  });
});

describe("oz1_findings", () => {
  it("serves a section of the published report", () => {
    expect(extractSection("## A\nx\n## B\ny", "B")).toBe("## B\ny");
    const body = textOf(oz1FindingsHandler({ section: "headline" }));
    expect(body).toMatch(/designated vs matched eligible tracts/i);
    expectCompliant(body);
  });
});

describe("check_address", () => {
  it("geocodes, then reports the tract's status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            result: {
              addressMatches: [
                {
                  matchedAddress: "55 TRINITY AVE SW, ATLANTA, GA, 30303",
                  coordinates: { x: -84.3907, y: 33.7486 },
                  geographies: { "Census Tracts": [{ GEOID: "13121003500", NAME: "Census Tract 35" }] },
                },
              ],
            },
          })
        )
      )
    );
    const body = textOf(await checkAddressHandler({ address: "55 Trinity Ave SW, Atlanta, GA 30303" }));
    expect(body).toContain("13121003500");
    expect(body).toContain("2027 designation eligibility");
    expect(body).toContain("U.S. Census Bureau, Census Geocoder");
    expectCompliant(body);
  });

  it("says so when nothing matches", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: { addressMatches: [] } }))));
    const r = await checkAddressHandler({ address: "nowhere at all" });
    expect(r).toHaveProperty("isError", true);
  });
});

describe("nearby", () => {
  it("reports each source separately and marks failures unavailable instead of failing", async () => {
    vi.stubEnv("CENSUS_API_KEY", "");
    vi.stubEnv("BLS_API_KEY", "");
    vi.stubEnv("FSQ_PORTAL_TOKEN", "");
    // Every live source fails.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));
    const body = textOf(await nearbyHandler({ lat: 33.749, lon: -84.388, radiusMiles: 1 }));
    expect(body).toMatch(/Flood zone: not available/);
    expect(body).toMatch(/EPA sites: not available/);
    expect(body).toMatch(/Amenities: not available \(this server has no key/);
    // Anchor institutions come from bundled data and still answer.
    expect(body).toMatch(/## Anchor institutions\n- /);
    expectCompliant(body);
  });
});
