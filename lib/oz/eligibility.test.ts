import { describe, expect, it } from "vitest";
import {
  applicableMfi,
  classifyTract,
  stateCap,
  summarizeByJurisdiction,
  type Denominators,
  type TractInput,
} from "./eligibility";

const DENOM: Denominators = {
  // Georgia statewide MFI, and Atlanta's CBSA figure, roughly to scale.
  stateMfi: new Map([
    ["13", 100_000],
    ["48", 90_000],
    ["02", null], // a jurisdiction with no published statewide figure
  ]),
  cbsaMfi: new Map([
    ["12060", 120_000], // Atlanta-Sandy Springs-Alpharetta, metropolitan
    ["10500", 60_000], // a micropolitan area
    ["99999", null], // in a CBSA, but no published MFI
  ]),
};

function tract(over: Partial<TractInput> = {}): TractInput {
  return {
    geoid: "13121001100",
    stateFips: "13",
    mfi: 50_000,
    povertyRate: 0.1,
    cbsa: "12060",
    cbsaIsMetro: true,
    population: 3000,
    ...over,
  };
}

describe("applicableMfi", () => {
  it("compares a metropolitan tract against its CBSA", () => {
    const a = applicableMfi(tract(), DENOM);
    expect(a.basis).toBe("cbsa");
    expect(a.value).toBe(120_000);
    expect(a.fellBackToState).toBe(false);
  });

  it("compares a tract outside every CBSA against its state", () => {
    const a = applicableMfi(tract({ cbsa: null, cbsaIsMetro: false }), DENOM);
    expect(a.basis).toBe("state");
    expect(a.value).toBe(100_000);
  });

  it("never uses a national figure", () => {
    // The amended definition dropped the national comparison the 2018 round's
    // 45D(e) cross-reference allowed. Both branches must be area-based.
    for (const t of [tract(), tract({ cbsa: null })]) {
      expect(["cbsa", "state"]).toContain(applicableMfi(t, DENOM).basis);
    }
  });

  it("treats a micropolitan tract as metropolitan under the CBSA reading", () => {
    const a = applicableMfi(tract({ cbsa: "10500", cbsaIsMetro: false }), DENOM);
    expect(a.basis).toBe("cbsa");
    expect(a.value).toBe(60_000);
  });

  it("compares the same micropolitan tract against its state under msa-only", () => {
    // The two readings genuinely disagree, which is why the basis is selectable.
    const a = applicableMfi(tract({ cbsa: "10500", cbsaIsMetro: false }), DENOM, "msa-only");
    expect(a.basis).toBe("state");
    expect(a.value).toBe(100_000);
  });

  it("falls back to the state when the CBSA has no published MFI, and says so", () => {
    const a = applicableMfi(tract({ cbsa: "99999" }), DENOM);
    expect(a.basis).toBe("state");
    expect(a.fellBackToState).toBe(true);
  });
});

describe("the 70 percent income test", () => {
  it("qualifies a tract at exactly 70 percent", () => {
    // "does not exceed" is inclusive.
    const r = classifyTract(tract({ mfi: 84_000 }), DENOM); // 84,000 / 120,000
    expect(r.mfiRatio).toBeCloseTo(0.7, 10);
    expect(r.incomeTest).toBe(true);
    expect(r.status).toBe("eligible");
  });

  it("fails a tract just above 70 percent when poverty is low", () => {
    const r = classifyTract(tract({ mfi: 84_001, povertyRate: 0.1 }), DENOM);
    expect(r.incomeTest).toBe(false);
    expect(r.status).toBe("not-eligible");
  });

  it("uses 70 percent, not the old 80", () => {
    // 80% of 120,000 is 96,000. Under the 2018 rule this tract qualified; under
    // the amended rule it does not. A test that still passed here would mean the
    // old threshold had been left in place.
    const r = classifyTract(tract({ mfi: 90_000, povertyRate: 0.05 }), DENOM);
    expect(r.status).toBe("not-eligible");
  });
});

