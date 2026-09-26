import { describe, expect, it } from "vitest";
import { liftOf, percentileAmong, residualsWithGroupEffects, solve } from "./lift";

describe("lift arithmetic", () => {
  it("solves a small linear system", () => {
    const x = solve([[2, 1], [1, 3]], [5, 10]);
    expect(x[0]).toBeCloseTo(1);
    expect(x[1]).toBeCloseTo(3);
  });

  it("removes state levels and the slope fitted on controls", () => {
    // y = 2x + state effect; controls fit it exactly, so their residuals are 0.
    const obs = [];
    for (let i = 0; i < 30; i++) {
      obs.push({ group: "A", x: [i], y: 2 * i + 10, control: true });
      obs.push({ group: "B", x: [i], y: 2 * i - 5, control: true });
    }
    // A designated tract in B that did 3 better than its peers.
    obs.push({ group: "B", x: [7], y: 2 * 7 - 5 + 3, control: false });
    // A state with too few controls is left out.
    obs.push({ group: "C", x: [1], y: 1, control: false });
    const r = residualsWithGroupEffects(obs);
    expect(Math.abs(r[0])).toBeLessThan(1e-6);
    expect(r[60]).toBeCloseTo(3);
    expect(Number.isNaN(r[61])).toBe(true);
  });

  it("gives a difference in means with a Welch interval", () => {
    const l = liftOf([1, 2, 3, 4], [0, 1, 0, 1])!;
    expect(l.estimate).toBeCloseTo(2);
    expect(l.low).toBeLessThan(l.estimate);
    expect(l.high).toBeGreaterThan(l.estimate);
    expect(liftOf([1], [0, 1])).toBeNull();
  });

  it("ranks a value among sorted values", () => {
    expect(percentileAmong([1, 2, 3, 4], 2.5)).toBe(50);
    expect(percentileAmong([1, 2, 2, 3], 2)).toBe(50);
  });
});
