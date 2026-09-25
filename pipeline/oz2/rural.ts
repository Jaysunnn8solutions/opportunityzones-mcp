/**
 * Which 2020 tracts are "comprised entirely of a rural area", reproduced from
 * the statute so the product can say *why*, and checked against Treasury's own
 * rural flag rather than replacing it.
 *
 * Law: IRC § 1400Z-2(b)(2)(C)(ii) as added by P.L. 119-21 § 70421(c)(2): a rural
 * area is "any area other than (I) a city or town that has a population of
 * greater than 50,000 inhabitants, and (II) any urbanized area contiguous and
 * adjacent to a city or town described in subclause (I)". It matters for
 * qualified rural opportunity funds and the 50% substantial-improvement
 * threshold in rural zones.
 *
 * Method, per IRS Notice 2025-50:
 *  - city or town: an incorporated place over 50,000 in the 2020 Census; in
 *    Hawaii and Puerto Rico, a Census Designated Place;
 *  - urbanized area: any 2020 Census urban area;
 *  - contiguous and adjacent: sharing a boundary or at least one point.
 *
 * Treasury's own method for the 2027 list (Office of Tax Analysis, "Methodology
 * for Determining Census Tracts ... Comprised Entirely of a Rural Area", March
 * 2026) adds two rules the Notice leaves open:
 *  - de minimis: a tract loses rural status only if it fully contains at least
 *    one urban or city block. Blocks nest in tracts, so the block test below is
 *    exactly this rule;
 *  - islands: an urban area's detached parts ("hops and jumps") that do not
 *    themselves touch the city do not count. Telling parts apart needs polygon
 *    geometry, which this block test does not have.
 *
 * So Treasury's `rural_status` is the authority the product reports, and this
 * reproduction supplies the *why*: the city or urban area that excludes a tract.
 * Where the two agree (98.3% of 85,396 computed tracts when first run) the
 * explanation is marked verified. Where they differ, the likely cause is named
 * and marked unverified:
 *  - Treasury rural, block test not: the tract's urban blocks lie in a detached
 *    island of the urban area, which Treasury excludes;
 *  - block test rural, Treasury not: most likely an urban area that touches a
 *    city without sharing a block with it, which only geometry can see.
 * Resolving both needs full-resolution urban area, place and tract polygons
 * (about 1 GB); recorded as a follow-up in docs/NEXT_SESSION_PROMPT.md.
 *
 * Outputs:
 *  - pipeline/clean/oz2_rural.csv: every tract, Treasury's flag, and the reason;
 *  - pipeline/clean/oz2_rural_disagreements.csv: every tract where the two
 *    differ, for review. They are reported, never reconciled silently.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { CLEAN_DIR, STATES } from "../config";
import { unzipText } from "../lib/archive";
import { censusApiKey } from "../lib/env";
import { fetchCached, log, mapLimit } from "../lib/http";
import { readCsv, writeCsv } from "../lib/table";

export const CITY_POPULATION_THRESHOLD = 50_000;
/** Jurisdictions where Notice 2025-50 uses Census Designated Places. */
export const CDP_JURISDICTIONS: ReadonlySet<string> = new Set(["15", "72"]);

const PLACE_LIST_URL = "https://www2.census.gov/geo/docs/reference/codes2020/national_place2020.txt";
const UA_BLOCKS_URL = "https://www2.census.gov/geo/docs/reference/ua/2020_UA_BLOCKS.txt";
const bafUrl = (fips: string, usps: string) =>
  `https://www2.census.gov/geo/docs/maps-data/data/baf2020/BlockAssign_ST${fips}_${usps}.zip`;
const placePopUrl = (fips: string) =>
  `https://api.census.gov/data/2020/dec/pl?get=P1_001N&for=place:*&in=state:${fips}&key=${censusApiKey()}`;

export interface City {
  /** State FIPS + place FIPS, 7 digits. */
  key: string;
  name: string;
  population: number;
}

export type RuralVerdict =
  | { rural: true }
  | { rural: false; reason: "city"; city: City }
  | { rural: false; reason: "urban-area"; urbanArea: string; city: City };

