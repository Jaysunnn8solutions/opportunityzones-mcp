/**
 * Moving tract data between 2010 and 2020 boundaries.
 *
 * Built on the block-level pair table from `pipeline/crosswalk/blocks.ts`: for
 * every overlapping (2010 tract, 2020 tract) pair, the 2020 population, housing
 * units and land that fall in the overlap. No knowledge of files or I/O here, so
 * the arithmetic is unit-tested on its own.
 *
 * Two kinds of variable need two different rules:
 *
 *  - COUNTS (people, homes, jobs, the numerator and denominator of a rate) are
 *    apportioned: a 2020 tract's count is split among the 2010 tracts it
 *    overlaps in proportion to where its people (or homes) are. Summing the
 *    apportioned pieces reproduces the original total exactly.
 *  - INTENSIVE values (medians, index levels, log changes) cannot be split. A
 *    2010 tract gets the weighted mean of the values of the 2020 tracts that
 *    make it up. That is exact when the 2010 tract equals one 2020 tract, and an
 *    approximation otherwise — a median of a union is not the mean of medians —
 *    so every converted value carries a quality flag saying which case applies.
 *
 * Rates are built from converted counts, never by averaging rates.
 */

export type Weight = "pop" | "hu" | "land";

export interface Pair {
  geoid10: string;
  geoid20: string;
  pop: number;
  hu: number;
  land: number;
}

export type Relationship = "identical" | "split" | "merged" | "complex" | "unpopulated";

export interface TractQuality {
  /** Share of the 2010 tract's weight in its largest 2020 tract. */
  concentration: number;
  /**
   * Weight-averaged share of each contributing 2020 tract that lies inside the
   * 2010 tract. 1.0 means every contributing 2020 tract is wholly inside it.
   */
  purity: number;
  relationship: Relationship;
  /** How many 2020 tracts contribute. */
  parts: number;
}

export interface Crosswalk {
  /** 2020 tracts overlapping each 2010 tract. */
  to10: Map<string, Pair[]>;
  /** 2010 tracts overlapping each 2020 tract. */
  to20: Map<string, Pair[]>;
  quality10: Map<string, TractQuality>;
}

/** Relationship thresholds, named so the classification reads as intended. */
const WHOLE = 0.99;

function w(p: Pair, weight: Weight): number {
  return weight === "pop" ? p.pop : weight === "hu" ? p.hu : p.land;
}

/**
 * Weight for a pair, falling back to land when the whole group has no people
 * (or no homes), and to an even split when it has no land either. Without the
 * fallback an unpopulated tract would divide by zero and silently vanish.
 */
function weightsFor(group: readonly Pair[], weight: Weight): number[] {
  const primary = group.map((p) => w(p, weight));
  if (primary.some((x) => x > 0)) return primary;
  const land = group.map((p) => p.land);
  if (land.some((x) => x > 0)) return land;
  return group.map(() => 1);
}

export function buildCrosswalk(pairs: readonly Pair[]): Crosswalk {
  const to10 = new Map<string, Pair[]>();
  const to20 = new Map<string, Pair[]>();
  for (const p of pairs) {
    (to10.get(p.geoid10) ?? to10.set(p.geoid10, []).get(p.geoid10)!).push(p);
    (to20.get(p.geoid20) ?? to20.set(p.geoid20, []).get(p.geoid20)!).push(p);
  }

  const total20 = new Map<string, number>();
  for (const [g20, group] of to20) total20.set(g20, group.reduce((s, p) => s + p.pop, 0));

  const quality10 = new Map<string, TractQuality>();
  for (const [g10, group] of to10) {
    const pop10 = group.reduce((s, p) => s + p.pop, 0);
    if (pop10 <= 0) {
      quality10.set(g10, { concentration: 1, purity: 1, relationship: "unpopulated", parts: group.length });
      continue;
    }
    let concentration = 0;
    let purity = 0;
    let largest: Pair | null = null;
    for (const p of group) {
      const share10 = p.pop / pop10;
      const t20 = total20.get(p.geoid20) ?? 0;
      const share20 = t20 > 0 ? p.pop / t20 : 1;
      purity += share10 * share20;
      if (share10 > concentration) {
        concentration = share10;
        largest = p;
      }
    }
    const largestInside = largest && (total20.get(largest.geoid20) ?? 0) > 0
      ? largest.pop / total20.get(largest.geoid20)!
      : 1;

    let relationship: Relationship;
    if (concentration >= WHOLE && largestInside >= WHOLE) relationship = "identical";
    else if (concentration >= WHOLE) relationship = "merged";
    else if (purity >= WHOLE) relationship = "split";
    else relationship = "complex";

    const parts = group.filter((p) => p.pop / pop10 >= 0.001).length;
    quality10.set(g10, { concentration, purity, relationship, parts: Math.max(parts, 1) });
  }

  return { to10, to20, quality10 };
}

/**
 * A count published on 2020 tracts, apportioned onto a 2010 tract.
 * Null if any contributing 2020 tract lacks the value — a partial sum would
 * understate the count while looking like a real number.
 */
export function countTo2010(
  xw: Crosswalk,
  geoid10: string,
  values: ReadonlyMap<string, number | null>,
  weight: Weight
): number | null {
  const group = xw.to10.get(geoid10);
  if (!group) return null;
  let total = 0;
  for (const p of group) {
    const v = values.get(p.geoid20);
    const whole = xw.to20.get(p.geoid20)!;
    const ws = weightsFor(whole, weight);
    const sum = ws.reduce((a, b) => a + b, 0);
    const mine = ws[whole.indexOf(p)];
    const share = sum > 0 ? mine / sum : 0;
    if (share === 0) continue;
    if (v == null) return null;
    total += v * share;
  }
  return total;
}

export interface Converted {
  value: number | null;
  /** Share of the 2010 tract's weight covered by 2020 tracts that had a value. */
  coverage: number;
}

/**
 * An intensive value (median, index level, log change) on 2020 tracts, as a
 * weighted mean onto a 2010 tract. Missing contributors are dropped and the
 * coverage reported; below `minCoverage` the result is null rather than a mean
 * of whatever happened to be present.
 *
 * `share` scales each pair's weight by a property of its 2020 tract. A median
 * home value describes owner-occupied homes, so it should be weighted by owner
 * units: housing units in the pair times the 2020 tract's owner share. Plain
 * housing-unit weights would let a renter-heavy piece dominate a home value.
 */
export function intensiveTo2010(
  xw: Crosswalk,
  geoid10: string,
  values: ReadonlyMap<string, number | null>,
  weight: Weight,
  minCoverage = 0.5,
  share?: ReadonlyMap<string, number | null>
): Converted {
  const group = xw.to10.get(geoid10);
  if (!group || group.length === 0) return { value: null, coverage: 0 };
  let ws = weightsFor(group, weight);
  if (share) {
    const scaled = ws.map((wv, i) => wv * (share.get(group[i].geoid20) ?? 0));
    // Fall back to unscaled weights only if no piece has any of the relevant
    // tenure at all, rather than dividing by zero.
    if (scaled.some((x) => x > 0)) ws = scaled;
  }
  const all = ws.reduce((a, b) => a + b, 0);
  let num = 0;
  let den = 0;
  for (const [i, p] of group.entries()) {
    const v = values.get(p.geoid20);
    if (v == null || !Number.isFinite(v)) continue;
    num += v * ws[i];
    den += ws[i];
  }
  const coverage = all > 0 ? den / all : 0;
  if (den <= 0 || coverage < minCoverage) return { value: null, coverage };
  return { value: num / den, coverage };
}
