/**
 * Every state and territory with eligible tracts, with its postal code, the
 * 2027 cap, and a map view that frames its tracts. Server-side; passed to the
 * Start page search and the guided check.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { STATE_FIPS } from "@/lib/geo/states";
import { designationRoundByState } from "./tracts";

export interface StateSummary {
  fips: string;
  name: string;
  usps: string;
  eligible: number;
  cap: number;
  /** [lon, lat, zoom] framing the state's tracts on the map, if known. */
  view: [number, number, number] | null;
}

function views(): Record<string, [number, number, number]> {
  try {
    const index = JSON.parse(readFileSync(path.join(process.cwd(), "public", "boundaries", "index.json"), "utf8")) as {
      states: Record<string, { bbox: [number, number, number, number] }>;
    };
    const out: Record<string, [number, number, number]> = {};
    for (const [fips, { bbox }] of Object.entries(index.states)) {
      const [w, s, e, n] = bbox;
      const span = Math.max(e - w, n - s);
      out[fips] = [Number(((w + e) / 2).toFixed(4)), Number(((s + n) / 2).toFixed(4)), Number(Math.max(4, Math.min(10, Math.log2(700 / span))).toFixed(2))];
    }
    return out;
  } catch {
    return {};
  }
}

export function stateSummaries(): StateSummary[] {
  const v = views();
  const usps = new Map(Object.entries(STATE_FIPS).map(([code, fips]) => [fips, code]));
  return designationRoundByState().map((s) => ({ ...s, usps: usps.get(s.fips) ?? "", view: v[s.fips] ?? null }));
}