export interface PlaceRecord {
  key: string;
  name: string;
  incorporated: boolean;
}

/** Which places count as a "city or town" under the Notice. */
export function qualifyingCities(
  places: Iterable<PlaceRecord>,
  population: ReadonlyMap<string, number>
): Map<string, City> {
  const out = new Map<string, City>();
  for (const p of places) {
    const pop = population.get(p.key);
    if (pop == null || pop <= CITY_POPULATION_THRESHOLD) continue;
    const counts = CDP_JURISDICTIONS.has(p.key.slice(0, 2)) ? !p.incorporated : p.incorporated;
    if (counts) out.set(p.key, { key: p.key, name: p.name, population: pop });
  }
  return out;
}

export interface UaBlock {
  block: string;
  uace: string;
  uaName: string;
}

/**
 * The statutory test on blocks. Returns a verdict only for tracts that are NOT
 * rural; any tract absent from the result is rural (if it has blocks at all).
 *
 * @param cityBlocks every block in a qualifying city, as [block GEOID, city key]
 * @param uaBlocks every block in any 2020 urban area
 */
export function classifyTracts(
  cities: ReadonlyMap<string, City>,
  cityBlocks: Iterable<[string, string]>,
  uaBlocks: Iterable<UaBlock>
): Map<string, RuralVerdict> {
  const verdicts = new Map<string, RuralVerdict>();
  // Block GEOIDs are 15 digits, which a double holds exactly; numbers keep the
  // few million city blocks affordable in memory.
  const cityOfBlock = new Map<number, string>();
  for (const [block, cityKey] of cityBlocks) {
    const city = cities.get(cityKey);
    if (!city) continue;
    cityOfBlock.set(Number(block), cityKey);
    const tract = block.slice(0, 11);
    if (!verdicts.has(tract)) verdicts.set(tract, { rural: false, reason: "city", city });
  }

  // One pass: which urban areas contain a city block, and which urban areas
  // each tract touches.
  const qualifyingUa = new Map<string, { name: string; city: City }>();
  const tractUas = new Map<string, Map<string, string>>();
  for (const b of uaBlocks) {
    if (!b.uace) continue;
    const cityKey = cityOfBlock.get(Number(b.block));
    if (cityKey && !qualifyingUa.has(b.uace)) qualifyingUa.set(b.uace, { name: b.uaName, city: cities.get(cityKey)! });
    const tract = b.block.slice(0, 11);
    let uas = tractUas.get(tract);
    if (!uas) tractUas.set(tract, (uas = new Map()));
    uas.set(b.uace, b.uaName);
  }

  for (const [tract, uas] of tractUas) {
    if (verdicts.has(tract)) continue;
    for (const uace of [...uas.keys()].sort()) {
      const q = qualifyingUa.get(uace);
      if (q) {
        verdicts.set(tract, { rural: false, reason: "urban-area", urbanArea: q.name, city: q.city });
        break;
      }
    }
  }
  return verdicts;
}

export type ExplanationStatus = "verified" | "unverified" | "not-computed";

/**
 * Plain-language reason for Treasury's rural flag on one tract. Verified when
 * the block test agrees with Treasury; otherwise the likely cause, marked
 * unverified.
 */
