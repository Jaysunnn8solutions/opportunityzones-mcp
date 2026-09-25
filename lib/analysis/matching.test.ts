import { describe, expect, it } from "vitest";
import { balance, estimateEffect, fitOls, nearestNeighbourMatch, type Unit } from "./matching";

const u = (
  id: string,
  treated: boolean,
  covariates: Array<number | null>,
  stratum = "GA",
  cluster = "c1"
): Unit => ({ id, treated, stratum, cluster, covariates });

describe("nearestNeighbourMatch", () => {
  const units = [
    u("T1", true, [0, 0]),
    u("T2", true, [10, 10]),
    u("C_near1", false, [0.1, 0]),
    u("C_near2", false, [10, 10.2]),
    u("C_far", false, [5, 5]),
    u("C_other_state", false, [0, 0], "AL"),
  ];

  it("picks the closest control in the same stratum", () => {
    const r = nearestNeighbourMatch(units, { k: 1 });
    const m = new Map(r.matches.map((x) => [x.treated, x.controls]));
    expect(m.get("T1")).toEqual(["C_near1"]);
    expect(m.get("T2")).toEqual(["C_near2"]);
  });

  it("never matches across strata even when a cross-stratum unit is identical", () => {
    // C_other_state is a perfect covariate match for T1 but sits in another
    // state; governors choose within their own state, so it is not comparable.
    const r = nearestNeighbourMatch(units, { k: 3 });
    for (const m of r.matches) expect(m.controls).not.toContain("C_other_state");
  });

  it("returns k controls, ordered by distance", () => {
    const r = nearestNeighbourMatch(units, { k: 2 });
    const t1 = r.matches.find((x) => x.treated === "T1")!;
    expect(t1.controls).toEqual(["C_near1", "C_far"]);
    expect(t1.distances[0]).toBeLessThan(t1.distances[1]);
  });

  it("reuses a control for several treated units (with replacement)", () => {
    const r = nearestNeighbourMatch([u("T1", true, [0]), u("T2", true, [0.01]), u("C", false, [0])], { k: 1 });
    expect(r.matches.map((m) => m.controls[0])).toEqual(["C", "C"]);
  });

  it("drops treated units whose closest control is beyond the caliper, and says why", () => {
    const r = nearestNeighbourMatch([u("T1", true, [0]), u("C", false, [100]), u("C2", false, [101])], {
      k: 1,
      caliper: 0.1,
    });
    expect(r.matches).toHaveLength(0);
    expect(r.unmatched).toEqual([{ id: "T1", reason: "caliper" }]);
  });

  it("reports missing covariates and empty strata rather than guessing", () => {
    const r = nearestNeighbourMatch(
      [u("T_missing", true, [null, 1]), u("T_alone", true, [1, 1], "PR"), u("C", false, [1, 1])],
      { k: 1 }
    );
    expect(r.unmatched).toEqual(
      expect.arrayContaining([
        { id: "T_missing", reason: "missing-covariates" },
        { id: "T_alone", reason: "no-controls-in-stratum" },
      ])
    );
  });

  it("standardises covariates so a dollar-scale variable does not swamp a rate", () => {
    // Without scaling, the income column (tens of thousands) would decide every
    // match and the poverty column (0-1) would be ignored.
    const units2 = [
      u("T", true, [50_000, 0.4]),
      u("C_same_poverty", false, [51_000, 0.4]),
      u("C_same_income", false, [50_000, 0.05]),
      u("C_spread1", false, [30_000, 0.2]),
      u("C_spread2", false, [70_000, 0.3]),
    ];
    const r = nearestNeighbourMatch(units2, { k: 1 });
    expect(r.matches[0].controls).toEqual(["C_same_poverty"]);
  });
});

describe("balance", () => {
  it("shows matching closing the gap in a covariate", () => {
    const units = [
      u("T1", true, [1]),
      u("T2", true, [1.2]),
      u("Cm1", false, [1.1]),
      u("Cm2", false, [1.15]),
      u("Cfar1", false, [5]),
      u("Cfar2", false, [6]),
    ];
    const r = nearestNeighbourMatch(units, { k: 1 });
    const [row] = balance(units, r, ["x"]);
    expect(Math.abs(row.smdAfter)).toBeLessThan(Math.abs(row.smdBefore));
    expect(Math.abs(row.smdAfter)).toBeLessThan(0.1);
  });
});