describe("the alternative poverty test", () => {
  it("qualifies on poverty >= 20% when income is within the 125% cap", () => {
    const r = classifyTract(tract({ mfi: 100_000, povertyRate: 0.25 }), DENOM);
    expect(r.incomeTest).toBe(false);
    expect(r.povertyTest).toBe(true);
    expect(r.status).toBe("eligible");
  });

  it("requires BOTH halves — 20% poverty alone is not enough", () => {
    // The conjunctive cap is the change most likely to be missed. MFI here is
    // 150% of the CBSA figure, so a high poverty rate must not qualify it.
    const r = classifyTract(tract({ mfi: 180_000, povertyRate: 0.35 }), DENOM);
    expect(r.povertyTest).toBe(false);
    expect(r.status).toBe("not-eligible");
    expect(r.reason).toMatch(/125% cap/);
  });

  it("accepts exactly 20 percent poverty and exactly the 125 percent cap", () => {
    const r = classifyTract(tract({ mfi: 150_000, povertyRate: 0.2 }), DENOM);
    expect(r.mfiRatio).toBeCloseTo(1.25, 10);
    expect(r.status).toBe("eligible");
  });

  it("explains which half failed", () => {
    const lowPoverty = classifyTract(tract({ mfi: 100_000, povertyRate: 0.15 }), DENOM);
    expect(lowPoverty.reason).toMatch(/below 20%/);
  });
});

describe("repealed and non-existent rules", () => {
  it("has no contiguous-tract pathway", () => {
    // classifyTract takes one tract and no neighbors, by design. A tract that
    // fails on its own cannot be rescued by an adjacent eligible one.
    const r = classifyTract(tract({ mfi: 200_000, povertyRate: 0.01 }), DENOM);
    expect(r.status).toBe("not-eligible");
    expect(classifyTract.length).toBeLessThanOrEqual(3);
  });

  it("applies no rural set-aside or bonus to the cap", () => {
    // The enacted text has no geographic sub-allocation, so the cap is a pure
    // function of the LIC count.
    expect(stateCap(400)).toBe(100);
  });
});

describe("a suppressed tract MFI lets poverty decide alone", () => {
  // Verified against Treasury's published file: of 2,544 tracts with no MFI, all
  // 1,068 at or above 20% poverty are eligible and all 1,476 below are not, with
  // no counterexample. Treasury treats the poverty prong's 125% cap as satisfied
  // when it cannot be tested. These tracts run to 81% poverty, so treating them
  // as unknown would drop the most distressed places in the country.
  it("qualifies a high-poverty tract with no published income", () => {
    const r = classifyTract(tract({ mfi: null, povertyRate: 0.4 }), DENOM);
    expect(r.status).toBe("eligible");
    expect(r.incomeTest).toBeNull();
    expect(r.povertyTest).toBe(true);
    expect(r.reason).toMatch(/cannot be applied/);
  });

  it("rejects a low-poverty tract with no published income", () => {
    const r = classifyTract(tract({ mfi: null, povertyRate: 0.1 }), DENOM);
    expect(r.status).toBe("not-eligible");
    expect(r.povertyTest).toBe(false);
  });

  it("treats exactly 20 percent as qualifying", () => {
    expect(classifyTract(tract({ mfi: null, povertyRate: 0.2 }), DENOM).status).toBe("eligible");
  });

  it("is indeterminate only when BOTH inputs are missing", () => {
    const r = classifyTract(tract({ mfi: null, povertyRate: null }), DENOM);
    expect(r.status).toBe("indeterminate");
    expect(r.incomeTest).toBeNull();
    expect(r.povertyTest).toBeNull();
  });

  it("says so when a tract has no population", () => {
    const r = classifyTract(tract({ mfi: null, povertyRate: null, population: 0 }), DENOM);
    expect(r.status).toBe("indeterminate");
    expect(r.reason).toMatch(/no population/);
  });

  it("is indeterminate, not ineligible, when only the poverty rate is missing and income failed", () => {
    const r = classifyTract(tract({ mfi: 100_000, povertyRate: null }), DENOM);
    expect(r.incomeTest).toBe(false);
    expect(r.status).toBe("indeterminate");
  });

  it("is still eligible when income passes and poverty is missing", () => {
    // The poverty route is irrelevant once the income test is met.
    const r = classifyTract(tract({ mfi: 50_000, povertyRate: null }), DENOM);
    expect(r.status).toBe("eligible");
  });

  it("is indeterminate when the comparison area has no published MFI", () => {
    const r = classifyTract(tract({ stateFips: "02", cbsa: null }), DENOM);
    expect(r.status).toBe("indeterminate");
    expect(r.reason).toMatch(/comparison area/);
  });
});

