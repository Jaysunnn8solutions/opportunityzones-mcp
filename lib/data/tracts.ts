/**
 * Runtime access to the published tract data (pipeline/publish.ts): loaded
 * once per server instance from data/, then served from memory.
 *
 * Everything here is public data about places. Nothing about users is read or
 * written.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
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
  };
}
