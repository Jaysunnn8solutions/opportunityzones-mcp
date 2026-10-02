import { qualifiedDelaware } from "@/tests/research-fixtures";
import { describe, expect, it } from "vitest";
import { EMPTY_SPEC, parseTractList, specification, sharedSpecification, readProjects, parseRelease, releaseChanges } from "./workbench";
import { outlinePaths } from "./geometry";
import { baseline, coverage, researchCatalog } from "./catalog";
import { buildExport, prepareExport } from "@/lib/access/exports";
import { POST } from "@/app/api/research/route";
import { loadTractData } from "@/lib/data/tracts";
import { unzipSync, strFromU8 } from "fflate";

describe("portable research without private project data", () => {
  it("allowlists shareable selections and never exports project notes or exact points", () => {
    const input = { ...EMPTY_SPEC, state: "10", geoids: ["10001040100"], notes: "private note", title: "Private project", address: "private address", point: [1, 2], account: "secret" };
    const parsed = specification(input); const hash = sharedSpecification(parsed);
    expect(decodeURIComponent(hash)).not.toMatch(/private|secret|address|point|account|notes|title/);
    expect(parsed.geoids).toEqual(["10001040100"]);
    expect(() => sharedSpecification({ ...parsed, geoids: Array.from({ length: 26 }, (_, i) => String(10001040100 + i)) })).toThrow(/25/);
    expect(() => specification({ ...parsed, columns: ["resident_compatibility"] })).toThrow();
  });
  it("preserves leading zeros, identifies duplicates and rejects scientific notation without guessing", () => {
    expect(parseTractList('geoid\r\n"01001020100"\n01001020100\n1.00010401E10\n123')).toEqual({ geoids: ["01001020100"], duplicates: 1, invalid: ["1.00010401E10", "123"] });
    expect(() => parseTractList(Array(501).fill("01001020100").join("\n"))).toThrow(/500/);
  });
  it("bounds local projects and strips embedded fields from their specifications", () => {
    const projects = readProjects(JSON.stringify([{ id: "a", title: "Project", notes: "Local only", updated: "2026-09-27", spec: { ...EMPTY_SPEC, private: true } }]));
    expect(projects[0].notes).toBe("Local only"); expect(projects[0].spec).not.toHaveProperty("private");
    expect(() => readProjects("{}")).toThrow(); expect(() => readProjects(JSON.stringify(Array(21).fill({})))).toThrow();
  });
});

describe("export dictionaries, receipts, and release comparisons", () => {
  it("builds a metadata-only package with no tract values and keeps requested definitions", () => {
    const input = { dictionaryOnly: true, columns: ["population", "built_2020_or_later"] };
    const exportFile = buildExport(input, prepareExport(input)); const files = unzipSync(exportFile.body);
    expect(exportFile.rows).toBe(0); expect(strFromU8(files["data-dictionary.csv"])).toContain("built_2020_or_later");
    expect(files["areas.csv"]).toBeUndefined();
    expect(JSON.parse(strFromU8(files["manifest.json"])).rows).toBe(0);
    expect(() => prepareExport({ ...input, dictionaryOnly: "true" as unknown as boolean })).toThrow();
  });
  it("distinguishes missing coverage, row selection, definitions and published values", () => {
    const older = parseRelease(JSON.stringify({ manifest: { datasetVersion: "a", state: "10" }, rows: [{ geoid: "10001040100", population: null }, { geoid: "10001040201", population: 3 }], dictionary: [] }));
    const newer = parseRelease(JSON.stringify({ manifest: { datasetVersion: "b", state: "11" }, rows: [{ geoid: "10001040100", population: 0 }, { geoid: "10001040201", population: 4 }, { geoid: "10001040202", population: 1 }], dictionary: [{ name: "population", unit: "count" }] }));
    const changes = releaseChanges(older, newer);
    expect(changes.changed.map((c) => c.kind)).toEqual(["Missing-value coverage changed", "Published value changed", "Added to this file"]);
    expect(changes.definitionsChanged).toBe(true); expect(changes.scopeChanged).toBe(true);
    expect(() => parseRelease(JSON.stringify({ manifest: { datasetVersion: "x" }, rows: [{ geoid: "10001040100", secret: "value" }] }))).toThrow();
  });
});

describe("descriptive geography and API boundaries", () => {
  it("uses medians of available tract values and never aggregates dollar medians as totals", () => {
    const { payload } = loadTractData(); const id = payload.geoids.find((g) => g.startsWith("10"))!;
    const single = baseline("population", id, "tract", []); expect(single.median).toBe(single.value); expect(single.total).toBe(1);
    const county = baseline("median_household_income", id, "county", []); expect(county.sum).toBeNull(); expect(county.available + county.missing).toBe(county.total);
    const selection = baseline("population", id, "selection", [id, "99999999999"]); expect(selection.total).toBe(2); expect(selection.missing).toBeGreaterThanOrEqual(1); expect(selection.sum).toBeNull();
    const counts = coverage("population", "10"); expect(counts.reduce((n, g) => n + g.total, 0)).toBe(payload.geoids.filter((g) => g.startsWith("10")).length);
    expect(researchCatalog().columns.find((c) => c.name === "built_2020_or_later")?.moe).toBe("built_2020_or_later_moe");
  });
  it("rejects cross-origin, advanced anonymous and oversized list requests; impact counts partition the universe", async () => {
    const request = (body: unknown, origin = "http://localhost:3000") => new Request("http://localhost:3000/api/research", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    expect((await POST(request({ action: "coverage" }, "https://foreign.example"))).status).toBe(403);
    expect((await POST(request({ action: "impact", state: "10", filters: { ...EMPTY_SPEC.filters, ranges: { population: { min: 10 } } } }))).status).toBe(401);
    expect((await POST(request({ action: "match", geoids: ["10001040100", "10001040201", "10001040202"] }))).status).toBe(401);
    const response = await POST(request({ action: "impact", state: "10", filters: { ...EMPTY_SPEC.filters, flags: ["eligible"] } }));
    expect(response.status).toBe(200); const result = await response.json(); expect(result.included + result.excluded + result.unknown).toBe(result.total);
    expect((await POST(request({ action: "coverage", column: "race" }))).status).toBe(400);
    expect((await POST(request({ action: "baseline", geoid: "99999999999" }))).status).toBe(404);
  });
  it("serves published historical relationships and preserves their component totals", async () => {
    const response = await POST(new Request("http://localhost:3000/api/research", { method: "POST", headers: { Origin: "http://localhost:3000", "Content-Type": "application/json" }, body: JSON.stringify({ action: "boundary", geoid: qualifiedDelaware[0], vintage: "2020" }) }));
    expect(response.status).toBe(200); const result = await response.json(); expect(result.pairs.length).toBeGreaterThan(0);
    expect(result.pairs.every((p: [string, string]) => p[1] === qualifiedDelaware[0])).toBe(true);
    expect(result.totals[0]).toBeCloseTo(result.pairs.reduce((sum: number, p: [string, string, number]) => sum + p[2], 0));
  });
  it("uses a common extent and handles antimeridian coordinates without nonfinite paths", () => {
    const paths = outlinePaths([{ id: "a", geometry: { type: "Polygon", coordinates: [[[179, 1], [-179, 1], [-179, 2], [179, 1]]] } }]);
    expect(paths).toHaveLength(1); expect(paths[0].path).not.toMatch(/NaN|Infinity/);
    expect(outlinePaths([])).toEqual([]);
  });
});