describe("stateCap", () => {
  it("matches the IRS worked example: 197 LICs allow 50 designations", () => {
    // Rounding up, not to nearest — to nearest would give 49.
    expect(stateCap(197)).toBe(50);
  });

  it("rounds up on any remainder", () => {
    expect(stateCap(400)).toBe(100); // exact quarter
    expect(stateCap(401)).toBe(101);
    expect(stateCap(402)).toBe(101);
    expect(stateCap(403)).toBe(101);
    expect(stateCap(404)).toBe(101);
  });

  it("gives a jurisdiction with 25-99 LICs a flat 25", () => {
    expect(stateCap(99)).toBe(25);
    expect(stateCap(40)).toBe(25);
    expect(stateCap(25)).toBe(25);
  });

  it("never allows more designations than there are eligible tracts", () => {
    expect(stateCap(10)).toBe(10);
    expect(stateCap(1)).toBe(1);
    expect(stateCap(0)).toBe(0);
  });

  it("switches to the percentage rule at exactly 100", () => {
    // The floor is "fewer than 100", so 100 is governed by the 25% rule — which
    // happens to also be 25, making this the one place the boundary is invisible
    // in the output and worth pinning.
    expect(stateCap(100)).toBe(25);
    expect(stateCap(104)).toBe(26);
  });

  it("rejects nonsense input rather than returning a plausible number", () => {
    expect(() => stateCap(-1)).toThrow();
    expect(() => stateCap(1.5)).toThrow();
  });
});

describe("summarizeByJurisdiction", () => {
  const stateOf = (geoid: string) => geoid.slice(0, 2);

  it("counts each status and derives the cap from eligible tracts only", () => {
    const results = [
      classifyTract(tract({ geoid: "13121000100", mfi: 50_000 }), DENOM),
      classifyTract(tract({ geoid: "13121000200", mfi: 60_000 }), DENOM),
      classifyTract(tract({ geoid: "13121000300", mfi: 200_000, povertyRate: 0.01 }), DENOM),
      // Both inputs suppressed, which is the only genuinely indeterminate case.
      classifyTract(tract({ geoid: "13121000400", mfi: null, povertyRate: null }), DENOM),
    ];
    const summary = summarizeByJurisdiction(results, stateOf);
    const ga = summary.get("13")!;
    expect(ga.tracts).toBe(4);
    expect(ga.eligible).toBe(2);
    expect(ga.notEligible).toBe(1);
    expect(ga.indeterminate).toBe(1);
    // Two eligible tracts, below the small-state floor, so both may be designated.
    expect(ga.cap).toBe(2);
    expect(ga.smallStateFloorApplied).toBe(true);
  });

  it("reports how selective a state has to be", () => {
    const results = Array.from({ length: 200 }, (_, i) =>
      classifyTract(
        tract({ geoid: `48001${String(i).padStart(6, "0")}`, stateFips: "48", cbsa: null, mfi: 50_000 }),
        DENOM
      )
    );
    const tx = summarizeByJurisdiction(results, stateOf).get("48")!;
    expect(tx.eligible).toBe(200);
    expect(tx.cap).toBe(50);
    expect(tx.capShareOfEligible).toBeCloseTo(0.25, 10);
    expect(tx.smallStateFloorApplied).toBe(false);
  });

  it("leaves the cap share null when nothing is eligible", () => {
    const results = [classifyTract(tract({ geoid: "13121000300", mfi: null }), DENOM)];
    expect(summarizeByJurisdiction(results, stateOf).get("13")!.capShareOfEligible).toBeNull();
  });
});
