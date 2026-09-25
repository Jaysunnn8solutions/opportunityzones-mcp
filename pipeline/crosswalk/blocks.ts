/**
 * The 2010 <-> 2020 tract crosswalk, built from blocks and weighted by people,
 * homes and jobs rather than land.
 *
 * Why not the tract relationship file: it carries only land area, and area
 * weights assume people are spread evenly across a tract, which is badly wrong
 * for any tract with a park, an industrial zone or one dense corner. Splits and
 * merges also concentrate in fast-growing places — precisely the tracts an OZ
 * analysis cares about — so the error would not be random.
 *
 * Method, per state:
 *  1. The 2010-to-2020 tabulation block relationship file gives, for every pair
 *     of overlapping 2010 and 2020 blocks, the land area of the intersection.
 *  2. 2020 P.L. 94-171 counts give each 2020 block's population and housing
 *     units. LODES 8 gives each 2020 block's jobs.
 *  3. Each 2020 block's people, homes and jobs are split across the 2010 blocks
 *     it overlaps in proportion to intersecting land area. Blocks are small, so
 *     assuming evenness WITHIN a block costs almost nothing; that is the whole
 *     point of doing this at block level.
 *  4. Everything is summed to (2010 tract, 2020 tract) pairs.
 *
 * The pair table then serves both directions: pushing 2020-tract data (ACS
 * 2020-2024, FHFA HPI) onto 2010 tracts where the OZ 1.0 designations live, and
 * later mapping 2010 designations onto 2020 tracts for the OZ 2.0 comparison.
 *
 * Output:
 *   pipeline/clean/xwalk_t10_t20.csv   one row per overlapping tract pair
 *   pipeline/clean/tract2010_land.csv  land area per 2010 tract
 *   pipeline/clean/lodes_coverage.csv  which state-years of LODES exist
 */

import { gunzipSync } from "node:zlib";
import path from "node:path";
import { CLEAN_DIR, STATES, type State } from "../config";
import { unzipText } from "../lib/archive";
import { censusApiKey } from "../lib/env";
import { fetchCached, log, mapLimit } from "../lib/http";
import { writeCsv } from "../lib/table";

export const LODES_YEARS = [2012, 2015, 2017, 2021, 2023] as const;

const relUrl = (fips: string) =>
  `https://www2.census.gov/geo/docs/maps-data/data/rel2020/t10t20/TAB2010_TAB2020_ST${fips}.zip`;
const plUrl = (fips: string) =>
  `https://api.census.gov/data/2020/dec/pl?get=P1_001N,H1_001N&for=block:*` +
  `&in=state:${fips}&in=county:*&in=tract:*&key=${censusApiKey()}`;
const lodesUrl = (usps: string, year: number) => {
  const st = usps.toLowerCase();
  return `https://lehd.ces.census.gov/data/lodes/LODES8/${st}/wac/${st}_wac_S000_JT00_${year}.csv.gz`;
};

/** One 2010-block x 2020-block intersection. */
export interface RelPart {
  tract10: string;
  block10: string;
  tract20: string;
  block20: string;
  landInt: number;
  waterInt: number;
  land10: number;
}

export function parseRelationship(text: string): RelPart[] {
  const lines = text.split(/\r?\n/);
  const header = lines[0].replace(/^﻿/, "").split("|");
  const at = (n: string) => {
    const i = header.indexOf(n);
    if (i < 0) throw new Error(`Block relationship file lacks ${n}; header ${header.join("|")}`);
    return i;
  };
  const c = {
    s10: at("STATE_2010"),
    c10: at("COUNTY_2010"),
    t10: at("TRACT_2010"),
    b10: at("BLK_2010"),
    land10: at("AREALAND_2010"),
    s20: at("STATE_2020"),
    c20: at("COUNTY_2020"),
    t20: at("TRACT_2020"),
    b20: at("BLK_2020"),
    landInt: at("AREALAND_INT"),
    waterInt: at("AREAWATER_INT"),
  };
  const out: RelPart[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const f = line.split("|");
    const tract10 = f[c.s10] + f[c.c10] + f[c.t10];
    const tract20 = f[c.s20] + f[c.c20] + f[c.t20];
    out.push({
      tract10,
      block10: tract10 + f[c.b10],
      tract20,
      block20: tract20 + f[c.b20],
      landInt: Number(f[c.landInt]) || 0,
      waterInt: Number(f[c.waterInt]) || 0,
      land10: Number(f[c.land10]) || 0,
    });
  }
  return out;
}

/**
 * How a 2020 block's contents divide among the 2010 tracts it overlaps.
 * Land share where the block has land; water share for the rare all-water block;
 * an even split if it has neither. Shares always sum to 1, so nothing is lost.
 */
