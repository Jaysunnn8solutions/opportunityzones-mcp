import { describe, expect, it } from "vitest";
import { researchFlagsAllowed, researchStatusAllowed } from "@/lib/oz/researchScope";
import { canResearchTract } from "@/lib/data/researchScope";
import { excludedTract, qualifiedTract } from "@/tests/research-fixtures";
import { prepareExport, exportRows } from "./exports";
import { searchPage } from "./search";
import { NO_FILTERS } from "@/lib/explore/filter";
import { getTractHandler } from "@/lib/tools/getTract";
import { researchExtensions } from "@/lib/tools/researchExtensions";
import { GET } from "@/app/api/tract/[geoid]/route";
import { POST } from "@/app/api/research/route";

describe("Opportunity Zone research scope", () => {
  it("allows eligibility, designation, or the existing historical classification; never other incentives or unknowns", () => {
    expect(researchStatusAllowed(1, null, 0)).toBe(true);
    expect(researchStatusAllowed(0, 1, 0)).toBe(true);
    expect(researchStatusAllowed(0, 0, 0.5)).toBe(true);
    expect(researchStatusAllowed(null, null, null)).toBe(false);
    expect(researchStatusAllowed(0, 0, 0.49)).toBe(false);
    for (const flags of [undefined, 0, 2, 8, 16, 32, 128, 8 | 16 | 32]) expect(researchFlagsAllowed(flags)).toBe(false);
    for (const flags of [1, 4, 64, 129]) expect(researchFlagsAllowed(flags)).toBe(true);
  });
  it("rejects direct profile, export preview and export generation for excluded tracts", async () => {
    expect(canResearchTract(excludedTract)).toBe(false);
    expect(canResearchTract(qualifiedTract)).toBe(true);
    const response = await GET(new Request("http://localhost:3000/api/tract/test"), { params: Promise.resolve({ geoid: excludedTract }) });
    expect(response.status).toBe(403); expect(await response.json()).not.toHaveProperty("measures");
    expect(() => prepareExport({ geoids: [qualifiedTract, excludedTract], columns: ["population"] })).toThrow(/only/);
    expect(() => exportRows([excludedTract], ["population"])).toThrow(/only/);
    expect(exportRows([qualifiedTract], ["population"])).toHaveLength(1);
  });
  it("blocks individual MCP values, uncertainty and export previews", () => {
    expect(getTractHandler({ geoid: excludedTract })).toHaveProperty("isError", true);
    for (const [name, args] of [
      ["compare_selected_tracts", { geoids: [qualifiedTract, excludedTract], measures: ["population"] }],
      ["get_uncertainty", { geoid: excludedTract, measure: "population" }],
      ["preview_research_export", { geoids: [excludedTract], measures: ["population"] }],
      ["explain_criteria_match", { geoid: excludedTract, filters: {} }],
    ] as const) expect(researchExtensions.find((item) => item.name === name)!.run(args)).toHaveProperty("isError", true);
  });
  it("excludes ineligible records from default lists and explicit evidence requests", () => {
    const state = excludedTract.slice(0, 2);
    const page = searchPage(state, NO_FILTERS, "geoid", 0, true);
    expect(page.matches.every((id) => canResearchTract(id))).toBe(true);
    const explicit = searchPage(state, NO_FILTERS, "geoid", 0, true, [excludedTract]);
    expect(explicit.rows).toHaveLength(0); expect(Object.keys(explicit.tracts ?? {})).toHaveLength(0);
  });
  it("rejects baseline and boundary extraction and distinguishes excluded bulk matches", async () => {
    const request = (body: unknown) => new Request("http://localhost:3000/api/research", { method: "POST", headers: { Origin: "http://localhost:3000", "Content-Type": "application/json" }, body: JSON.stringify(body) });
    for (const action of ["baseline", "boundary"]) expect((await POST(request({ action, geoid: excludedTract, vintage: "2020" }))).status).toBe(403);
    const result = await (await POST(request({ action: "match", geoids: [excludedTract] }))).json();
    expect(result.matched).toHaveLength(0); expect(result.excluded).toHaveLength(1); expect(result.absent).toHaveLength(0);
  });
});
