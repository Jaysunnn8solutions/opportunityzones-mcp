/** Shared public results, with no model artifacts or private research inputs. */
import { INCOME_THRESHOLD, POVERTY_RATE_THRESHOLD, POVERTY_TEST_INCOME_CAP } from "../oz/eligibility";
export type TimingLabel = "potential-leading" | "concurrent" | "lagging" | "mixed" | "insufficient-evidence";

/** Timing is relative to an outcome. Feature importance alone cannot assign it. */
export function timingLabel(evidence: {
  temporalValidation: boolean; releaseVintageValidation: boolean; comparableGeography: boolean;
  independentPeriods: number; skill: number | null; lagYears: number[];
}): TimingLabel {
  if (!evidence.temporalValidation || !evidence.releaseVintageValidation || !evidence.comparableGeography ||
      evidence.independentPeriods < 3 || evidence.skill == null || !Number.isFinite(evidence.skill) || evidence.skill <= 0 ||
      !evidence.lagYears.length || evidence.lagYears.some((lag) => !Number.isFinite(lag))) return "insufficient-evidence";
  // Positive lag: indicator precedes outcome; negative: follows outcome.
  const signs = new Set(evidence.lagYears.map(Math.sign));
  if (signs.size > 1) return "mixed";
  return signs.has(1) ? "potential-leading" : signs.has(-1) ? "lagging" : "concurrent";
}

export interface IndicatorModel {
  outcome: string;
  status: "exploratory" | "insufficient-data";
  rows: number;
  states?: number;
  selectedModel?: "ridge" | "boosting";
  skill?: number | null;
  errors?: Record<string, number>;
  indicators: Array<{ key: string; label: string; importance: number; positiveFolds: number; timing: TimingLabel; timingReason: string }>;
}

export interface TractAnalysis {
  datasetVersion: string;
  historicalOverlap: number | null;
  historicalGroup: "eligible" | "ineligible" | "outside-cohort";
  eligibility: {
    published: number | null;
    reason: string;
    checks: Array<{ label: string; met: boolean | null; detail: string }>;
    incomeRatio: number | null;
    povertyRate: number | null;
    agreesWithPublished: boolean | null;
  };
  outlook: { year: 2037; probability: null; status: "insufficient-evidence"; reason: string };
  cohort: {
    eligibleCount: number; ineligibleCount: number;
    metrics: Array<{ key: string; label: string; unit: "count" | "USD" | "share"; period: string; source: string;
      value: number | null; eligibleMedian: number | null; ineligibleMedian: number | null; eligibleN: number; ineligibleN: number }>;
  };
  history: { geoid2010: string; changes: Record<string, number | null> } | null;
  modelStatus: "available" | "missing" | "stale" | "invalid";
  models: IndicatorModel[];
  limitations: string[];
  construction: { year: number; units: number; units5plus: number; change: number | null } | null;
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
export function eligibilityEvidence(published: number | null, mfi: number | null, area: number | null, povertyRate: number | null): TractAnalysis["eligibility"] {
  const ratio = mfi != null && mfi >= 0 && area != null && area > 0 ? mfi / area : null;
  const incomeMet = ratio == null ? null : ratio <= INCOME_THRESHOLD;
  // Missing inputs remain untested; the official flag remains authoritative.
  const povertyMet = povertyRate != null && povertyRate < POVERTY_RATE_THRESHOLD || ratio != null && ratio > POVERTY_TEST_INCOME_CAP
    ? false : povertyRate == null || ratio == null ? null : true;
  const computed = incomeMet === true || povertyMet === true ? 1 : incomeMet === false && povertyMet === false ? 0 : null;
  const agrees = computed == null || published == null ? null : computed === published;
  let reason = computed === 0 ? "The published income and poverty inputs do not meet either 2027 eligibility route."
    : computed === 1 ? "The published inputs meet at least one 2027 eligibility route."
    : "Missing inputs prevent an independent check of both eligibility routes. Use Treasury’s published status; missing data are not a failure.";
  if (agrees === false) reason = "The input check differs from Treasury’s published status. Rounding, missing inputs, or source revisions may matter; verify the official file. This check does not replace it.";
  return { published, reason, incomeRatio: ratio, povertyRate, agreesWithPublished: agrees, checks: [
    { label: "Income route", met: incomeMet, detail: ratio == null ? "Family-income comparison unavailable." : `Median family income is ${pct(ratio)} of the comparison area; threshold: no more than 70%.` },
    { label: "Poverty route", met: povertyMet, detail: `Poverty: ${povertyRate == null ? "unavailable" : pct(povertyRate)} (at least 20% required). Family-income ratio: ${ratio == null ? "unavailable" : pct(ratio)} (no more than 125% required).` },
  ] };
}
