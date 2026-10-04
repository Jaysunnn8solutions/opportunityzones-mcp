import { canResearchTract } from "@/lib/data/researchScope";
import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { POST } from "@/app/api/exports/route";
import { buildExport, prepareExport } from "@/lib/access/exports";
import { db, DAY } from "@/lib/access/store";
import { hashToken } from "@/lib/access/http";
import { TERMS_VERSION } from "@/lib/content/siteTerms";
import { comparePlacesHandler } from "@/lib/tools/researchAccess";
import { loadTractData } from "@/lib/data/tracts";
import { entryReturnDestination } from "@/lib/client/termsConsent";
import { browserAllowance } from "@/lib/access/browserAllowance";

describe("bounded export samples and exact research handoffs", () => {
  it("preserves public research fragments through consent without permitting external redirects", () => {
    expect(entryReturnDestination("/compare", "#tracts=01001020100&measures=population")).toBe("/compare#tracts=01001020100&measures=population");
    expect(entryReturnDestination("https://outside.example", "#tracts=01001020100")).toBe("/");
    expect(entryReturnDestination("/api/account", "#anything")).toBe("/");
    expect(entryReturnDestination("/workbench", "#" + "a".repeat(64000))).toBe("/workbench");
  });
  it("returns three sample rows matching the actual file without charging export allowance", async () => {
    const id = randomUUID(), token = randomUUID();
    (await db().prepare("INSERT INTO accounts VALUES(?,?,?)").run(id, TERMS_VERSION, Date.now()));
    (await db().prepare("INSERT INTO sessions VALUES(?,?,?,?)").run(hashToken(token), id, Date.now() + DAY, Date.now()));
    const geoids = loadTractData().payload.geoids.filter((g) => g.startsWith("01") && canResearchTract(g)).slice(0, 4);
    const input = { geoids, columns: ["population", "median_household_income"], format: "json" as const };
    const browser = await browserAllowance(new Request("http://localhost:3000/api/account"), true);
    const response = await POST(new Request("http://localhost:3000/api/exports", { method: "POST", headers: { Origin: "http://localhost:3000", Cookie: `oz_session=${token}; ${browser.cookie.split(";")[0]}`, "Content-Type": "application/json" }, body: JSON.stringify({ preview: true, input }) }));
    expect(response.status).toBe(200);
    const preview = await response.json();
    const file = JSON.parse(buildExport(input, prepareExport(input)).body.toString());
    expect(preview.sample.rows).toEqual(file.rows.slice(0, 3));
    expect(preview.sample.columns.map((c: { name: string }) => c.name)).toEqual(file.manifest.columns);
    expect(preview.sample.rows[0].geoid).toMatch(/^0\d{10}$/);
    expect((await db().prepare("SELECT COUNT(*) AS n FROM exports WHERE account=?").get(id))).toEqual({ n: 0 });
    expect((await POST(new Request("http://localhost:3000/api/exports", { method: "POST", headers: { Origin: "http://localhost:3000", "Content-Type": "application/json" }, body: JSON.stringify({ preview: true, input }) }))).status).toBe(401);
  });
  it("provides an MCP comparison link with the same ordered tracts and measures", () => {
    const result = comparePlacesHandler({ geoids: ["10001040100", "10001040201"], measures: ["population", "median_household_income"] });
    expect(result).toHaveProperty("structuredContent");
    const data = (result as unknown as { structuredContent: { website: string } }).structuredContent;
    const url = new URL(data.website, "https://research.example");
    const params = new URLSearchParams(url.hash.slice(1));
    expect(params.get("tracts")).toBe("10001040100,10001040201");
    expect(params.get("measures")).toBe("population,median_household_income");
  });
});