export function blockShares(parts: readonly RelPart[]): Array<{ tract10: string; share: number }> {
  const land = parts.reduce((s, p) => s + p.landInt, 0);
  const water = parts.reduce((s, p) => s + p.waterInt, 0);
  const acc = new Map<string, number>();
  for (const p of parts) {
    const w = land > 0 ? p.landInt / land : water > 0 ? p.waterInt / water : 1 / parts.length;
    acc.set(p.tract10, (acc.get(p.tract10) ?? 0) + w);
  }
  return [...acc.entries()].map(([tract10, share]) => ({ tract10, share }));
}

export interface PairAcc {
  tract10: string;
  tract20: string;
  pop: number;
  hu: number;
  land: number;
  jobs: number[];
}

interface StateResult {
  pairs: PairAcc[];
  land10: Map<string, number>;
  plPop: number;
  plHu: number;
  plBlocks: number;
  unmatchedBlocks: number;
  unmatchedPop: number;
  lodes: Array<{ year: number; available: boolean; jobs: number; unmatchedJobs: number }>;
}

function parsePl(text: string): Map<string, { pop: number; hu: number }> {
  if (!text.trimStart().startsWith("[")) {
    const title = /<title>([^<]*)</.exec(text)?.[1] ?? "non-JSON response";
    throw new Error(`2020 P.L. block request failed: ${title}`);
  }
  const rows = JSON.parse(text) as string[][];
  const h = rows[0];
  const iPop = h.indexOf("P1_001N");
  const iHu = h.indexOf("H1_001N");
  const iS = h.indexOf("state");
  const iC = h.indexOf("county");
  const iT = h.indexOf("tract");
  const iB = h.indexOf("block");
  const out = new Map<string, { pop: number; hu: number }>();
  for (const r of rows.slice(1)) {
    out.set(r[iS] + r[iC] + r[iT] + r[iB], { pop: Number(r[iPop]) || 0, hu: Number(r[iHu]) || 0 });
  }
  return out;
}

function parseLodes(buf: Buffer): Map<string, number> {
  const text = gunzipSync(buf).toString("utf8");
  const lines = text.split(/\r?\n/);
  const h = lines[0].split(",");
  const iGeo = h.indexOf("w_geocode");
  const iJobs = h.indexOf("C000");
  if (iGeo < 0 || iJobs < 0) throw new Error(`LODES WAC header unexpected: ${lines[0].slice(0, 120)}`);
  const out = new Map<string, number>();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const f = line.split(",");
    out.set(f[iGeo], (out.get(f[iGeo]) ?? 0) + (Number(f[iJobs]) || 0));
  }
  return out;
}

async function lodesFor(state: State, year: number): Promise<Buffer | null> {
  if (state.usps === "PR") return null; // LODES does not cover Puerto Rico
  try {
    return await fetchCached(lodesUrl(state.usps, year), `lodes8-wac-${state.usps.toLowerCase()}-${year}.csv.gz`);
  } catch (err) {
    if (err instanceof Error && /HTTP 404/.test(err.message)) return null;
    throw err;
  }
}

async function processState(state: State): Promise<StateResult> {
  const relZip = await fetchCached(relUrl(state.fips), `tab2010_tab2020_st${state.fips}.zip`);
  const relText = unzipText(relZip, /\.txt$/i);
  if (relText.length !== 1) throw new Error(`Expected one .txt in relationship zip for ${state.usps}`);
  const parts = parseRelationship(relText[0].text);

  const pl = parsePl((await fetchCached(plUrl(state.fips), `pl2020-blocks-${state.fips}.json`)).toString("utf8"));

  // 2010 tract land, counting each 2010 block once.
  const seen10 = new Set<string>();
  const land10 = new Map<string, number>();
  for (const p of parts) {
    if (seen10.has(p.block10)) continue;
    seen10.add(p.block10);
    land10.set(p.tract10, (land10.get(p.tract10) ?? 0) + p.land10);
  }

  // Group intersections by 2020 block.
  const by20 = new Map<string, RelPart[]>();
  for (const p of parts) {
    const list = by20.get(p.block20);
    if (list) list.push(p);
    else by20.set(p.block20, [p]);
  }

  const pairs = new Map<string, PairAcc>();
  const pair = (t10: string, t20: string) => {
    const k = `${t10}|${t20}`;
    let a = pairs.get(k);
    if (!a) {
      a = { tract10: t10, tract20: t20, pop: 0, hu: 0, land: 0, jobs: LODES_YEARS.map(() => 0) };
      pairs.set(k, a);
    }
    return a;
  };

  // Land per pair (independent of any count).
  for (const p of parts) pair(p.tract10, p.tract20).land += p.landInt;

  // Shares per 2020 block, computed once and reused for every mass.
  const shares = new Map<string, Array<{ tract10: string; share: number }>>();
  for (const [b20, list] of by20) shares.set(b20, blockShares(list));

  let plPop = 0;
  let plHu = 0;
  let unmatchedBlocks = 0;
  let unmatchedPop = 0;
  for (const [b20, v] of pl) {
    plPop += v.pop;
    plHu += v.hu;
    const s = shares.get(b20);
    if (!s) {
      unmatchedBlocks++;
      unmatchedPop += v.pop;
      continue;
    }
    const t20 = b20.slice(0, 11);
    for (const { tract10, share } of s) {
      const a = pair(tract10, t20);
      a.pop += v.pop * share;
      a.hu += v.hu * share;
    }
  }

  const lodes: StateResult["lodes"] = [];
  for (const [yi, year] of LODES_YEARS.entries()) {
    const buf = await lodesFor(state, year);
    if (!buf) {
      lodes.push({ year, available: false, jobs: 0, unmatchedJobs: 0 });
      continue;
    }
    let jobs = 0;
    let unmatchedJobs = 0;
    for (const [b20, n] of parseLodes(buf)) {
      jobs += n;
      const s = shares.get(b20);
      if (!s) {
        unmatchedJobs += n;
        continue;
      }
      const t20 = b20.slice(0, 11);
      for (const { tract10, share } of s) pair(tract10, t20).jobs[yi] += n * share;
    }
    lodes.push({ year, available: true, jobs, unmatchedJobs });
  }

  return {
    pairs: [...pairs.values()],
    land10,
    plPop,
    plHu,
    plBlocks: pl.size,
    unmatchedBlocks,
    unmatchedPop,
    lodes,
  };
}

