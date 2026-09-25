/**
 * The statutory Opportunity Zone eligibility test for the 2027 designation
 * round, as rewritten by the One Big Beautiful Bill Act (P.L. 119-21, § 70421)
 * in IRC § 1400Z-1.
 *
 * This is the one part of the product that is not a judgement call. Either a
 * tract meets the definition or it does not, and getting it wrong would make
 * every downstream score meaningless. So it lives on its own, depends on
 * nothing, and is tested against the worked examples in the statute and IRS
 * guidance.
 *
 * Four things changed from the 2018 round, and all four are easy to get wrong
 * from memory:
 *
 *  1. The income threshold is **70 percent** of area median family income, not
 *     80. The definition is now self-contained rather than cross-referencing
 *     IRC § 45D(e).
 *  2. The comparison area is the **statewide** MFI for a non-metropolitan tract
 *     and the **metropolitan area** MFI for a metropolitan one. There is no
 *     national comparison.
 *  3. The alternative poverty test is **conjunctive**: poverty ≥ 20 percent AND
 *     MFI ≤ 125 percent of the applicable MFI. A 20 percent poverty rate alone
 *     does not qualify a tract, which it effectively did before.
 *  4. The **contiguous-tract exception is repealed**. A tract qualifies on its
 *     own or not at all, so there is deliberately no neighbour logic here.
 *
 * And one thing that is widely misreported: there is **no rural set-aside** in
 * the enacted text. § 1400Z-1(d) contains the 25 percent cap and the small-state
 * floor, and no geographic sub-allocation.
 */

/** Statutory constants, named so the arithmetic below reads as the rule does. */
export const INCOME_THRESHOLD = 0.7;
export const POVERTY_RATE_THRESHOLD = 0.2;
export const POVERTY_TEST_INCOME_CAP = 1.25;
export const STATE_CAP_SHARE = 0.25;
export const SMALL_STATE_LIC_COUNT = 100;
export const SMALL_STATE_ALLOWANCE = 25;

/**
 * "Metropolitan area" is not defined in § 1400Z-1, and the choice materially
 * changes the answer for thousands of tracts.
 *
 * Treasury's Office of Tax Analysis treated it as any Core-Based Statistical
 * Area, which lumps micropolitan areas in with metropolitan ones. Reading it as
 * Metropolitan Statistical Areas only would compare a micropolitan tract against
 * its statewide MFI instead, and statewide MFI is usually higher, so the stricter
 * reading makes more small-town tracts eligible.
 *
 * The default follows Treasury. The alternative is selectable so the difference
 * can be shown rather than asserted away.
 */
export type MetroBasis = "cbsa" | "msa-only";

export interface TractInput {
  geoid: string;
  /** Two-digit state/territory FIPS. */
  stateFips: string;
  /** Median family income, ACS B19113. Null when the estimate is suppressed. */
  mfi: number | null;
  /** Share in poverty, 0-1, from ACS S1701 or B17001. Null when unavailable. */
  povertyRate: number | null;
  /** CBSA code the tract sits in, or null if it is outside every CBSA. */
  cbsa: string | null;
  /** True when that CBSA is a Metropolitan (not Micropolitan) Statistical Area. */
  cbsaIsMetro: boolean;
  /** Total population. Used only to explain unmeasurable tracts, never to test. */
  population: number | null;
}

export interface Denominators {
  /** Statewide median family income by state FIPS. */
  stateMfi: ReadonlyMap<string, number | null>;
  /** Median family income by CBSA code. */
  cbsaMfi: ReadonlyMap<string, number | null>;
}

export type ComparisonBasis = "cbsa" | "state";

export interface ApplicableMfi {
  value: number | null;
  basis: ComparisonBasis;
  /** CBSA code or state FIPS, whichever was used. */
  areaId: string;
  /**
   * Set when the tract is in a CBSA but that CBSA has no published MFI, so the
   * statewide figure stood in. Reported rather than hidden, because it is a
   * departure from the rule as written.
   */
  fellBackToState: boolean;
}

/**
 * The MFI a tract is compared against: its metropolitan area's if it is in one,
 * otherwise its state's.
 */
