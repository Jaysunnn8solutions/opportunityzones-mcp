import { describe, expect, it } from "vitest";
import { EMPTY_ANSWERS, guideSteps, resolveStep, SECTIONS } from "./steps";

const ids = (a: Parameters<typeof guideSteps>[0]) => guideSteps(a).map((s) => s.id);

describe("guided check steps", () => {
  it("starts short and ends at the checklist", () => {
    const s = ids(EMPTY_ANSWERS);
    expect(s[0]).toBe("who");
    expect(s.at(-1)).toBe("checklist");
    expect(s).not.toContain("sale-date");
    expect(s).not.toContain("place-result");
  });

  it("adds the timing steps for a capital gain, and a single step for other money", () => {
    expect(ids({ ...EMPTY_ANSWERS, money: "gain" })).toEqual(expect.arrayContaining(["gain-kind", "sale-date", "gain-only", "benefits"]));
    const ordinary = ids({ ...EMPTY_ANSWERS, money: "ordinary" });
    expect(ordinary).toContain("ordinary");
    expect(ordinary).not.toContain("sale-date");
  });

  it("shows what a place is only once one was found", () => {
    expect(ids({ ...EMPTY_ANSWERS, hasPlace: true })).toContain("place-result");
  });

  it("keeps every step in a known section, in section order", () => {
    const order = SECTIONS.map((s) => s.id);
    const steps = guideSteps({ ...EMPTY_ANSWERS, money: "gain", hasPlace: true });
    const positions = steps.map((s) => order.indexOf(s.section));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((x, y) => x - y)).toEqual(positions);
  });

  it("falls back to an earlier step when an answer change removes the current one", () => {
    const steps = guideSteps({ ...EMPTY_ANSWERS, money: "ordinary" });
    expect(resolveStep(steps, "sale-date", ["who", "money", "gain-kind"]).id).toBe("money");
    expect(resolveStep(steps, "ordinary").id).toBe("ordinary");
  });
});
