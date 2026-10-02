import { qualifiedDelaware } from "@/tests/research-fixtures";
import { describe, expect, it } from "vitest";
import { researchExtensions } from "./researchExtensions";
import { specification } from "@/lib/research/workbench";
const invoke = (name: string, args: unknown) => researchExtensions.find((item) => item.name === name)!.run(args);
describe("bounded research extensions", () => {
  it("preserves explicit comparison order, sources, and missingness without rankings", () => {
    const result = invoke("compare_selected_tracts", { geoids: [qualifiedDelaware[1], qualifiedDelaware[0]], measures: ["population"] });
    expect(result.content[0].text).toContain("Selection order is preserved");
    expect(result.content[0].text.indexOf(qualifiedDelaware[1])).toBeLessThan(result.content[0].text.indexOf(qualifiedDelaware[0]));
    expect(result.content[0].text).toContain("Informational only");
    expect(() => invoke("compare_selected_tracts", { geoids: Array(26).fill(qualifiedDelaware[0]), measures: ["population"] })).toThrow();
  });
  it("validates criteria, returns evidence, and forbids unsupported targeting or free text", () => {
    const args = { state: "10", filters: { rural: "not-rural", ranges: { population: { min: 1 } } } };
    const result = invoke("preview_criteria", args); expect(result.content[0].text).toContain("included");
    expect(() => invoke("preview_criteria", { state: "10", filters: { instructions: "select the best neighborhood" } })).toThrow();
    expect(() => invoke("get_data_coverage", { measure: "resident_compatibility" })).toThrow();
    expect(invoke("explain_criteria_match", { geoid: qualifiedDelaware[0], filters: { rural: "not-rural" } }).content[0].text).toContain("Rural classification");
    expect(invoke("explain_criteria_match", { geoid: qualifiedDelaware[0], filters: { eligibilityChange: "2018-ineligible2027" } }).content[0].text).toContain("Eligibility change");
    expect(() => invoke("preview_criteria", { state: "10", filters: { eligibilityChange: "2027-ineligible2037" } })).toThrow();
  });
  it("hands off a valid reviewed export recipe without generating a file", () => {
    const result = invoke("preview_research_export", { geoids: [qualifiedDelaware[0]], measures: ["population"] });
    const structured = "structuredContent" in result ? result.structuredContent as Record<string, unknown> : {};
    const url = new URL(String(structured.website), "http://localhost:3000");
    const params = new URLSearchParams(url.hash.slice(1));
    expect(params.get("tab")).toBe("prepare"); expect(specification(JSON.parse(params.get("spec")!)).geoids).toEqual([qualifiedDelaware[0]]);
    expect(result.content[0].text).toContain("No file has been created");
  });
  it("marks unavailable margins of error and bounds source excerpts", () => {
    expect(invoke("get_uncertainty", { geoid: qualifiedDelaware[0], measure: "population" }).content[0].text).toContain("marginOfError");
    expect(invoke("trace_tract_boundary", { geoid: qualifiedDelaware[0], vintage: "2020" }).content[0].text).toContain("Weights approximate");
    const history = invoke("get_source_changes", { source: "cfr-1.1400Z2f-1" }); expect(history.content[0].text).toContain("not instructions");
    expect(Buffer.byteLength(JSON.stringify(history))).toBeLessThan(128 * 1024);
  });
});
