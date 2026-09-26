import { describe, expect, it } from "vitest";
import { designationOutlook } from "./designation";

describe("designationOutlook", () => {
  it("says pending, never 'not designated', for an eligible tract before its state's list is out", () => {
    const o = designationOutlook(1, "Georgia", 942);
    expect(o).toMatchObject({ status: "pending", stateEligible: 942, stateCap: 236, certifiedOn: null });
    expect(o.text).toContain("Georgia may designate up to 236 of its 942 eligible tracts");
    expect(o.text).toContain("not yet published");
    expect(o.text).not.toMatch(/not designated/i);
  });

  it("applies the small-state allowance", () => {
    expect(designationOutlook(1, "Delaware", 60).stateCap).toBe(25);
    expect(designationOutlook(1, "Guam", 12).stateCap).toBe(12);
  });

  it("reports a designated tract with its certification date", () => {
    const o = designationOutlook(1, "Georgia", 942, 1, "2026-11-15");
    expect(o.status).toBe("designated");
    expect(o.text).toContain("Designated 2027 Opportunity Zone (certified November 15, 2026)");
  });

  it("says 'not designated' only once the state's list is certified", () => {
    const o = designationOutlook(1, "Georgia", 942, 0, "2026-11-15");
    expect(o.status).toBe("not-designated");
    expect(o.text).toContain("Georgia's 2027 list (certified November 15, 2026) does not include it");
  });

  it("keeps, and flags, a designated tract missing from the eligible list", () => {
    const o = designationOutlook(0, "Georgia", 942, 1, "2026-11-15");
    expect(o.status).toBe("designated");
    expect(o.text).toMatch(/eligible list does not include/);
  });

  it("says an ineligible tract is out of the round, because the contiguous exception is gone", () => {
    const o = designationOutlook(0, "Georgia", 942);
    expect(o.status).toBe("not-eligible");
    expect(o.text).toMatch(/repealed/);
  });

  it("does not guess when eligibility is missing", () => {
    expect(designationOutlook(null, "Georgia", 942).status).toBe("unknown");
  });
});