export function explain(
  verdict: RuralVerdict | null,
  treasuryRural: boolean
): { status: ExplanationStatus; text: string } {
  if (verdict == null) {
    return {
      status: "not-computed",
      text: treasuryRural
        ? "Treasury classifies this tract as rural. No block data covers this island area, so the reason is not reproduced."
        : "Treasury does not classify this tract as rural. No block data covers this island area, so the reason is not reproduced.",
    };
  }
  const where = (v: Exclusion) =>
    v.reason === "city"
      ? `it contains part of ${v.city.name} (${v.city.population.toLocaleString("en-US")} people in 2020)`
      : `it contains part of the ${v.urbanArea} urban area, which touches ${v.city.name} (${v.city.population.toLocaleString("en-US")} people in 2020)`;
  if (verdict.rural && treasuryRural) {
    return {
      status: "verified",
      text: "Rural: no part of the tract lies in a city over 50,000 or in an urban area touching one.",
    };
  }
  if (!verdict.rural && !treasuryRural) {
    return { status: "verified", text: `Not rural: ${where(verdict)}.` };
  }
  if (treasuryRural && !verdict.rural) {
    return {
      status: "unverified",
      text:
        `Treasury classifies this tract as rural. By blocks alone ${where(verdict)}; ` +
        "Treasury's method excludes detached parts of an urban area that do not themselves touch the city, which is the likely reason.",
    };
  }
  return {
    status: "unverified",
    text:
      "Treasury does not classify this tract as rural. No block of it lies in a city over 50,000 or in an urban area sharing a block with one; " +
      "the likely reason is an urban area that touches such a city only along a boundary.",
  };
}

type Exclusion = Exclude<RuralVerdict, { rural: true }>;

/** Lines of a large text buffer without materialising it as one string. */
export function* lines(buf: Buffer): Generator<string> {
  let start = 0;
  for (;;) {
    const nl = buf.indexOf(10, start);
    const end = nl < 0 ? buf.length : nl;
    let line = buf.toString("utf8", start, end);
    if (line.endsWith("\r")) line = line.slice(0, -1);
    if (line) yield line;
    if (nl < 0) return;
    start = nl + 1;
  }
}

function* parseUaBlocks(buf: Buffer): Generator<UaBlock> {
  const it = lines(buf);
  const header = it.next().value?.replace(/^﻿/, "").split("|") ?? [];
  const at = (n: string) => {
    const i = header.indexOf(n);
    if (i < 0) throw new Error(`2020_UA_BLOCKS.txt lacks ${n}; header ${header.join("|")}`);
    return i;
  };
  const g = at("GEOID");
  const u = at("2020_UACE");
  const n = at("2020_UA_NAME");
  for (const line of it) {
    const f = line.split("|");
    yield { block: f[g], uace: f[u], uaName: f[n] };
  }
}

function parsePlaceList(text: string): PlaceRecord[] {
  const rows = text.replace(/^﻿/, "").split(/\r?\n/).filter(Boolean).map((l) => l.split("|"));
  const h = rows[0];
  const at = (n: string) => {
    const i = h.indexOf(n);
    if (i < 0) throw new Error(`national_place2020.txt lacks ${n}`);
    return i;
  };
  const [st, pl, name, type] = [at("STATEFP"), at("PLACEFP"), at("PLACENAME"), at("TYPE")];
  return rows.slice(1).map((r) => ({
    key: r[st] + r[pl],
    name: r[name],
    incorporated: r[type] === "INCORPORATED PLACE",
  }));
}

async function placePopulations(): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const perState = await mapLimit(STATES, 6, async (s) => {
    const buf = await fetchCached(placePopUrl(s.fips), `pl2020-place-pop-${s.fips}.json`);
    const text = buf.toString("utf8");
    if (text.trimStart().startsWith("<")) throw new Error(`Census API returned an HTML error page for places in ${s.usps}`);
    return JSON.parse(text) as string[][];
  });
  for (const table of perState) {
    const [h, ...rows] = table;
    const [p, st, pl] = [h.indexOf("P1_001N"), h.indexOf("state"), h.indexOf("place")];
    for (const r of rows) out.set(r[st] + r[pl], Number(r[p]));
  }
  return out;
}

/** [block, city key] for every block inside a qualifying city, state by state. */
async function* cityBlocks(cities: ReadonlyMap<string, City>): AsyncGenerator<[string, string]> {
  for (const s of STATES) {
    const zip = await fetchCached(bafUrl(s.fips, s.usps), `baf2020-${s.fips}.zip`);
    const [file] = unzipText(zip, /_INCPLACE_CDP\.txt$/);
    if (!file) throw new Error(`No INCPLACE_CDP file in the ${s.usps} block assignment zip`);
    for (const line of file.text.split(/\r?\n/).slice(1)) {
      const [block, placefp] = line.split("|");
      if (!placefp) continue;
      const key = s.fips + placefp.trim();
      if (cities.has(key)) yield [block, key];
    }
  }
}

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of gen) out.push(x);
  return out;
}

