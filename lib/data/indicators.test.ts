import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { getTract, loadTractData, type TractData } from "./tracts";
import { historicalCohort, loadIndicatorArtifact, tractIndicators } from "./indicators";
import { qualifiedTract } from "@/tests/research-fixtures";

const temporary: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true }); });

it("computes cohort medians only for known status and at least 50% overlap; null is not zero", () => {
  const columns = new Map(Object.entries({
    oz2018_population_share: [.5, .9, .49, 1, 1, 1], eligible_2027: [0, 0, 0, 1, null, 0], population: [0, 100, 999, 400, 500, null],
  }).map(([key, numbers]) => [key, { get: (i: number) => numbers[i] }]));
  const fixture = { payload: { count: 6, columns } } as unknown as TractData;
  const result = historicalCohort(fixture);
  expect([result.ineligibleCount, result.eligibleCount]).toEqual([3, 1]);
  expect(result.metrics[0]).toMatchObject({ ineligibleMedian: 50, eligibleMedian: 400, ineligibleN: 2, eligibleN: 1 });
});

it("serves trained historical results for matching data and never emits a 2037 probability", () => {
  const data = loadTractData();
  const result = tractIndicators(getTract(qualifiedTract, data)!, data);
  expect(result.modelStatus).toBe("available");
  expect(result.models).toHaveLength(3);
  expect(result.models.every((model) => model.rows > 500)).toBe(true);
  expect(result.models.flatMap((model) => model.indicators).every((i) => i.timing === "insufficient-evidence")).toBe(true);
  expect(result.outlook).toMatchObject({ year: 2037, probability: null, status: "insufficient-evidence" });
  expect(result.cohort.eligibleCount).toBeGreaterThan(0);
  expect(result.cohort.ineligibleCount).toBeGreaterThan(0);
});

it("withholds missing, malformed and stale artifacts", () => {
  const actualDir = process.env.OZ_DATA_DIR ?? path.join(process.cwd(), "data");
  const artifact = readFileSync(path.join(actualDir, "research-indicators.json"), "utf8");
  for (const mode of ["missing", "invalid", "stale"] as const) {
    const dir = mkdtempSync(path.join(os.tmpdir(), "oz-indicator-test-")); temporary.push(dir);
    if (mode !== "missing") writeFileSync(path.join(dir, "research-indicators.json"), mode === "invalid" ? "{}" : artifact);
    if (mode === "stale") { writeFileSync(path.join(dir, "tracts.bin"), "changed"); writeFileSync(path.join(dir, "manifest.json"), "{}"); }
    vi.stubEnv("OZ_DATA_DIR", dir);
    expect(loadIndicatorArtifact()).toEqual({ status: mode, data: null });
  }
});
