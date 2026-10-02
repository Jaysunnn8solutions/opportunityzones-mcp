/** Offline artifacts only. No training or upstream API calls in a user request. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { eligibilityEvidence, type IndicatorModel, type TractAnalysis } from "../analysis/indicators";
import { dataDir, loadTractData, type TractData, type TractProfile } from "./tracts";

const finite = z.number().finite();
const artifactSchema = z.object({
  schemaVersion: z.literal(1), datasetVersion: z.string(),
  fingerprints: z.record(z.string(), z.string()),
  models: z.array(z.object({
    outcome: z.string(), status: z.enum(["exploratory", "insufficient-data"]), rows: z.number().int().nonnegative(),
    states: z.number().optional(), selectedModel: z.enum(["ridge", "boosting"]).optional(),
    skill: finite.nullable().optional(), errors: z.record(z.string(), finite).optional(),
    indicators: z.array(z.object({ key: z.string(), label: z.string(), importance: finite, positiveFolds: z.number(),
      timing: z.literal("insufficient-evidence"), timingReason: z.string() })),
  })),
  histories: z.record(z.string().regex(/^\d{11}$/), z.object({ geoid2010: z.string().regex(/^\d{11}$/), changes: z.record(z.string(), finite.nullable()) })),
  limitations: z.array(z.string()),
});
type Artifact = z.infer<typeof artifactSchema>;
const cached = new Map<string, { status: TractAnalysis["modelStatus"]; data: Artifact | null }>();

export function loadIndicatorArtifact(): { status: TractAnalysis["modelStatus"]; data: Artifact | null } {
  const dir = dataDir();
  const previous = cached.get(dir);
  if (previous) return previous;
  const file = path.join(dir, "research-indicators.json");
  let result: { status: TractAnalysis["modelStatus"]; data: Artifact | null } = { status: "missing", data: null };
  if (existsSync(file)) {
    try {
      const data = artifactSchema.parse(JSON.parse(readFileSync(file, "utf8")));
      const matches = ["tracts.bin", "manifest.json"].every((name) =>
        createHash("sha256").update(readFileSync(path.join(dir, name))).digest("hex") === data.fingerprints[`data/${name}`]);
      result = matches ? { status: "available", data } : { status: "stale", data: null };
    } catch { result = { status: "invalid", data: null }; }
  }
  cached.set(dir, result);
  return result;
}

const METRICS = [
  { key: "population", label: "Population", unit: "count", period: "2020–2024 ACS", source: "acs5" },
  { key: "housing_units", label: "Housing units", unit: "count", period: "2020–2024 ACS", source: "acs5" },
  { key: "median_household_income", label: "Median household income", unit: "USD", period: "2024 dollars · 2020–2024 ACS", source: "acs5" },
  { key: "vacancy_rate", label: "Housing vacancy", unit: "share", period: "2020–2024 ACS", source: "acs5" },
  { key: "share_built_2010_or_later", label: "Housing built since 2010", unit: "share", period: "2020–2024 ACS housing stock", source: "acs5" },
  { key: "median_gross_rent", label: "Median gross rent", unit: "USD", period: "2024 dollars · 2020–2024 ACS", source: "acs5" },
] as const;
const cohortCache = new WeakMap<TractData, TractAnalysis["cohort"]>();
function median(values: number[]) {
  if (!values.length) return null;
  values.sort((a, b) => a - b);
  const i = Math.floor(values.length / 2);
  return values.length % 2 ? values[i] : (values[i - 1] + values[i]) / 2;
}
export function historicalCohort(data: TractData): TractAnalysis["cohort"] {
  const cached = cohortCache.get(data);
  if (cached) return cached;
  const { payload } = data;
  const eligible: number[] = [], ineligible: number[] = [];
  for (let i = 0; i < payload.count; i++) {
    const share = payload.columns.get("oz2018_population_share")?.get(i);
    if (share == null || share < .5) continue;
    const status = payload.columns.get("eligible_2027")?.get(i);
    if (status === 1) eligible.push(i);
    else if (status === 0) ineligible.push(i);
  }
  const result = { eligibleCount: eligible.length, ineligibleCount: ineligible.length,
    metrics: METRICS.map((metric) => {
      const column = payload.columns.get(metric.key);
      const values = (indices: number[]) => indices.map((i) => column?.get(i)).filter((v): v is number => v != null && Number.isFinite(v));
      const yes = values(eligible), no = values(ineligible);
      return { ...metric, value: null, eligibleMedian: median(yes), ineligibleMedian: median(no), eligibleN: yes.length, ineligibleN: no.length };
    }),
  };
  cohortCache.set(data, result);
  return result;
}

export function tractIndicators(tract: TractProfile, data: TractData = loadTractData()): TractAnalysis {
  const v = (key: string) => tract.measures[key]?.value ?? null;
  const published = v("eligible_2027");
  const share = v("oz2018_population_share");
  const artifact = loadIndicatorArtifact();
  const cohort = historicalCohort(data);
  return {
    datasetVersion: data.manifest.generated, historicalOverlap: share,
    historicalGroup: share != null && share >= .5 && published === 0 ? "ineligible" : share != null && share >= .5 && published === 1 ? "eligible" : "outside-cohort",
    eligibility: eligibilityEvidence(published, v("median_family_income"), v("area_median_family_income"), v("poverty_rate")),
    outlook: { year: 2037, status: "insufficient-evidence", probability: null,
      reason: "A reliable 2037 selection probability is not available. Future eligibility data, tract boundaries, state nominations, and Treasury certification are unknown. Current eligibility is not a designation, and a state’s designation cap is not an individual tract’s probability." },
    cohort: { ...cohort, metrics: cohort.metrics.map((metric) => ({ ...metric, value: v(metric.key) })) },
    history: artifact.data?.histories[tract.geoid] ?? null,
    modelStatus: artifact.status, models: (artifact.data?.models ?? []) as IndicatorModel[],
    limitations: artifact.data?.limitations ?? ["Validated historical model results are not available for this dataset version."],
    construction: tract.countyPermits,
  };
}