export async function buildOz2Rural(): Promise<void> {
  const eligibleFile = path.join(CLEAN_DIR, "oz2_eligible.csv");
  const ctFile = path.join(CLEAN_DIR, "ct_tracts.csv");
  if (!existsSync(eligibleFile)) throw new Error("Run pipeline/oz2/eligible.ts first: it carries Treasury's rural flag");
  if (!existsSync(ctFile)) throw new Error("Run pipeline/crosswalk/connecticut.ts first: Connecticut GEOIDs need mapping");

  const places = parsePlaceList((await fetchCached(PLACE_LIST_URL, "national_place2020.txt")).toString("utf8"));
  const cities = qualifyingCities(places, await placePopulations());
  log(`rural: ${cities.size} qualifying cities over ${CITY_POPULATION_THRESHOLD.toLocaleString("en-US")}`);

  const blocks = await collect(cityBlocks(cities));
  log(`rural: ${blocks.length.toLocaleString("en-US")} blocks inside those cities`);
  const uaBuf = await fetchCached(UA_BLOCKS_URL, "2020_UA_BLOCKS.txt", { timeoutMs: 900_000 });
  const verdicts = classifyTracts(cities, blocks, parseUaBlocks(uaBuf));

  // Treasury keys Connecticut by planning region; blocks use 2020 Census codes.
  const ct = readCsv(ctFile);
  const ctToCensus = new Map(ct.rows.map((r) => [r[ct.col("geoid_planning_region")], r[ct.col("geoid_census2020")]]));
  const treasury = readCsv(eligibleFile);
  const [g, ru] = [treasury.col("geoid20"), treasury.col("rural")];

  const rows: Array<Array<string | boolean | number | null>> = [];
  const disagreements: typeof rows = [];
  const tally = { tracts: 0, computed: 0, rural: 0, agree: 0, treasuryRuralWeSayNot: 0, weSayRuralTreasuryNot: 0 };
  for (const r of treasury.rows) {
    const geoid = r[g];
    const censusGeoid = geoid.startsWith("09") ? (ctToCensus.get(geoid) ?? geoid) : geoid;
    const treasuryRural = r[ru] === "1";
    tally.tracts++;
    // Island areas have no block assignment files: leave to Treasury.
    const covered = STATES.some((s) => s.fips === geoid.slice(0, 2));
    const v: RuralVerdict | null = covered ? (verdicts.get(censusGeoid) ?? { rural: true }) : null;
    if (v) tally.computed++;
    if (v?.rural) tally.rural++;
    const agrees = v == null ? null : v.rural === treasuryRural;
    if (agrees) tally.agree++;
    if (agrees === false) {
      if (treasuryRural) tally.treasuryRuralWeSayNot++;
      else tally.weSayRuralTreasuryNot++;
    }
    const why = explain(v, treasuryRural);
    const row = [
      geoid,
      treasuryRural,
      v == null ? null : v.rural,
      agrees,
      v == null || v.rural ? null : v.reason,
      v == null || v.rural ? null : v.city.name,
      v == null || v.rural ? null : v.city.population,
      v != null && !v.rural && v.reason === "urban-area" ? v.urbanArea : null,
      why.status,
      why.text,
    ];
    rows.push(row);
    if (agrees === false) disagreements.push(row);
  }

  const header = [
    "geoid20",
    "treasury_rural",
    "rural_by_blocks",
    "agrees",
    "not_rural_reason",
    "city",
    "city_population",
    "urban_area",
    "explanation_status",
    "explanation",
  ];
  writeCsv(path.join(CLEAN_DIR, "oz2_rural.csv"), header, rows);
  writeCsv(path.join(CLEAN_DIR, "oz2_rural_disagreements.csv"), header, disagreements);
  for (const [k, v] of Object.entries(tally)) log(`rural: ${k.padEnd(24)} ${v.toLocaleString("en-US")}`);
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  buildOz2Rural().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
