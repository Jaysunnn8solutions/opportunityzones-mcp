/**
 * The arithmetic behind the 2018-zone lift estimates (pipeline/oz1/growth.ts):
 * least squares with state fixed effects fitted on control tracts, residuals
 * for every tract, and the difference in mean residual between designated and
 * control tracts with a Welch standard error. Pure and dependency-free.
 */

/** Solve A x = b for a small dense system (Gaussian elimination, partial pivoting). */
export function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) throw new Error("singular system");
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

export interface Obs {
  group: string;
  y: number;
  x: number[];
  control: boolean;
}

/**
 * Fit y on x with group (state) fixed effects, using control observations
 * only; return every observation's residual. Group means are the controls'
 * means, so a designated tract's residual is measured against controls in its
 * own state. Groups with fewer than `minControls` controls are dropped (NaN).
 */
export function residualsWithGroupEffects(obs: readonly Obs[], minControls = 20): number[] {
  const k = obs[0]?.x.length ?? 0;
  const sums = new Map<string, { n: number; y: number; x: number[] }>();
  for (const o of obs) {
    if (!o.control) continue;
    const s = sums.get(o.group) ?? { n: 0, y: 0, x: new Array(k).fill(0) };
    s.n++;
    s.y += o.y;
    o.x.forEach((v, j) => (s.x[j] += v));
    sums.set(o.group, s);
  }
  const mean = new Map([...sums].filter(([, s]) => s.n >= minControls).map(([g, s]) => [g, { y: s.y / s.n, x: s.x.map((v) => v / s.n) }]));
  const XtX = Array.from({ length: k }, () => new Array(k).fill(0));
  const Xty = new Array(k).fill(0);
  for (const o of obs) {
    const m = mean.get(o.group);
    if (!o.control || !m) continue;
    const dx = o.x.map((v, j) => v - m.x[j]);
    const dy = o.y - m.y;
    for (let i = 0; i < k; i++) {
      Xty[i] += dx[i] * dy;
      for (let j = 0; j < k; j++) XtX[i][j] += dx[i] * dx[j];
    }
  }
  // A tiny ridge keeps the system solvable when a covariate does not vary
  // (its coefficient then goes to zero) without moving the others.
  for (let i = 0; i < k; i++) XtX[i][i] += 1e-9 * (XtX[i][i] + 1);
  const beta = k > 0 ? solve(XtX, Xty) : [];
  return obs.map((o) => {
    const m = mean.get(o.group);
    if (!m) return NaN;
    return o.y - m.y - o.x.reduce((acc, v, j) => acc + (v - m.x[j]) * beta[j], 0);
  });
}

export interface Lift {
  /** Mean of treated minus mean of controls. */
  estimate: number;
  se: number;
  low: number;
  high: number;
  nTreated: number;
  nControl: number;
}

function meanVar(xs: readonly number[]): [number, number] {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1);
  return [m, v];
}

/** Difference in means with a Welch standard error and a two-sided interval at `z` (1.96 for 95%). */
export function liftOf(treated: readonly number[], control: readonly number[], z = 1.96): Lift | null {
  if (treated.length < 2 || control.length < 2) return null;
  const [mt, vt] = meanVar(treated);
  const [mc, vc] = meanVar(control);
  const se = Math.sqrt(vt / treated.length + vc / control.length);
  const estimate = mt - mc;
  return { estimate, se, low: estimate - z * se, high: estimate + z * se, nTreated: treated.length, nControl: control.length };
}

/** Percentile (0-100) of x among sorted values, counting ties as half. */
export function percentileAmong(sorted: readonly number[], x: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  let eq = lo;
  while (eq < sorted.length && sorted[eq] === x) eq++;
  return (100 * (lo + (eq - lo) / 2)) / sorted.length;
}
