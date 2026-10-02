/**
 * First-pass treated-versus-control comparison for OZ 1.0: nearest-neighbor
 * matching within a stratum, balance diagnostics, and an average effect on the
 * treated with a clustered bootstrap interval.
 *
 * Deliberately classical and inspectable. Every designated tract is compared
 * with the k eligible-but-not-designated tracts in the same state that looked
 * most like it before designation — same levels, same pre-trends — so what is
 * left over is closer to "what designation came with" than a raw comparison of
 * zones against everything else. It is still not proof of causation: governors
 * chose tracts for reasons the data does not record (Glancy et al. 2026 put
 * two-thirds of the apparent construction effect down to selection), and the
 * report says so.
 *
 * Matching is with replacement, on covariates standardized by their pooled
 * standard deviation, i.e. a diagonal Mahalanobis distance.
 */

export interface Unit {
  id: string;
  treated: boolean;
  /** Units only match within the same stratum, e.g. the state. */
  stratum: string;
  /** Resampling unit for the bootstrap, e.g. the county. */
  cluster: string;
  /** Pre-designation covariates; a unit with any null is not matchable. */
  covariates: ReadonlyArray<number | null>;
}

export interface MatchOptions {
  k: number;
  /** Maximum standardized distance per covariate, averaged (RMS). Optional. */
  caliper?: number;
}

export interface Match {
  treated: string;
  controls: string[];
  distances: number[];
}

export interface MatchResult {
  matches: Match[];
  /** Treated units that could not be matched, and why. */
  unmatched: Array<{ id: string; reason: "missing-covariates" | "no-controls-in-stratum" | "caliper" }>;
  /** Pooled SD used for standardization, per covariate. */
  scale: number[];
  covariateCount: number;
}

function complete(u: Unit): u is Unit & { covariates: number[] } {
  return u.covariates.every((c) => c != null && Number.isFinite(c));
}

