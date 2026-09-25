/**
 * HUD Small Area Fair Market Rents, FY2026: HUD's 40th-percentile gross rent
 * by ZIP Code, for studio to four-bedroom units. HUD's FY2026 table covers
 * non-metropolitan areas too (24,599 of 51,895 rows), and there too the rents
 * vary by ZIP, so they are ZIP-level figures everywhere, not county FMRs
 * repeated; each ZIP carries its HUD area type.
 *
 * A feasibility measure of what rent a rental project in a place could expect
 * to be benchmarked against. It is ZIP-level, not tract-level, and every output
 * says so.
 *
 * Source: HUD's own ArcGIS service (owner HUD.Official.Content), table
 * "SAFMR_table", which needs no key. The HUD USER API would need a token and
 * huduser.gov answers scripts with an empty HTTP 202, so it is not used.
 *
 * Outputs:
 *  - pipeline/clean/hud_safmr_zip.csv: every ZIP's rents, small enough to
 *    bundle, so a site lookup can use the exact ZIP the geocoder returns;
 *  - pipeline/clean/hud_safmr_by_tract.csv: per 2020 tract, the two-bedroom
 *    SAFMR averaged over the ZCTAs that overlap it, weighted by land area, with
 *    the range and the share of the tract's land covered. A tract whose land
 *    touches no listed ZIP has no value (empty, never zero).
 *
 * A ZIP straddling two HUD areas is listed once per area. On the FY2026 table
 * its rents are identical in every area; the stage checks that on every run
 * and fails if it ever stops being true, rather than keeping one arbitrarily.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { CLEAN_DIR } from "../config";
import { queryAllAttributes } from "../lib/arcgis";
import { fetchCached, log } from "../lib/http";
import { parseDelimited, readCsv, writeCsv } from "../lib/table";

const TABLE = "https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/HUD_PDR_Small_Area_Fair_Market_Rents/FeatureServer/1";
const ZCTA_TRACT_URL = "https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_tract20_natl.txt";

export interface SafmrZip {
  zip: string;
  hudArea: string;
  areaName: string;
  areaType: "metro" | "nonmetro";
  rents: [number | null, number | null, number | null, number | null, number | null];
}

/** One row per ZIP; throws if a ZIP listed in several HUD areas has different rents in them. */
export function dedupeZips(rows: readonly SafmrZip[]): Map<string, SafmrZip> {
  const out = new Map<string, SafmrZip>();
  for (const z of rows) {
    const prev = out.get(z.zip);
    if (!prev) {
      out.set(z.zip, z);
      continue;
    }
    if (prev.rents.join("/") !== z.rents.join("/")) {
      throw new Error(
        `SAFMR ZIP ${z.zip} has different rents in ${prev.hudArea} and ${z.hudArea}; choosing one would be arbitrary`
      );
    }
  }
  return out;
}

export function parseSafmr(attrs: Record<string, unknown>): SafmrZip | null {
  const zip = String(attrs.ID ?? attrs.ZCTA_ID ?? "").trim();
  if (!/^\d{5}$/.test(zip)) return null;
  const r = (k: string) => {
    const v = Number(attrs[k]);
    return Number.isFinite(v) && v > 0 ? v : null;
  };
  const hudArea = String(attrs.HUD_CODE ?? "");
  return {
    zip,
    hudArea,
    areaName: String(attrs.FMR_NAME ?? ""),
    areaType: hudArea.startsWith("METRO") ? "metro" : "nonmetro",
    rents: [r("SAFMR_0BR"), r("SAFMR_1BR"), r("SAFMR_2BR"), r("SAFMR_3BR"), r("SAFMR_4BR")],
  };
}

export interface TractRent {
  twoBedroomWeighted: number | null;
  twoBedroomMin: number | null;
  twoBedroomMax: number | null;
  /** Share of the tract's land in ZCTAs that have a SAFMR. */
  landCovered: number;
}