describe("estimateEffect", () => {
  const units = [
    u("T1", true, [0], "GA", "A"),
    u("T2", true, [1], "GA", "B"),
    u("C1", false, [0], "GA", "A"),
    u("C2", false, [1], "GA", "B"),
    u("C3", false, [9], "GA", "B"),
  ];
  const r = nearestNeighbourMatch(units, { k: 1 });

  it("averages treated-minus-matched-control differences", () => {
    const y = new Map<string, number | null>([
      ["T1", 0.3],
      ["T2", 0.5],
      ["C1", 0.1],
      ["C2", 0.2],
      ["C3", 5],
    ]);
    const e = estimateEffect(units, r, "y", y, { reps: 200 })!;
    // (0.3-0.1 + 0.5-0.2) / 2 = 0.25; C3 is unmatched and must not count.
    expect(e.att).toBeCloseTo(0.25, 12);
    expect(e.n).toBe(2);
    expect(e.meanTreated).toBeCloseTo(0.4, 12);
  });

  it("contrasts the matched estimate with the raw difference", () => {
    const y = new Map<string, number | null>([
      ["T1", 0.3],
      ["T2", 0.5],
      ["C1", 0.1],
      ["C2", 0.2],
      ["C3", 5],
    ]);
    const e = estimateEffect(units, r, "y", y, { reps: 200 })!;
    // Raw: mean(0.3,0.5) - mean(0.1,0.2,5) = 0.4 - 1.7667
    expect(e.rawDifference).toBeCloseTo(0.4 - 5.3 / 3, 10);
  });

  it("skips a treated unit whose outcome or controls are missing", () => {
    const y = new Map<string, number | null>([
      ["T1", null],
      ["T2", 0.5],
      ["C2", 0.2],
    ]);
    const e = estimateEffect(units, r, "y", y, { reps: 50 })!;
    expect(e.n).toBe(1);
    expect(e.att).toBeCloseTo(0.3, 12);
  });

  it("gives the same interval on every run", () => {
    const y = new Map<string, number | null>([
      ["T1", 0.3],
      ["T2", 0.5],
      ["C1", 0.1],
      ["C2", 0.2],
    ]);
    const a = estimateEffect(units, r, "y", y, { reps: 300 })!;
    const b = estimateEffect(units, r, "y", y, { reps: 300 })!;
    expect([a.ciLow, a.ciHigh]).toEqual([b.ciLow, b.ciHigh]);
    expect(a.ciLow).toBeLessThanOrEqual(a.att);
    expect(a.ciHigh).toBeGreaterThanOrEqual(a.att);
  });

  it("returns null when no treated unit has the outcome", () => {
    expect(estimateEffect(units, r, "y", new Map(), { reps: 10 })).toBeNull();
  });
});

describe("fitOls", () => {
  it("recovers an exact linear relationship", () => {
    const X = [[0], [1], [2], [3], [4]];
    const y = X.map(([x]) => 3 + 2 * x);
    const [a, b] = fitOls(X, y);
    expect(a).toBeCloseTo(3, 6);
    expect(b).toBeCloseTo(2, 6);
  });

  it("handles several covariates", () => {
    const X = [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
      [2, 1],
      [1, 3],
    ];
    const y = X.map(([p, q]) => 1 + 0.5 * p - 2 * q);
    const beta = fitOls(X, y);
    expect(beta[0]).toBeCloseTo(1, 6);
    expect(beta[1]).toBeCloseTo(0.5, 6);
    expect(beta[2]).toBeCloseTo(-2, 6);
  });
});