function sd(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  const v = values.reduce((a, b) => a + (b - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(v);
}

export function nearestNeighbourMatch(units: readonly Unit[], opts: MatchOptions): MatchResult {
  if (opts.k < 1 || !Number.isInteger(opts.k)) throw new Error("k must be a positive integer");
  const p = units[0]?.covariates.length ?? 0;
  for (const u of units) {
    if (u.covariates.length !== p) throw new Error(`Unit ${u.id} has ${u.covariates.length} covariates, expected ${p}`);
  }

  const usable = units.filter(complete);
  // Pooled SD across treated and controls, so both groups sit on one scale.
  const scale = Array.from({ length: p }, (_, j) => {
    const s = sd(usable.map((u) => u.covariates[j]));
    return s > 0 ? s : 1;
  });

  const controlsByStratum = new Map<string, Array<Unit & { covariates: number[] }>>();
  for (const u of usable) {
    if (u.treated) continue;
    const list = controlsByStratum.get(u.stratum);
    if (list) list.push(u);
    else controlsByStratum.set(u.stratum, [u]);
  }

  const matches: Match[] = [];
  const unmatched: MatchResult["unmatched"] = [];
  for (const t of units) {
    if (!t.treated) continue;
    if (!complete(t)) {
      unmatched.push({ id: t.id, reason: "missing-covariates" });
      continue;
    }
    const pool = controlsByStratum.get(t.stratum);
    if (!pool || pool.length === 0) {
      unmatched.push({ id: t.id, reason: "no-controls-in-stratum" });
      continue;
    }
    // Keep the k best in a small sorted buffer; pools are a few thousand.
    const best: Array<{ id: string; d: number }> = [];
    for (const c of pool) {
      let d2 = 0;
      for (let j = 0; j < p; j++) {
        const z = (t.covariates[j] - c.covariates[j]) / scale[j];
        d2 += z * z;
      }
      const d = Math.sqrt(d2 / p);
      if (best.length < opts.k) {
        best.push({ id: c.id, d });
        best.sort((a, b) => a.d - b.d || (a.id < b.id ? -1 : 1));
      } else if (d < best[best.length - 1].d || (d === best[best.length - 1].d && c.id < best[best.length - 1].id)) {
        best[best.length - 1] = { id: c.id, d };
        best.sort((a, b) => a.d - b.d || (a.id < b.id ? -1 : 1));
      }
    }
    const kept = opts.caliper == null ? best : best.filter((b) => b.d <= opts.caliper!);
    if (kept.length === 0) {
      unmatched.push({ id: t.id, reason: "caliper" });
      continue;
    }
    matches.push({ treated: t.id, controls: kept.map((b) => b.id), distances: kept.map((b) => b.d) });
  }
  return { matches, unmatched, scale, covariateCount: p };
}

export interface BalanceRow {
  covariate: string;
  meanTreated: number;
  meanControlAll: number;
  meanControlMatched: number;
  /** Standardized mean difference before matching (all controls in matched strata). */
  smdBefore: number;
  /** After matching (each treated unit's matched controls weighted 1/k). */
  smdAfter: number;
}

/**
 * Standardized mean differences, the usual balance check. |SMD| under 0.1 is
 * the conventional bar for "well balanced"; the report shows every covariate so
 * a reader can see which ones clear it.
 */
export function balance(
  units: readonly Unit[],
  result: MatchResult,
  names: readonly string[]
): BalanceRow[] {
  const byId = new Map(units.map((u) => [u.id, u]));
  const matchedTreated = result.matches.map((m) => byId.get(m.treated)!);
  const strata = new Set(matchedTreated.map((u) => u.stratum));
  const allControls = units.filter((u) => !u.treated && strata.has(u.stratum) && complete(u));

  return names.map((name, j) => {
    const t = matchedTreated.map((u) => u.covariates[j] as number);
    const cAll = allControls.map((u) => u.covariates[j] as number);
    // Matched controls, weighted by 1/(number of controls for that treated unit).
    let wSum = 0;
    let wx = 0;
    const cMatchedVals: number[] = [];
    for (const m of result.matches) {
      const w = 1 / m.controls.length;
      for (const id of m.controls) {
        const x = byId.get(id)!.covariates[j] as number;
        wx += w * x;
        wSum += w;
        cMatchedVals.push(x);
      }
    }
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const mt = mean(t);
    const mcAll = mean(cAll);
    const mcMatched = wx / wSum;
    // Denominator from the unmatched groups, so before and after share a scale.
    const pooled = Math.sqrt((sd(t) ** 2 + sd(cAll) ** 2) / 2) || 1;
    return {
      covariate: name,
      meanTreated: mt,
      meanControlAll: mcAll,
      meanControlMatched: mcMatched,
      smdBefore: (mt - mcAll) / pooled,
      smdAfter: (mt - mcMatched) / pooled,
    };
  });
}

export interface Effect {
  outcome: string;
  /** Treated units with the outcome and at least one matched control with it. */
  n: number;
  /** Mean over treated of (treated outcome - mean of its matched controls). */
  att: number;
  ciLow: number;
  ciHigh: number;
  /** Plain comparison of means, before matching, for contrast. */
  rawDifference: number;
  meanTreated: number;
  meanMatchedControls: number;
}

/**
 * Deterministic xorshift32, so the bootstrap gives the same interval on every
 * run and the report is reproducible.
 */
function rng(seed: number): () => number {
  let s = seed | 0 || 0x9e3779b9;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s |= 0;
    return (s >>> 0) / 0x100000000;
  };
}

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Ordinary least squares with an intercept, by the normal equations. Returns
 * [intercept, ...slopes]. A tiny ridge term keeps the solve stable when two
 * covariates are nearly collinear (log population and log density, say) without
 * visibly moving the estimates.
 */
export function fitOls(
  X: readonly (readonly number[])[],
  y: readonly number[],
  w?: readonly number[]
): number[] {
  const n = X.length;
  if (n === 0) throw new Error("OLS needs at least one row");
  const p = X[0].length + 1;
  const A = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  const b = new Array<number>(p).fill(0);
  let wSum = 0;
  for (let i = 0; i < n; i++) {
    const wi = w ? w[i] : 1;
    wSum += wi;
    const row = [1, ...X[i]];
    for (let j = 0; j < p; j++) {
      b[j] += wi * row[j] * y[i];
      for (let k = 0; k < p; k++) A[j][k] += wi * row[j] * row[k];
    }
  }
  for (let j = 1; j < p; j++) A[j][j] += 1e-8 * wSum;
  // Gaussian elimination with partial pivoting.
  for (let c = 0; c < p; c++) {
    let piv = c;
    for (let r = c + 1; r < p; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]];
    [b[c], b[piv]] = [b[piv], b[c]];
    if (Math.abs(A[c][c]) < 1e-12) throw new Error("OLS design matrix is singular");
    for (let r = c + 1; r < p; r++) {
      const f = A[r][c] / A[c][c];
      for (let k = c; k < p; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const beta = new Array<number>(p).fill(0);
  for (let c = p - 1; c >= 0; c--) {
    let s = b[c];
    for (let k = c + 1; k < p; k++) s -= A[c][k] * beta[k];
    beta[c] = s / A[c][c];
  }
  return beta;
}

/**
 * The outcome model used to bias-correct a matched estimate.
 *
 *  - `linear`    OLS on all controls, standardized covariates (the default).
 *  - `state`     the same, with slopes estimated within state (covariates and
 *                outcome demeaned by stratum), matching the within-state design.
 *  - `quadratic` adds squared standardized covariates, relaxing linearity.
 *  - `matched`   OLS on the matched controls only, weighted by how often each is
 *                used — the form in Abadie and Imbens (2011).
 *
 * When matches are far apart the correction extrapolates, and these can
 * disagree. Reporting all four, rather than picking one, is what makes that
 * visible.
 */
export type OutcomeModel = "linear" | "state" | "quadratic" | "matched";
export const OUTCOME_MODELS: readonly OutcomeModel[] = ["linear", "state", "quadratic", "matched"];

/**
 * Average effect on the treated for one outcome, with a 95% interval from a
 * bootstrap that resamples clusters (counties) of treated units. Resampling
 * clusters rather than tracts respects the fact that neighboring tracts share
 * a housing market; resampling tracts would understate the uncertainty.
 *
 * With `biasCorrect`, each treated unit's difference is adjusted for whatever
 * covariate gap its matches left behind (Abadie and Imbens 2011): an outcome
 * regression predicts how much of the difference the leftover gap alone would
 * produce, and that part is removed. How much that correction depends on the
 * regression's form is exactly what `OUTCOME_MODELS` exists to show.
 *
 * The interval conditions on the matches (and on the regression, when used),
 * so it does not include the uncertainty from choosing them. That is a known
 * limitation of a first pass, and the report states it.
 */
export function estimateEffect(
  units: readonly Unit[],
  result: MatchResult,
  outcome: string,
  y: ReadonlyMap<string, number | null>,
  opts: { reps?: number; seed?: number; biasCorrect?: boolean | OutcomeModel } = {}
): Effect | null {
  const byId = new Map(units.map((u) => [u.id, u]));
  const model: OutcomeModel | null = opts.biasCorrect === true ? "linear" : opts.biasCorrect || null;

  const complete = (u: Unit) => u.covariates.every((c) => c != null && Number.isFinite(c));
  const z = (u: Unit): number[] => u.covariates.map((c, j) => (c as number) / result.scale[j]);
  const features = (u: Unit): number[] => {
    const base = z(u);
    return model === "quadratic" ? [...base, ...base.map((v) => v * v)] : base;
  };

  // Outcome regression. Only slopes matter: treated units and their controls
  // share a stratum, so any intercept (national or per state) cancels.
  let slopes: number[] | null = null;
  if (model) {
    let fit: Unit[] = units.filter((u) => {
      if (u.treated || !complete(u)) return false;
      const v = y.get(u.id);
      return v != null && Number.isFinite(v);
    });
    let weights: number[] | undefined;
    if (model === "matched") {
      const uses = new Map<string, number>();
      for (const m of result.matches) for (const id of m.controls) uses.set(id, (uses.get(id) ?? 0) + 1);
      fit = fit.filter((u) => uses.has(u.id));
      weights = fit.map((u) => uses.get(u.id)!);
    }
    let X = fit.map(features);
    let Y = fit.map((u) => y.get(u.id) as number);
    if (model === "state") {
      const groups = new Map<string, number[]>();
      fit.forEach((u, i) => (groups.get(u.stratum) ?? groups.set(u.stratum, []).get(u.stratum)!).push(i));
      X = X.map((r) => r.slice());
      Y = Y.slice();
      for (const idx of groups.values()) {
        const k = idx.length;
        const mx = X[idx[0]].map((_, j) => idx.reduce((s, i) => s + X[i][j], 0) / k);
        const my = idx.reduce((s, i) => s + Y[i], 0) / k;
        for (const i of idx) {
          X[i] = X[i].map((v, j) => v - mx[j]);
          Y[i] -= my;
        }
      }
    }
    const p = X[0]?.length ?? 0;
    if (X.length > p + 10) slopes = fitOls(X, Y, weights).slice(1);
  }
  const predictGap = (t: Unit, c: Unit): number => {
    if (!slopes) return 0;
    const ft = features(t);
    const fc = features(c);
    let s = 0;
    for (let j = 0; j < slopes.length; j++) s += slopes[j] * (ft[j] - fc[j]);
    return s;
  };

  const diffs: Array<{ cluster: string; d: number; yt: number; yc: number }> = [];
  for (const m of result.matches) {
    const yt = y.get(m.treated);
    if (yt == null || !Number.isFinite(yt)) continue;
    const t = byId.get(m.treated)!;
    const usable = m.controls.filter((id) => {
      const v = y.get(id);
      return v != null && Number.isFinite(v);
    });
    if (usable.length === 0) continue;
    const yc = usable.reduce((a, id) => a + (y.get(id) as number), 0) / usable.length;
    const correction = usable.reduce((a, id) => a + predictGap(t, byId.get(id)!), 0) / usable.length;
    diffs.push({ cluster: t.cluster, d: yt - yc - correction, yt, yc });
  }
  if (diffs.length === 0) return null;

  const att = diffs.reduce((a, b) => a + b.d, 0) / diffs.length;

  const clusters = new Map<string, number[]>();
  for (const d of diffs) {
    const list = clusters.get(d.cluster);
    if (list) list.push(d.d);
    else clusters.set(d.cluster, [d.d]);
  }
  const keys = [...clusters.keys()].sort();
  const reps = opts.reps ?? 1000;
  const next = rng(opts.seed ?? 20180614);
  const draws: number[] = [];
  for (let r = 0; r < reps; r++) {
    let sum = 0;
    let n = 0;
    for (let i = 0; i < keys.length; i++) {
      const list = clusters.get(keys[Math.floor(next() * keys.length)])!;
      for (const v of list) sum += v;
      n += list.length;
    }
    draws.push(sum / n);
  }
  draws.sort((a, b) => a - b);

  // Raw comparison: all treated with the outcome vs all controls with it, in
  // the same strata.
  const strata = new Set(result.matches.map((m) => byId.get(m.treated)!.stratum));
  const rawT: number[] = [];
  const rawC: number[] = [];
  for (const u of units) {
    if (!strata.has(u.stratum)) continue;
    const v = y.get(u.id);
    if (v == null || !Number.isFinite(v)) continue;
    (u.treated ? rawT : rawC).push(v);
  }
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

  return {
    outcome,
    n: diffs.length,
    att,
    ciLow: quantile(draws, 0.025),
    ciHigh: quantile(draws, 0.975),
    rawDifference: mean(rawT) - mean(rawC),
    meanTreated: mean(diffs.map((d) => d.yt)),
    meanMatchedControls: mean(diffs.map((d) => d.yc)),
  };
}