export async function buildCrosswalk(): Promise<void> {
  // Phase 1: warm the cache concurrently. Every fetch is idempotent.
  log(`crosswalk: prefetching relationship, P.L. and LODES files for ${STATES.length} states`);
  await mapLimit(STATES, 6, async (s) => {
    await fetchCached(relUrl(s.fips), `tab2010_tab2020_st${s.fips}.zip`);
    await fetchCached(plUrl(s.fips), `pl2020-blocks-${s.fips}.json`);
    for (const y of LODES_YEARS) await lodesFor(s, y);
  });

  // Phase 2: process one state at a time to bound memory.
  const allPairs: PairAcc[] = [];
  const allLand10 = new Map<string, number>();
  const coverage: Array<Array<string | number | boolean>> = [];
  let pop = 0;
  let unmatchedPop = 0;
  let unmatchedBlocks = 0;

  for (const s of STATES) {
    const r = await processState(s);
    allPairs.push(...r.pairs);
    for (const [k, v] of r.land10) allLand10.set(k, (allLand10.get(k) ?? 0) + v);
    pop += r.plPop;
    unmatchedPop += r.unmatchedPop;
    unmatchedBlocks += r.unmatchedBlocks;
    for (const l of r.lodes) coverage.push([s.fips, s.usps, l.year, l.available, Math.round(l.jobs), Math.round(l.unmatchedJobs)]);
    const allocated = r.pairs.reduce((a, p) => a + p.pop, 0);
    log(
      `crosswalk ${s.usps}: ${r.plBlocks.toLocaleString("en-US")} blocks, ${r.pairs.length.toLocaleString("en-US")} tract pairs, ` +
        `pop ${r.plPop.toLocaleString("en-US")} (allocated ${Math.round(allocated).toLocaleString("en-US")}), ` +
        `LODES ${r.lodes.filter((l) => l.available).map((l) => l.year).join("/") || "none"}`
    );
  }

  const header = ["geoid10", "geoid20", "pop20", "hu20", "land_m2", ...LODES_YEARS.map((y) => `jobs_${y}`)];
  writeCsv(
    path.join(CLEAN_DIR, "xwalk_t10_t20.csv"),
    header,
    allPairs
      .sort((a, b) => (a.tract10 === b.tract10 ? (a.tract20 < b.tract20 ? -1 : 1) : a.tract10 < b.tract10 ? -1 : 1))
      .map((p) => [p.tract10, p.tract20, round(p.pop), round(p.hu), Math.round(p.land), ...p.jobs.map(round)])
  );
  writeCsv(
    path.join(CLEAN_DIR, "tract2010_land.csv"),
    ["geoid10", "land_m2"],
    [...allLand10.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, v]) => [k, Math.round(v)])
  );
  writeCsv(
    path.join(CLEAN_DIR, "lodes_coverage.csv"),
    ["state_fips", "usps", "year", "available", "jobs", "unmatched_jobs"],
    coverage
  );
  log(
    `crosswalk: ${allPairs.length.toLocaleString("en-US")} tract pairs; 2020 population ${pop.toLocaleString("en-US")}; ` +
      `${unmatchedBlocks} P.L. blocks (${unmatchedPop.toLocaleString("en-US")} people) had no relationship record`
  );
}

function round(x: number): number {
  return Math.round(x * 1000) / 1000;
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  buildCrosswalk().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