describe("weighted OLS", () => {
  it("weights rows, so a heavily weighted point pulls the fit", () => {
    const X = [[0], [1], [2]];
    const y = [0, 1, 10];
    const flat = fitOls(X, y);
    const heavy = fitOls(X, y, [1, 1, 100]);
    // Weighting the outlier makes the line pass much closer to it.
    const at2 = (b: number[]) => b[0] + b[1] * 2;
    expect(Math.abs(at2(heavy) - 10)).toBeLessThan(Math.abs(at2(flat) - 10));
  });
});

describe("outcome models for bias correction", () => {
  // y = x^2 exactly, no treatment effect. Treated at x=2, only matchable
  // controls at x=1. A linear correction extrapolates badly; the quadratic one
  // recovers zero.
  const units: Unit[] = [
    u("T", true, [2]),
    u("Cnear", false, [1]),
    ...Array.from({ length: 40 }, (_, i) => u(`C${i}`, false, [-2 + i * 0.1])),
  ];
  const y = new Map<string, number | null>(units.map((x) => [x.id, (x.covariates[0] as number) ** 2]));
  const res = nearestNeighbourMatch(
    units.filter((x) => x.treated || x.id === "Cnear"),
    { k: 1 }
  );

  it("lets a quadratic model remove curvature a linear one cannot", () => {
    const lin = estimateEffect(units, res, "y", y, { reps: 20, biasCorrect: "linear" })!;
    const quad = estimateEffect(units, res, "y", y, { reps: 20, biasCorrect: "quadratic" })!;
    expect(Math.abs(quad.att)).toBeLessThan(1e-6);
    expect(Math.abs(lin.att)).toBeGreaterThan(0.5);
  });

  it("treats true as the linear model", () => {
    const a = estimateEffect(units, res, "y", y, { reps: 20, biasCorrect: true })!;
    const b = estimateEffect(units, res, "y", y, { reps: 20, biasCorrect: "linear" })!;
    expect(a.att).toBeCloseTo(b.att, 12);
  });

  it("estimates within-state slopes that ignore a between-state level shift", () => {
    // Within each state y = x, but state B sits 10 higher and at higher x. A
    // pooled regression mistakes the level shift for a steeper slope; the
    // within-state model does not.
    const us: Unit[] = [];
    const ys = new Map<string, number | null>();
    for (let i = 0; i < 20; i++) {
      us.push(u(`A${i}`, false, [i * 0.1], "A"));
      ys.set(`A${i}`, i * 0.1);
      us.push(u(`B${i}`, false, [3 + i * 0.1], "B"));
      ys.set(`B${i}`, 3 + i * 0.1 + 10);
    }
    us.push(u("T", true, [1.5], "A"));
    ys.set("T", 1.5);
    const r = nearestNeighbourMatch(us.filter((x) => x.treated || x.id === "A0"), { k: 1 });
    const st = estimateEffect(us, r, "y", ys, { reps: 20, biasCorrect: "state" })!;
    expect(Math.abs(st.att)).toBeLessThan(1e-6);
  });
});

describe("bias-corrected estimate", () => {
  it("removes the part of a difference that a leftover covariate gap explains", () => {
    // The outcome depends only on x (y = x) and there is NO treatment effect.
    // Treated units sit at x=1; the only controls in reach sit at x=0 and x=0.2,
    // so a plain matched difference shows a spurious gap. Bias correction, fit
    // on controls spread along x, should bring it back to about zero.
    const units: Unit[] = [
      u("T1", true, [1]),
      u("T2", true, [1]),
      ...Array.from({ length: 30 }, (_, i) => u(`C${i}`, false, [i < 2 ? i * 0.2 : -3 + i * 0.1])),
    ];
    const y = new Map<string, number | null>(units.map((x) => [x.id, x.covariates[0] as number]));
    const res = nearestNeighbourMatch(units.filter((x) => x.treated || x.id === "C0" || x.id === "C1"), { k: 2 });
    const plain = estimateEffect(units, res, "y", y, { reps: 50 })!;
    const corrected = estimateEffect(units, res, "y", y, { reps: 50, biasCorrect: true })!;
    expect(plain.att).toBeGreaterThan(0.5);
    expect(Math.abs(corrected.att)).toBeLessThan(1e-6);
  });
});
