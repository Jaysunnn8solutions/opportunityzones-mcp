/**
 * Did the 2018 zones gain more money than comparable tracts that were
 * eligible but not picked, and for which kinds of tract did they gain most?
 *
 * Treated: designated low-income-community tracts. Controls: eligible
 * low-income-community tracts not designated (the "control pool" of
 * compare.ts). 50 states and DC; Puerto Rico has no controls.
 *
 * For each outcome (a 2016 -> 2024 change), a regression fitted on the
 * controls predicts the change from the tract's own 2016 level and 2011-2016
 * trend, a few common 2016 conditions, and its state. The residual is how much
 * better or worse a tract did than comparable tracts; residuals are scaled by
 * the controls' spread and signed so that higher always means more money
 * (lower poverty, higher income...). Comparing designated with control tracts
 * on those residuals gives the lift, overall and within groups of tracts
 * (thirds of each 2016 condition within the state).
 *
 * What this is not. Governors did not pick zones at random; adjusting for 2016
 * conditions and trends makes the comparison fair on what was measured, not on
 * what was not. Tract data cannot tell whether existing residents gained or
 * better-off people moved in; population and housing changes are reported
 * beside every score for that reason. Standard errors treat tracts as
 * independent, which neighboring tracts are not, so intervals are too narrow;
 * a group is only called clear at 99%.
 *
 * Output: data/oz1/growth.json
 */

import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { liftOf, percentileAmong, residualsWithGroupEffects, type Lift, type Obs } from "../../lib/analysis/lift";
import { CLEAN_DIR } from "../config";
import { log } from "../lib/http";
import { num, readCsv } from "../lib/table";
import { OUT_DIR } from "./assemble";

export interface Outcome {
  column: string;
  label: string;
  /** +1 when a rise means more money, -1 when a fall does. */
  direction: 1 | -1;
  unit: "log" | "share";
  /** This outcome's own 2016 level and trend; "log:" and "log1p:" transform. */
  own: string[];
}

export const OUTCOMES: Outcome[] = [
  { column: "out_dlog_hh_income", label: "Median household income (real)", direction: 1, unit: "log", own: ["log:median_hh_income_2016", "pre_dlog_hh_income"] },
  { column: "out_dlog_per_capita_income", label: "Income per person (real)", direction: 1, unit: "log", own: ["log:per_capita_income_2016", "pre_dlog_hh_income"] },
  { column: "out_d_hh_high_income_share", label: "Households with $100k+ (2016 dollars)", direction: 1, unit: "share", own: ["hh_100k_plus_share_2016"] },
  { column: "out_dlog_home_value", label: "Median home value (real)", direction: 1, unit: "log", own: ["log:median_home_value_2016", "pre_dlog_home_value"] },
  { column: "out_hpi_real_dlog_2017_2024", label: "House prices, repeat sales (FHFA, real)", direction: 1, unit: "log", own: ["log:median_home_value_2016", "pre_dlog_home_value"] },
  { column: "out_d_poverty", label: "Poverty rate", direction: -1, unit: "share", own: ["poverty_rate_2016", "pre_d_poverty"] },
  { column: "out_d_snap_share", label: "Households receiving SNAP", direction: -1, unit: "share", own: ["snap_share_2016"] },
  { column: "out_d_public_assistance_share", label: "Households receiving public assistance", direction: -1, unit: "share", own: ["public_assistance_share_2016"] },
  { column: "out_d_vacancy", label: "Vacant homes", direction: -1, unit: "share", own: ["vacancy_rate_2016", "pre_d_vacancy"] },
  { column: "out_d_owner_share", label: "Homes lived in by their owners", direction: 1, unit: "share", own: ["owner_share_2016"] },
  { column: "out_d_no_vehicle_share", label: "Households without a vehicle", direction: -1, unit: "share", own: ["no_vehicle_share_2016"] },
  { column: "out_dlog_home_purchase_loans_2018_2024", label: "Home-purchase mortgages (2018-2024)", direction: 1, unit: "log", own: ["log1p:home_purchase_loans_2018"] },
  { column: "out_dlog_jobs_2017_2023", label: "Jobs located in the tract", direction: 1, unit: "log", own: ["log_jobs_2015", "pre_dlog_jobs_2012_2015"] },
];

