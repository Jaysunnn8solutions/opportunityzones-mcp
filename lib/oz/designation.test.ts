import { describe, expect, it } from "vitest";
import { designationOutlook } from "./designation";

describe("designationOutlook", () => {
  it("says pending, never 'not designated', for an eligible tract, with the state's cap", () => {
    const o = designationOutlook(1, "Georgia", 942);
    expect(o).toMatchObject({ status: "pending", stateEligible: 942, stateCap: 236 });
    expect(o.text).toContain("Georgia may designate up to 236 of its 942 eligible tracts");
    expect(o.text).toContain("not yet published");
    expect(o.text).not.toMatch(/not designated/i);
  });

  it("applies the small-state allowance", () => {
    expect(designationOutlook(1, "Delaware", 60).stateCap).toBe(25);
    expect(designationOutlook(1, "Guam", 12).stateCap).toBe(12);
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
