/**
 * New housing units authorized by building permits, by county, from the Census
 * Bureau's Building Permits Survey (BPS) annual county files.
 *
 * The current, but coarse, side of "is anyone building here": no public source
 * tracks construction starts by tract, so this county figure sits beside the
 * lagging tract-level "built 2020 or later" share from the ACS
 * (pipeline/acs/housingAge.ts). County-level and labeled so.
 *
 * Uses the estimates that include imputation for non-reporting permit offices
 * (the first four column groups), not the "reported only" groups. Permits
 * authorize construction; they are not completions.
 *
 * The newest annual file is found by trying years from the current one back.
 * The prior year is loaded too, for the change; a county missing from either
 * year (e.g. a boundary change) gets no change rather than a wrong one.
 *
 * Output: pipeline/clean/bps_county.csv
 */

import path from "node:path";
import { CLEAN_DIR } from "../config";
import { fetchCached, log } from "../lib/http";
import { writeCsv } from "../lib/table";

const url = (year: number) => `https://www2.census.gov/econ/bps/County/co${year}a.txt`;

export interface CountyPermits {
  county: string;
  name: string;
  units1: number;
  units2to4: number;
  units5plus: number;
  unitsTotal: number;
  valueDollars: number;
}

export function parseBps(text: string): Map<string, CountyPermits> {
  const out = new Map<string, CountyPermits>();
  for (const line of text.split(/\r?\n/)) {
    const f = line.split(",");
    // Data rows start with a 4-digit year; the two header lines and blanks do not.
    if (!/^\d{4}$/.test(f[0]?.trim() ?? "") || f.length < 18) continue;
    const n = (i: number) => {
      const v = Number(f[i]);
      return Number.isFinite(v) ? v : 0;
    };
    const county = f[1].trim().padStart(2, "0") + f[2].trim().padStart(3, "0");
    const units1 = n(7);
    const units2 = n(10);
    const units34 = n(13);
    const units5 = n(16);
    out.set(county, {
      county,
      name: f[5].trim(),
      units1,
      units2to4: units2 + units34,
      units5plus: units5,
      unitsTotal: units1 + units2 + units34 + units5,
      valueDollars: n(8) + n(11) + n(14) + n(17),
    });
  }
  return out;
}

async function latestYear(): Promise<{ year: number; text: string }> {
  for (let year = new Date().getUTCFullYear(); year >= 2020; year--) {
    try {
      return { year, text: (await fetchCached(url(year), `bps-county-${year}a.txt`, { retries: 1 })).toString("latin1") };
    } catch {
      // Not published yet: try the year before.
    }
  }
  throw new Error("No Building Permits Survey annual county file found for 2020 onward");
}

export async function buildBps(): Promise<void> {
  const { year, text } = await latestYear();
  const current = parseBps(text);
  const prior = parseBps((await fetchCached(url(year - 1), `bps-county-${year - 1}a.txt`)).toString("latin1"));
  const rows = [...current.values()]
    .sort((a, b) => (a.county < b.county ? -1 : 1))
    .map((c) => {
      const p = prior.get(c.county);
      const change = p && p.unitsTotal > 0 ? Math.round(((c.unitsTotal - p.unitsTotal) / p.unitsTotal) * 1e4) / 1e4 : null;
      return [c.county, c.name, year, c.unitsTotal, c.units1, c.units2to4, c.units5plus, c.valueDollars, p?.unitsTotal ?? null, change];
    });
  writeCsv(
    path.join(CLEAN_DIR, "bps_county.csv"),
    [
      "county_fips",
      "county_name",
      "year",
      "units_permitted",
      "units_1",
      "units_2_to_4",
      "units_5_plus",
      "value_dollars",
      "units_permitted_prior_year",
      "change_from_prior_year",
    ],
    rows
  );
  const total = [...current.values()].reduce((s, c) => s + c.unitsTotal, 0);
  log(`bps ${year}: ${current.size.toLocaleString("en-US")} counties, ${total.toLocaleString("en-US")} units permitted`);
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  buildBps().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
