/**
 * Compact per-tract status for colouring the map: one integer of flags per
 * tract, and per-county counts for the zoomed-out view. Derived from the
 * published payload; public data about places.
 */

import type { CountyCounts } from "./countyZones";
import { loadTractData } from "./tracts";

export const FLAGS = {
  eligible: 1,
  rural: 2,
  oz2018: 4,
  qct: 8,
  dda: 16,
  nmtc: 32,
  /** A designated 2027 zone. */
  zone2027: 64,
  /** Eligible, with its state's 2027 list not yet published (so zone2027 is not yet known). */
  zone2027Pending: 128,
} as const;
export type Flag = keyof typeof FLAGS;

/** GEOID -> flag bits, for one state. */
export function stateStatus(stateFips: string): Record<string, number> {
  const { payload } = loadTractData();
  const col = (n: string) => payload.columns.get(n)!;
  const [eligible, rural, oz, qct, dda, nmtc] = ["eligible_2027", "rural_2027", "oz2018_population_share", "qct_2026", "dda_2026", "nmtc_lic"].map(col);
  // Absent from data published before Treasury's list: then every eligible tract is pending.
  const designated = payload.columns.get("designated_2027");
  const out: Record<string, number> = {};
  for (let i = 0; i < payload.count; i++) {
    const g = payload.geoids[i];
    if (!g.startsWith(stateFips)) continue;
    let bits = 0;
    if (eligible.get(i) === 1) bits |= FLAGS.eligible;
    if (rural.get(i) === 1) bits |= FLAGS.rural;
    if ((oz.get(i) ?? 0) >= 0.5) bits |= FLAGS.oz2018;
    if (qct.get(i) === 1) bits |= FLAGS.qct;
    if ((dda.get(i) ?? 0) > 0) bits |= FLAGS.dda;
    if (nmtc.get(i) === 1) bits |= FLAGS.nmtc;
    const d = designated?.get(i) ?? null;
    if (d === 1) bits |= FLAGS.zone2027;
    else if (d == null && eligible.get(i) === 1) bits |= FLAGS.zone2027Pending;
    out[g] = bits;
  }
  return out;
}

/** County FIPS -> counts per lib/data/countyZones.ts, nationally. */
export function countySummary(): Record<string, CountyCounts> {
  const { payload } = loadTractData();
  const eligible = payload.columns.get("eligible_2027")!;
  const designated = payload.columns.get("designated_2027");
  const out: Record<string, CountyCounts> = {};
  for (let i = 0; i < payload.count; i++) {
    const c = payload.geoids[i].slice(0, 5);
    const row = (out[c] ??= [0, 0, 0, 0]);
    row[0]++;
    const d = designated?.get(i) ?? null;
    if (eligible.get(i) === 1) {
      row[1]++;
      if (d == null) row[3]++;
    }
    if (d === 1) row[2]++;
  }
  return out;
}