/** Shown beside the score, not part of it: they describe who lives there, not their money. */
export const CONTEXT: Array<{ column: string; label: string; unit: "log" | "share" }> = [
  { column: "out_dlog_pop", label: "Population", unit: "log" },
  { column: "out_dlog_housing_units", label: "Housing units", unit: "log" },
  { column: "out_d_children_share", label: "Share of residents under 18", unit: "share" },
  { column: "out_d_mortgage_share", label: "Owner homes with a mortgage", unit: "share" },
];

const COMMON = ["log_density_2016", "poverty_rate_2016", "log:median_hh_income_2016", "ba_plus_share_2016", "unemployment_rate_2016"];

/** 2016 conditions for the "for which kinds of tract" breakdown, split into thirds within each state. */
export const FEATURES: Array<{ column: string; label: string }> = [
  { column: "poverty_rate_2016", label: "Poverty rate" },
  { column: "median_hh_income_2016", label: "Median household income" },
  { column: "median_home_value_2016", label: "Median home value" },
  { column: "vacancy_rate_2016", label: "Vacancy" },
  { column: "owner_share_2016", label: "Owner-occupied share" },
  { column: "ba_plus_share_2016", label: "Adults with a bachelor's degree" },
  { column: "unemployment_rate_2016", label: "Unemployment" },
  { column: "log_density_2016", label: "Population density" },
  { column: "log_jobs_2015", label: "Jobs in the tract" },
  { column: "pre_dlog_pop", label: "Population trend 2011-2016" },
  { column: "pre_dlog_hh_income", label: "Income trend 2011-2016" },
  { column: "pre_dlog_home_value", label: "Home value trend 2011-2016" },
  { column: "snap_share_2016", label: "Households on SNAP" },
  { column: "no_vehicle_share_2016", label: "Households without a vehicle" },
  { column: "hh_100k_plus_share_2016", label: "Households with $100k+" },
  { column: "children_share_2016", label: "Residents under 18" },
];

const Z95 = 1.96;
const Z99 = 2.576;

function transform(spec: string, raw: string | undefined): number | null {
  const [kind, col] = spec.includes(":") ? (spec.split(":") as [string, string]) : ["", spec];
  const v = num(raw);
  void col;
  if (v == null) return null;
  if (kind === "log") return v > 0 ? Math.log(v) : null;
  if (kind === "log1p") return v >= 0 ? Math.log1p(v) : null;
  return v;
}
const colOf = (spec: string) => (spec.includes(":") ? spec.split(":")[1] : spec);

interface Tract {
  geoid10: string;
  state: string;
  treated: boolean;
  get: (column: string) => string | undefined;
  z: Map<string, number>;
  resid: Map<string, number>;
  composite?: number;
}

export interface GrowthOutput {
  generated: string;
  method: string;
  treated: number;
  controls: number;
  outcomes: Array<{ column: string; label: string; unit: string; direction: number; lift: Lift | null; natural: Lift | null }>;
  composite: Lift | null;
  context: Array<{ column: string; label: string; unit: string; treated: number | null; control: number | null }>;
  groups: Array<{ feature: string; label: string; bins: Array<{ bin: string; lift: Lift | null; clear: "positive" | "negative" | null }> }>;
  /** 2010 tract -> [score 0-100, composite z, population change %, housing-unit change %]. */
  zones: Record<string, [number, number, number | null, number | null]>;
  /** 2020 tract -> score of the 2018 zone(s) it lies in (population-weighted), where most of its people are in one. */
  zones2020: Record<string, number>;
}