export function applicableMfi(
  tract: TractInput,
  denominators: Denominators,
  metroBasis: MetroBasis = "cbsa"
): ApplicableMfi {
  const treatAsMetro =
    tract.cbsa != null && (metroBasis === "cbsa" ? true : tract.cbsaIsMetro);

  if (treatAsMetro && tract.cbsa != null) {
    const value = denominators.cbsaMfi.get(tract.cbsa) ?? null;
    if (value != null) {
      return { value, basis: "cbsa", areaId: tract.cbsa, fellBackToState: false };
    }
    return {
      value: denominators.stateMfi.get(tract.stateFips) ?? null,
      basis: "state",
      areaId: tract.stateFips,
      fellBackToState: true,
    };
  }
  return {
    value: denominators.stateMfi.get(tract.stateFips) ?? null,
    basis: "state",
    areaId: tract.stateFips,
    fellBackToState: false,
  };
}

/** Why a tract is, or is not, a low-income community. */
export type EligibilityStatus = "eligible" | "not-eligible" | "indeterminate";

export interface EligibilityResult {
  geoid: string;
  status: EligibilityStatus;
  /** Met the 70-percent income test. Null when it could not be evaluated. */
  incomeTest: boolean | null;
  /** Met poverty ≥ 20% AND MFI ≤ 125%. Null when it could not be evaluated. */
  povertyTest: boolean | null;
  /** MFI as a share of the applicable MFI, the number both tests turn on. */
  mfiRatio: number | null;
  applicable: ApplicableMfi;
  /** One sentence a person can check the verdict against. */
  reason: string;
}

/**
 * Apply § 1400Z-1(c)(1) to one tract.
 *
 * A suppressed input yields `indeterminate`, never a verdict. That distinction
 * matters more here than anywhere else in the product: roughly 1 in 50 tracts
 * has no published median family income, and treating a missing value as either
 * a pass or a fail would silently invent or destroy eligibility for well over a
 * thousand tracts nationally.
 */
export function classifyTract(
  tract: TractInput,
  denominators: Denominators,
  metroBasis: MetroBasis = "cbsa"
): EligibilityResult {
  const applicable = applicableMfi(tract, denominators, metroBasis);
  const base = { geoid: tract.geoid, applicable };

  if (applicable.value == null || applicable.value <= 0) {
    return {
      ...base,
      status: "indeterminate",
      incomeTest: null,
      povertyTest: null,
      mfiRatio: null,
      reason:
        `No published median family income for the comparison area ` +
        `(${applicable.basis === "cbsa" ? `CBSA ${applicable.areaId}` : `state ${applicable.areaId}`}), ` +
        `so neither test can be applied.`,
    };
  }

  if (tract.mfi == null) {
    // A suppressed tract MFI makes both the 70% test and the poverty prong's
    // 125% cap unevaluable on their face. The statute does not say what happens
    // then, and Treasury's answer is visible in its published file rather than in
    // any notice: of the 2,544 tracts with no published MFI, the 1,068 with a
    // poverty rate at or above 20% are all marked eligible and the 1,476 below it
    // are all marked ineligible, with no counterexample either way. So Treasury
    // treats the 125% cap as satisfied when it cannot be tested, and lets the
    // poverty rate decide alone.
    //
    // That reading is followed here because it is the one that governs real
    // designations, and because the tracts it turns on are among the poorest in
    // the country — this group runs to 81% poverty. Dropping them would be a
    // serious defect in a tool about distressed places.
    const why =
      tract.population != null && tract.population === 0
        ? "the tract has no population"
        : "the estimate is suppressed";

    if (tract.povertyRate == null) {
      return {
        ...base,
        status: "indeterminate",
        incomeTest: null,
        povertyTest: null,
        mfiRatio: null,
        reason:
          `Neither median family income (${why}) nor a poverty rate is published, ` +
          `so no test can be applied. Treasury's file lists such tracts as ` +
          `ineligible; this reports the missing inputs instead of inferring a verdict.`,
      };
    }

    const povertyQualifies = tract.povertyRate >= POVERTY_RATE_THRESHOLD;
    const pctPov = `${(tract.povertyRate * 100).toFixed(1)}%`;
    return {
      ...base,
      status: povertyQualifies ? "eligible" : "not-eligible",
      incomeTest: null,
      povertyTest: povertyQualifies,
      mfiRatio: null,
      reason: povertyQualifies
        ? `Poverty rate ${pctPov} is at or above 20%. No median family income is ` +
          `published (${why}), so the poverty test's 125% income cap cannot be ` +
          `applied; Treasury treats it as satisfied in that case.`
        : `Poverty rate ${pctPov} is below 20% and no median family income is ` +
          `published (${why}), so neither route qualifies the tract.`,
    };
  }

  const mfiRatio = tract.mfi / applicable.value;
  const incomeTest = mfiRatio <= INCOME_THRESHOLD;

  // The poverty route needs both halves; a null poverty rate leaves it unknown,
  // which only matters when the income test already failed.
  const povertyTest =
    tract.povertyRate == null
      ? null
      : tract.povertyRate >= POVERTY_RATE_THRESHOLD && mfiRatio <= POVERTY_TEST_INCOME_CAP;

  const areaLabel =
    applicable.basis === "cbsa" ? `CBSA ${applicable.areaId}` : `state ${applicable.areaId}`;
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

  if (incomeTest) {
    return {
      ...base,
      status: "eligible",
      incomeTest: true,
      povertyTest,
      mfiRatio,
      reason:
        `Median family income is ${pct(mfiRatio)} of the ${areaLabel} figure, ` +
        `at or under the 70% threshold.`,
    };
  }

  if (povertyTest) {
    return {
      ...base,
      status: "eligible",
      incomeTest: false,
      povertyTest: true,
      mfiRatio,
      reason:
        `Poverty rate ${pct(tract.povertyRate!)} is at or above 20% and median ` +
        `family income is ${pct(mfiRatio)} of the ${areaLabel} figure, within the ` +
        `125% cap the poverty test also requires.`,
    };
  }

  if (povertyTest === null) {
    return {
      ...base,
      status: "indeterminate",
      incomeTest: false,
      povertyTest: null,
      mfiRatio,
      reason:
        `Median family income is ${pct(mfiRatio)} of the ${areaLabel} figure, above ` +
        `the 70% threshold, and no poverty rate is published to test the ` +
        `alternative route.`,
    };
  }

  const shortfall =
    tract.povertyRate! < POVERTY_RATE_THRESHOLD
      ? `poverty rate ${pct(tract.povertyRate!)} is below 20%`
      : `median family income ${pct(mfiRatio)} exceeds the 125% cap the poverty test requires`;
  return {
    ...base,
    status: "not-eligible",
    incomeTest: false,
    povertyTest: false,
    mfiRatio,
    reason:
      `Median family income is ${pct(mfiRatio)} of the ${areaLabel} figure, above the ` +
      `70% threshold, and the alternative poverty route fails because ${shortfall}.`,
  };
}

