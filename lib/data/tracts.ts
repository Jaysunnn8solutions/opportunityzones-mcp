/**
 * Runtime access to the published tract data (pipeline/publish.ts): loaded
 * once per server instance from data/, then served from memory.
 *
 * Everything here is public data about places. Nothing about users is read or
 * written.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { designationOutlook, type DesignationOutlook } from "../oz/designation";
import { ruralExplanation } from "../oz/ruralExplanation";
import { decodePayload, type Payload } from "./columnar";

export interface ManifestColumn {
  name: string;
  unit?: string;
  description?: string;
  source: string;
}

export interface ManifestSource {
  id: string;
  name: string;
  publisher: string;
  vintage: string;
  geography: string;
  attribution: string;
}

export interface Manifest {
  generated: string;
  tracts: number;
  disclaimer: string;
  columns: ManifestColumn[];
  sources: ManifestSource[];
}

interface Lookups {
  states: Record<string, string>;
  counties: Record<string, { name: string; cbsa: number | null }>;
  cbsas: string[];
  ruralNames: string[];
  permits: Record<string, { year: number; units: number; units5plus: number; change: number | null }>;
  /** States whose 2027 designations Treasury has certified, and when. Absent in data published before the list. */
  designation?: { certified: Record<string, string> };
}

export interface TractData {
  payload: Payload;
  lookups: Lookups;
  manifest: Manifest;
}

let cached: TractData | null = null;

export function dataDir(): string {
  return process.env.OZ_DATA_DIR ?? path.join(process.cwd(), "data");
}

export function loadTractData(): TractData {
  if (cached) return cached;
  const dir = dataDir();
  cached = {
    payload: decodePayload(readFileSync(path.join(dir, "tracts.bin"))),
    lookups: JSON.parse(readFileSync(path.join(dir, "lookups.json"), "utf8")) as Lookups,
    manifest: JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8")) as Manifest,
  };
  return cached;
}

export interface Measure {
  name: string;
  value: number | null;
  unit: string | null;
  description: string | null;
  source: string;
}

export interface TractProfile {
  geoid: string;
  state: string | null;
  county: string | null;
  countyFips: string;
  cbsa: string | null;
  measures: Record<string, Measure>;
  rural: { treasury: boolean | null; explanation: string; explanationStatus: string };
  countyPermits: Lookups["permits"][string] | null;
  /** Where the tract stands in the 2027 designation round (lib/oz/designation.ts). */
  designation2027: DesignationOutlook;
}

const eligibleByState = new WeakMap<TractData, Map<string, number>>();

/** How far Treasury's 2027 designations have been published. */
export function designationPublication(data: TractData = loadTractData()): { certified: number; jurisdictions: number; latest: string | null } {
  const certified = Object.values(data.lookups.designation?.certified ?? {});
  const jurisdictions = Object.keys(data.lookups.states).filter((f) => stateEligibleCount(f, data) > 0).length;
  return { certified: certified.length, jurisdictions, latest: certified.length ? certified.sort().at(-1)! : null };
}

/** One sentence on the state of publication, for banners and summaries. */
export function designationNote(data: TractData = loadTractData()): string {
  const p = designationPublication(data);
  if (p.certified === 0) return "The 2027 designations are not yet published.";
  if (p.certified < p.jurisdictions) {
    return `Treasury has certified 2027 designations for ${p.certified} of ${p.jurisdictions} states and territories; the rest are pending.`;
  }
  return "Treasury has certified the 2027 designations for every state and territory.";
}

/** Nationally: eligible tracts, and the most all states together may designate. */
export function designationRoundTotals(data: TractData = loadTractData()): { eligible: number; maxDesignated: number; jurisdictions: number } {
  let eligible = 0;
  let maxDesignated = 0;
  let jurisdictions = 0;
  for (const fips of Object.keys(data.lookups.states)) {
    const n = stateEligibleCount(fips, data);
    if (n === 0) continue;
    jurisdictions++;
    eligible += n;
    maxDesignated += designationOutlook(1, null, n).stateCap;
  }
  return { eligible, maxDesignated, jurisdictions };
}

/** Every state and territory with eligible tracts: name, eligible count and cap, by FIPS. */
export function designationRoundByState(data: TractData = loadTractData()): Array<{ fips: string; name: string; eligible: number; cap: number }> {
  return Object.entries(data.lookups.states)
    .map(([fips, name]) => ({ fips, name, eligible: stateEligibleCount(fips, data), cap: designationOutlook(1, null, stateEligibleCount(fips, data)).stateCap }))
    .filter((s) => s.eligible > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Eligible tracts per state or territory, from Treasury's 2027 list. */
export function stateEligibleCount(stateFips: string, data: TractData = loadTractData()): number {
  let counts = eligibleByState.get(data);
  if (!counts) {
    counts = new Map();
    const eligible = data.payload.columns.get("eligible_2027");
    for (let i = 0; i < data.payload.count; i++) {
      if (eligible?.get(i) !== 1) continue;
      const s = data.payload.geoids[i].slice(0, 2);
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    eligibleByState.set(data, counts);
  }
  return counts.get(stateFips) ?? 0;
}

export const GEOID = /^\d{11}$/;

export function getTract(geoid: string, data: TractData = loadTractData()): TractProfile | null {
  if (!GEOID.test(geoid)) return null;
  const i = data.payload.indexOf(geoid);
  if (i < 0) return null;
  const v = (name: string) => data.payload.columns.get(name)?.get(i) ?? null;

  const measures: Record<string, Measure> = {};
  for (const c of data.manifest.columns) {
    measures[c.name] = { name: c.name, value: v(c.name), unit: c.unit ?? null, description: c.description ?? null, source: c.source };
  }

  const county = geoid.slice(0, 5);
  const countyInfo = data.lookups.counties[county];
  const treasuryRural = v("rural_2027");
  const byBlocks = v("rural_by_blocks");
  const reason = v("rural_reason");
  const cityIdx = v("rural_city");
  const uaIdx = v("rural_urban_area");
  const [cityName, cityPop] = cityIdx != null ? data.lookups.ruralNames[cityIdx].split("|") : [null, null];
  const explanation = ruralExplanation(
    treasuryRural === 1,
    byBlocks == null
      ? null
      : byBlocks === 1
        ? { rural: true }
        : {
            rural: false,
            reason: reason === 2 ? "urban-area" : "city",
            cityName: cityName ?? "a city over 50,000",
            cityPopulation: Number(cityPop) || 0,
            urbanArea: uaIdx != null ? data.lookups.ruralNames[uaIdx] : null,
          }
  );

  return {
    geoid,
    state: data.lookups.states[geoid.slice(0, 2)] ?? null,
    county: countyInfo?.name ?? null,
    countyFips: county,
    cbsa: countyInfo?.cbsa != null ? data.lookups.cbsas[countyInfo.cbsa] : null,
    measures,
    rural: {
      treasury: treasuryRural == null ? null : treasuryRural === 1,
      explanation: explanation.text,
      explanationStatus: explanation.status,
    },
    countyPermits: data.lookups.permits[county] ?? null,
    designation2027: designationOutlook(
      v("eligible_2027"),
      data.lookups.states[geoid.slice(0, 2)] ?? null,
      stateEligibleCount(geoid.slice(0, 2), data),
      v("designated_2027"),
      data.lookups.designation?.certified[geoid.slice(0, 2)] ?? null
    ),
  };
}