export function computeGrowth(file = path.join(OUT_DIR, "analysis.csv")): GrowthOutput {
  const t = readCsv(file);
  const idx = new Map(t.header.map((h, i) => [h, i]));
  const has = (c: string) => idx.has(c);
  const outcomes = OUTCOMES.filter((o) => has(o.column) && o.own.every((s) => has(colOf(s))));
  const tracts: Tract[] = [];
  for (const r of t.rows) {
    const group = r[idx.get("group")!];
    const state = r[idx.get("state_fips")!];
    if ((group !== "designated_lic" && group !== "eligible_lic_control") || state === "72" || !r[idx.get("state_name")!]) continue;
    tracts.push({
      geoid10: r[0],
      state,
      treated: group === "designated_lic",
      get: (c) => (idx.has(c) ? r[idx.get(c)!] : undefined),
      z: new Map(),
      resid: new Map(),
    });
  }

  // Residual per outcome, scaled by the controls' spread and signed toward "more money".
  for (const o of outcomes) {
    const covs = [...o.own, ...COMMON.filter((c) => !o.own.includes(c))];
    const obs: Obs[] = [];
    const who: Tract[] = [];
    for (const tr of tracts) {
      const y = num(tr.get(o.column));
      const x = covs.map((c) => transform(c, tr.get(colOf(c))));
      if (y == null || x.some((v) => v == null)) continue;
      obs.push({ group: tr.state, y, x: x as number[], control: !tr.treated });
      who.push(tr);
    }
    if (obs.length === 0) continue;
    const res = residualsWithGroupEffects(obs);
    const ctl = res.filter((v, i) => Number.isFinite(v) && !who[i].treated);
    const sd = Math.sqrt(ctl.reduce((a, v) => a + v * v, 0) / Math.max(1, ctl.length - 1)) || 1;
    res.forEach((v, i) => {
      if (!Number.isFinite(v)) return;
      who[i].resid.set(o.column, v);
      who[i].z.set(o.column, (o.direction * v) / sd);
    });
  }

  // Composite: mean signed z over the outcomes a tract has, if it has at least half of them.
  const minOutcomes = Math.ceil(outcomes.length / 2);
  for (const tr of tracts) {
    if (tr.z.size >= minOutcomes) tr.composite = [...tr.z.values()].reduce((a, b) => a + b, 0) / tr.z.size;
  }
  const scored = tracts.filter((tr) => tr.composite != null);
  const T = scored.filter((tr) => tr.treated);
  const C = scored.filter((tr) => !tr.treated);

  const outcomeRows = outcomes.map((o) => {
    const zt = tracts.filter((x) => x.treated && x.z.has(o.column)).map((x) => x.z.get(o.column)!);
    const zc = tracts.filter((x) => !x.treated && x.z.has(o.column)).map((x) => x.z.get(o.column)!);
    const rt = tracts.filter((x) => x.treated && x.resid.has(o.column)).map((x) => x.resid.get(o.column)!);
    const rc = tracts.filter((x) => !x.treated && x.resid.has(o.column)).map((x) => x.resid.get(o.column)!);
    return { column: o.column, label: o.label, unit: o.unit, direction: o.direction, lift: liftOf(zt, zc, Z95), natural: liftOf(rt, rc, Z95) };
  });

  const context = CONTEXT.filter((c) => has(c.column)).map((c) => {
    const med = (xs: number[]) => (xs.length ? xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null);
    const vals = (treated: boolean) => scored.filter((x) => x.treated === treated).map((x) => num(x.get(c.column))).filter((v): v is number => v != null);
    return { column: c.column, label: c.label, unit: c.unit, treated: med(vals(true)), control: med(vals(false)) };
  });

  // Thirds of each 2016 condition, within each state (designated and controls together).
  const groups = FEATURES.filter((f) => has(f.column)).map((f) => {
    const third = new Map<Tract, number>();
    const byState = new Map<string, Array<[Tract, number]>>();
    for (const tr of scored) {
      const v = num(tr.get(f.column));
      if (v == null) continue;
      const list = byState.get(tr.state) ?? [];
      list.push([tr, v]);
      byState.set(tr.state, list);
    }
    for (const list of byState.values()) {
      if (list.length < 30) continue;
      const sorted = list.map(([, v]) => v).sort((a, b) => a - b);
      for (const [tr, v] of list) {
        const p = percentileAmong(sorted, v);
        third.set(tr, p < 100 / 3 ? 0 : p < 200 / 3 ? 1 : 2);
      }
    }
    const bins = ["Lowest third", "Middle third", "Highest third"].map((bin, b) => {
      const inBin = scored.filter((tr) => third.get(tr) === b);
      const lift = liftOf(inBin.filter((x) => x.treated).map((x) => x.composite!), inBin.filter((x) => !x.treated).map((x) => x.composite!), Z95);
      const strict = liftOf(inBin.filter((x) => x.treated).map((x) => x.composite!), inBin.filter((x) => !x.treated).map((x) => x.composite!), Z99);
      const clear = strict == null ? null : strict.low > 0 ? "positive" : strict.high < 0 ? "negative" : null;
      return { bin, lift, clear: clear as "positive" | "negative" | null };
    });
    return { feature: f.column, label: f.label, bins };
  });
  const nb = (tr: Tract) => Number(tr.get("designated_neighbours") ?? 0);
  const nbBins = [
    ["No designated neighbors", (n: number) => n === 0],
    ["1-2 designated neighbors", (n: number) => n >= 1 && n <= 2],
    ["3 or more", (n: number) => n >= 3],
  ] as const;
  groups.push({
    feature: "designated_neighbours",
    label: "Neighboring 2018 zones",
    bins: nbBins.map(([bin, test]) => {
      const inBin = scored.filter((tr) => test(nb(tr)));
      const pick = (treated: boolean) => inBin.filter((x) => x.treated === treated).map((x) => x.composite!);
      const strict = liftOf(pick(true), pick(false), Z99);
      return { bin, lift: liftOf(pick(true), pick(false), Z95), clear: strict == null ? null : strict.low > 0 ? "positive" : strict.high < 0 ? "negative" : null };
    }),
  });

  // Per-zone score: percentile of its composite among same-state controls.
  const ctlByState = new Map<string, number[]>();
  for (const tr of C) ctlByState.set(tr.state, [...(ctlByState.get(tr.state) ?? []), tr.composite!]);
  for (const v of ctlByState.values()) v.sort((a, b) => a - b);
  const pct = (dlog: number | null) => (dlog == null ? null : Math.round((Math.exp(dlog) - 1) * 1000) / 10);
  const zones: GrowthOutput["zones"] = {};
  const score10 = new Map<string, number>();
  for (const tr of T) {
    const peers = ctlByState.get(tr.state);
    if (!peers || peers.length < 20) continue;
    const s = Math.round(percentileAmong(peers, tr.composite!) * 10) / 10;
    score10.set(tr.geoid10, s);
    zones[tr.geoid10] = [s, Math.round(tr.composite! * 1000) / 1000, pct(num(tr.get("out_dlog_pop"))), pct(num(tr.get("out_dlog_housing_units")))];
  }

  // Onto 2020 tracts, where the crosswalk is available (the refresh workflow has it).
  const zones2020: Record<string, number> = {};
  const xwFile = path.join(CLEAN_DIR, "xwalk_t10_t20.csv");
  if (existsSync(xwFile)) {
    const xt = readCsv(xwFile);
    const [i10, i20, iPop] = [xt.col("geoid10"), xt.col("geoid20"), xt.col("pop20")];
    const acc = new Map<string, { w: number; ws: number; total: number }>();
    for (const r of xt.rows) {
      const pop = Number(r[iPop]) || 0;
      const a = acc.get(r[i20]) ?? { w: 0, ws: 0, total: 0 };
      a.total += pop;
      const s = score10.get(r[i10]);
      if (s != null) {
        a.w += pop;
        a.ws += pop * s;
      }
      acc.set(r[i20], a);
    }
    for (const [g, a] of acc) if (a.total > 0 && a.w / a.total >= 0.5) zones2020[g] = Math.round((a.ws / a.w) * 10) / 10;
  } else {
    log("growth: no 2010-2020 crosswalk in pipeline/clean; zones2020 left empty");
  }

  return {
    generated: new Date().toISOString().slice(0, 10),
    method:
      "Designated 2018 low-income-community tracts vs eligible tracts not designated, 50 states and DC. Each 2016-2024 change is compared with what controls in the same state with the same 2016 level and 2011-16 trend saw; residuals are scaled by the controls' spread and signed toward more money. Descriptive: selection was not random, and tract data cannot separate residents gaining from newcomers arriving.",
    treated: T.length,
    controls: C.length,
    outcomes: outcomeRows,
    composite: liftOf(
      T.map((x) => x.composite!),
      C.map((x) => x.composite!),
      Z95
    ),
    context,
    groups,
    zones,
    zones2020,
  };
}

export async function buildGrowth(): Promise<GrowthOutput> {
  const out = computeGrowth();
  writeFileSync(path.join(OUT_DIR, "growth.json"), JSON.stringify(out));
  log(
    `growth: ${out.treated.toLocaleString("en-US")} zones vs ${out.controls.toLocaleString("en-US")} controls; ` +
      `${out.outcomes.length} outcomes; composite lift ${out.composite?.estimate.toFixed(3)} (95% ${out.composite?.low.toFixed(3)} to ${out.composite?.high.toFixed(3)})`
  );
  return out;
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  buildGrowth().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