/** Land-weighted two-bedroom SAFMR per tract. */
export function rentsByTract(
  zips: ReadonlyMap<string, SafmrZip>,
  parts: Iterable<{ zcta: string; tract: string; landPart: number; tractLand: number }>
): Map<string, TractRent> {
  const acc = new Map<string, { w: number; sum: number; min: number; max: number; land: number }>();
  for (const p of parts) {
    const rent = zips.get(p.zcta)?.rents[2];
    const a = acc.get(p.tract) ?? { w: 0, sum: 0, min: Infinity, max: -Infinity, land: p.tractLand };
    if (rent != null && p.landPart > 0) {
      a.w += p.landPart;
      a.sum += rent * p.landPart;
      a.min = Math.min(a.min, rent);
      a.max = Math.max(a.max, rent);
    }
    acc.set(p.tract, a);
  }
  const out = new Map<string, TractRent>();
  for (const [tract, a] of acc) {
    out.set(tract, {
      twoBedroomWeighted: a.w > 0 ? Math.round(a.sum / a.w) : null,
      twoBedroomMin: a.w > 0 ? a.min : null,
      twoBedroomMax: a.w > 0 ? a.max : null,
      landCovered: a.land > 0 ? Math.round(Math.min(1, a.w / a.land) * 1e4) / 1e4 : 0,
    });
  }
  return out;
}

export async function buildSafmr(): Promise<void> {
  const ctFile = path.join(CLEAN_DIR, "ct_tracts.csv");
  if (!existsSync(ctFile)) throw new Error("Run pipeline/crosswalk/connecticut.ts first: Connecticut GEOIDs need mapping");
  const ct = readCsv(ctFile);
  const toPlanning = new Map(ct.rows.map((r) => [r[ct.col("geoid_census2020")], r[ct.col("geoid_planning_region")]]));

  const rows = await queryAllAttributes({
    layer: TABLE,
    outFields: ["ID", "ZCTA_ID", "HUD_CODE", "FMR_NAME", "SAFMR_0BR", "SAFMR_1BR", "SAFMR_2BR", "SAFMR_3BR", "SAFMR_4BR"],
    cacheKey: "hud-safmr-fy2026",
  });
  const parsed = rows.map(parseSafmr).filter((z): z is SafmrZip => z != null);
  const zips = dedupeZips(parsed);
  log(`safmr: ${parsed.length - zips.size} repeat listings of ZIPs straddling HUD areas, all with identical rents`);

  const rel = parseDelimited((await fetchCached(ZCTA_TRACT_URL, "tab20_zcta520_tract20_natl.txt")).toString("utf8"), "|");
  const [z, t, lp, tl] = ["GEOID_ZCTA5_20", "GEOID_TRACT_20", "AREALAND_PART", "AREALAND_TRACT_20"].map((c) => rel.col(c));
  const parts = rel.rows
    .filter((r) => r[z] && r[t])
    .map((r) => ({ zcta: r[z], tract: toPlanning.get(r[t]) ?? r[t], landPart: Number(r[lp]) || 0, tractLand: Number(r[tl]) || 0 }));
  const byTract = rentsByTract(zips, parts);

  writeCsv(
    path.join(CLEAN_DIR, "hud_safmr_zip.csv"),
    ["zip", "hud_area", "area_name", "area_type", "safmr_0br", "safmr_1br", "safmr_2br", "safmr_3br", "safmr_4br"],
    [...zips.values()]
      .sort((a, b) => (a.zip < b.zip ? -1 : 1))
      .map((s) => [s.zip, s.hudArea, s.areaName, s.areaType, ...s.rents])
  );
  const withRent = [...byTract.entries()].filter(([, r]) => r.twoBedroomWeighted != null);
  writeCsv(
    path.join(CLEAN_DIR, "hud_safmr_by_tract.csv"),
    ["geoid20", "safmr_2br_land_weighted", "safmr_2br_min", "safmr_2br_max", "safmr_land_covered"],
    withRent
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([g, r]) => [g, r.twoBedroomWeighted, r.twoBedroomMin, r.twoBedroomMax, r.landCovered])
  );
  log(`safmr: ${zips.size.toLocaleString("en-US")} ZIPs; ${withRent.length.toLocaleString("en-US")} tracts overlap at least one`);
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  buildSafmr().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
