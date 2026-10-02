import { describe, expect, it } from "vitest";
import { eligibilityEvidence, timingLabel } from "./indicators";

describe("eligibility evidence stays separate from model inference", () => {
  it("checks both routes, including inclusive thresholds", () => {
    expect(eligibilityEvidence(1, 70000, 100000, .1).checks.map((c) => c.met)).toEqual([true, false]);
    expect(eligibilityEvidence(1, 125000, 100000, .2).checks.map((c) => c.met)).toEqual([false, true]);
    expect(eligibilityEvidence(0, 125001, 100000, .4).checks.map((c) => c.met)).toEqual([false, false]);
    expect(eligibilityEvidence(0, 71000, 100000, .19).agreesWithPublished).toBe(true);
  });
  it("does not invent missing family income or replace an official flag", () => {
    const missing = eligibilityEvidence(1, null, 100000, .3);
    expect(missing.checks.map((c) => c.met)).toEqual([null, null]);
    expect(missing.published).toBe(1);
    expect(missing.agreesWithPublished).toBeNull();
    const mismatch = eligibilityEvidence(0, 60000, 100000, .1);
    expect(mismatch.agreesWithPublished).toBe(false);
    expect(mismatch.reason).toContain("differs from Treasury");
    expect(mismatch.published).toBe(0);
  });
});

describe("timing evidence gates", () => {
  const good = { temporalValidation: true, releaseVintageValidation: true, comparableGeography: true, independentPeriods: 3, skill: .1, lagYears: [1, 2] };
  it("labels timing relative to an outcome only after evidence gates", () => {
    expect(timingLabel(good)).toBe("potential-leading");
    expect(timingLabel({ ...good, lagYears: [-1, -2] })).toBe("lagging");
    expect(timingLabel({ ...good, lagYears: [0] })).toBe("concurrent");
    expect(timingLabel({ ...good, lagYears: [-1, 2] })).toBe("mixed");
  });
  it("cannot turn geographic model importance or a single transition into a timing claim", () => {
    for (const change of [{ temporalValidation: false }, { releaseVintageValidation: false }, { comparableGeography: false }, { independentPeriods: 1 }, { skill: -.1 }, { skill: NaN }, { lagYears: [] }, { lagYears: [NaN] }]) {
      expect(timingLabel({ ...good, ...change })).toBe("insufficient-evidence");
    }
  });
});