/**
 * How many tracts a jurisdiction may designate, per § 1400Z-1(d).
 *
 * 25 percent of its low-income communities, rounded up. A jurisdiction with
 * fewer than 100 may designate 25 — or all of them, if it has fewer than 25,
 * since it cannot designate tracts that do not qualify.
 *
 * The rounding is up, not to nearest: the IRS example is 197 LICs yielding 50
 * designations, where rounding to nearest would give 49.
 */
export function stateCap(licCount: number): number {
  if (!Number.isInteger(licCount) || licCount < 0) {
    throw new Error(`LIC count must be a non-negative integer, got ${licCount}`);
  }
  if (licCount === 0) return 0;
  if (licCount < SMALL_STATE_LIC_COUNT) return Math.min(SMALL_STATE_ALLOWANCE, licCount);
  return Math.ceil(licCount * STATE_CAP_SHARE);
}

export interface JurisdictionSummary {
  stateFips: string
  /** Tracts evaluated. */
  tracts: number;
  eligible: number;
  notEligible: number;
  indeterminate: number;
  /** Designations permitted under § 1400Z-1(d). */
  cap: number;
  /** Cap as a share of eligible tracts, i.e. how selective the state must be. */
  capShareOfEligible: number | null;
  /** True when the small-state floor rather than the 25 percent rule applied. */
  smallStateFloorApplied: boolean;
}

/** Roll per-tract verdicts up into the per-jurisdiction picture and its cap. */
export function summarizeByJurisdiction(
  results: readonly EligibilityResult[],
  stateOf: (geoid: string) => string
): Map<string, JurisdictionSummary> {
  const out = new Map<string, JurisdictionSummary>();
  for (const r of results) {
    const fips = stateOf(r.geoid);
    let s = out.get(fips);
    if (!s) {
      s = {
        stateFips: fips,
        tracts: 0,
        eligible: 0,
        notEligible: 0,
        indeterminate: 0,
        cap: 0,
        capShareOfEligible: null,
        smallStateFloorApplied: false,
      };
      out.set(fips, s);
    }
    s.tracts++;
    if (r.status === "eligible") s.eligible++;
    else if (r.status === "not-eligible") s.notEligible++;
    else s.indeterminate++;
  }
  for (const s of out.values()) {
    s.cap = stateCap(s.eligible);
    s.smallStateFloorApplied = s.eligible > 0 && s.eligible < SMALL_STATE_LIC_COUNT;
    s.capShareOfEligible = s.eligible > 0 ? s.cap / s.eligible : null;
  }
  return out;
}
