/**
 * HUD Qualified Census Tracts and Difficult Development Areas, 2026, by 2020
 * tract.
 *
 * Why they matter here: a LIHTC building in a QCT or DDA may take a 30% boost
 * to eligible basis (IRC § 42(d)(5)(B)), which is one of the most common
 * incentives stacked with an Opportunity Zone investment. The product states
 * the designation; it does not say a project qualifies for the boost.
 *
 * Fetched from HUD's own ArcGIS services (owner HUD.Official.Content), because
 * huduser.gov answers scripted requests with an empty HTTP 202.
 *
 * Geography, which differs between the two and is reported as such:
 *  - QCTs are 2020 census tracts (Connecticut in planning-region GEOIDs, as in
 *    Treasury's 2027 file), so they join directly.
 *  - DDAs are ZIP Code Tabulation Areas in metro areas ("SA", small-area DDAs)
 *    and whole counties outside them ("NM"). A county DDA covers all its
 *    tracts. Three non-metro DDAs are not counties: American Samoa and the
 *    Northern Mariana Islands (whole territory), and Puerto Rico's single
 *    "Nonmetro Area", applied to the Puerto Rico tracts whose internal point
 *    falls inside HUD's polygon for it. A ZCTA DDA is carried to tracts by the Census ZCTA-to-tract
 *    relationship file as the share of the tract's land inside DDA ZCTAs;
 *    a tract can be partly in one. That share is labelled as derived from ZCTAs.
 *
 * Output: pipeline/clean/hud_qct_dda.csv
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { booleanPointInPolygon, point } from "@turf/turf";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { CLEAN_DIR } from "../config";
import { queryAllAttributes } from "../lib/arcgis";
import { tractPoints } from "../lib/gazetteer";
import { fetchCached, log } from "../lib/http";
import { parseDelimited, readCsv, writeCsv } from "../lib/table";

const HUD = "https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services";
const QCT_LAYER = `${HUD}/QUALIFIED_CENSUS_TRACTS_2026/FeatureServer/0`;
const DDA_LAYER = `${HUD}/Difficult_Development_Areas_2026/FeatureServer/0`;
const ZCTA_TRACT_URL = "https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_tract20_natl.txt";

/**
 * What a non-metro DDA covers. Usually a county; for island territories HUD
 * uses a whole-territory code (`69999`, `60999`), and for Puerto Rico a single
 * "Nonmetro Area" (`72923`) covering every municipio outside a metro area.
 */
export type DdaArea =
  | { kind: "county"; fips: string }
  | { kind: "territory"; stateFips: string }
  | { kind: "nonmetro"; stateFips: string };

export interface DdaRow {
  type: "SA" | "NM";
  /** ZCTA for small-area DDAs. */
  zcta: string | null;
  /** Coverage of non-metro DDAs. */
  area: DdaArea | null;
  name: string;
}

export interface ZctaPart {
  zcta: string;
  /** 2020 Census tract GEOID (Connecticut in 2020 county codes). */
  tract: string;
  landPart: number;
  tractLand: number;
}

export interface HudOverlay {
  qct: boolean;
  /** Name of the non-metro county DDA the tract lies in, if any. */
  ddaCounty: string | null;
  /** Share of the tract's land inside small-area (ZCTA) DDAs, 0-1. */
  ddaZctaLandShare: number;
  /** "all", "part" or "none", from the county DDA or the ZCTA land share. */
  dda: "all" | "part" | "none";
}

export function parseDda(attrs: Record<string, unknown>): DdaRow {
  const type = String(attrs.DDA_TYPE ?? "");
  const code = String(attrs.DDA_CODE ?? "");
  const name = String(attrs.DDA_NAME ?? "");
  if (type === "SA") {
    const zcta = String(attrs.ZCTA5 ?? "").trim();
    if (!/^\d{5}$/.test(zcta)) throw new Error(`Small-area DDA ${code} has no valid ZCTA`);
    return { type, zcta, area: null, name };
  }
  if (type === "NM") {
    const m = /^NCNTY(\d{5})/.exec(code);
    if (!m) throw new Error(`Non-metro DDA code ${code} does not name a county; the format changed`);
    const fips = m[1];
    let area: DdaArea;
    if (fips.endsWith("999")) area = { kind: "territory", stateFips: fips.slice(0, 2) };
    else if (fips === "72923" && /nonmetro/i.test(name)) area = { kind: "nonmetro", stateFips: "72" };
    else area = { kind: "county", fips };
    return { type, zcta: null, area, name };
  }
  throw new Error(`Unknown DDA_TYPE "${type}" for ${code}`);
}

/** The non-metro DDA a tract lies in, by county, territory or Puerto Rico's nonmetro area. */
function nonMetroDda(tract: string, ddas: readonly DdaRow[], nonMetroTracts: ReadonlySet<string>): string | null {
  for (const d of ddas) {
    const a = d.area;
    if (!a) continue;
    if (a.kind === "county" && tract.startsWith(a.fips)) return d.name;
    if (a.kind === "territory" && tract.startsWith(a.stateFips)) return d.name;
    if (a.kind === "nonmetro" && tract.startsWith(a.stateFips) && nonMetroTracts.has(tract)) return d.name;
  }
  return null;
}

/**
 * @param tracts the tract universe, as Treasury keys it (Connecticut by planning region)
 * @param toUniverse maps a 2020 Census tract GEOID to the universe's GEOID, where they differ
 * @param nonMetroTracts tracts outside any metro area, for Puerto Rico's single nonmetro DDA
 */
export function overlay(
  tracts: readonly string[],
  qctGeoids: ReadonlySet<string>,
  ddas: readonly DdaRow[],
  zctaParts: Iterable<ZctaPart>,
  toUniverse: ReadonlyMap<string, string> = new Map(),
  nonMetroTracts: ReadonlySet<string> = new Set()
): Map<string, HudOverlay> {
  const ddaZctas = new Set(ddas.filter((d) => d.type === "SA").map((d) => d.zcta!));
  const nm = ddas.filter((d) => d.type === "NM");

  const inDda = new Map<string, number>();
  const land = new Map<string, number>();
  for (const p of zctaParts) {
    const t = toUniverse.get(p.tract) ?? p.tract;
    land.set(t, p.tractLand);
    if (ddaZctas.has(p.zcta)) inDda.set(t, (inDda.get(t) ?? 0) + p.landPart);
  }

  const out = new Map<string, HudOverlay>();
  for (const t of tracts) {
    const ddaCounty = nonMetroDda(t, nm, nonMetroTracts);
    const tractLand = land.get(t) ?? 0;
    const share = tractLand > 0 ? Math.min(1, (inDda.get(t) ?? 0) / tractLand) : 0;
    const dda = ddaCounty || share >= 0.999 ? "all" : share > 0 ? "part" : "none";
    out.set(t, { qct: qctGeoids.has(t), ddaCounty, ddaZctaLandShare: Math.round(share * 1e4) / 1e4, dda });
  }
  return out;
}

/**
 * Puerto Rico tracts inside HUD's "Puerto Rico Nonmetro Area" DDA, by testing
 * each tract's Gazetteer internal point against HUD's own polygon. (Inferring
 * it from "no CBSA" was tried and rejected: those tracts cover three times the
 * polygon's area.)
 */
async function puertoRicoNonmetroTracts(): Promise<Set<string>> {
  const u = new URL(`${DDA_LAYER}/query`);
  u.searchParams.set("where", "DDA_CODE LIKE 'NCNTY72923%'");
  u.searchParams.set("outFields", "DDA_CODE");
  u.searchParams.set("returnGeometry", "true");
  u.searchParams.set("outSR", "4326");
  u.searchParams.set("f", "geojson");
  const fc = JSON.parse((await fetchCached(u.toString(), "hud-dda-2026-pr-nonmetro.geojson")).toString("utf8")) as {
    features: Array<Feature<Polygon | MultiPolygon>>;
  };
  if (fc.features.length !== 1) throw new Error(`Expected one Puerto Rico nonmetro DDA polygon, got ${fc.features.length}`);
  const poly = fc.features[0];
  const inside = new Set<string>();
  let landM2 = 0;
  for (const p of await tractPoints()) {
    if (!p.geoid.startsWith("72")) continue;
    if (booleanPointInPolygon(point([p.lon, p.lat]), poly)) {
      inside.add(p.geoid);
      landM2 += p.landM2;
    }
  }
  log(`hud: Puerto Rico nonmetro DDA holds ${inside.size} tract internal points, ${Math.round(landM2 / 1e6)} km² of land`);
  return inside;
}

export async function buildHudQctDda(): Promise<void> {
  const eligibleFile = path.join(CLEAN_DIR, "oz2_eligible.csv");
  const ctFile = path.join(CLEAN_DIR, "ct_tracts.csv");
  if (!existsSync(eligibleFile) || !existsSync(ctFile)) {
    throw new Error("Run the OZ 2.0 eligible and Connecticut stages first");
  }
  const treasury = readCsv(eligibleFile);
  const universe = treasury.rows.map((r) => r[treasury.col("geoid20")]);
  const universeSet = new Set(universe);
  const nonMetroTracts = await puertoRicoNonmetroTracts();
  const ct = readCsv(ctFile);
  const toUniverse = new Map(ct.rows.map((r) => [r[ct.col("geoid_census2020")], r[ct.col("geoid_planning_region")]]));

  const qct = new Set(
    (await queryAllAttributes({ layer: QCT_LAYER, outFields: ["GEOID"], cacheKey: "hud-qct-2026" })).map((a) =>
      String(a.GEOID)
    )
  );
  const ddas = (
    await queryAllAttributes({
      layer: DDA_LAYER,
      outFields: ["ZCTA5", "DDA_CODE", "DDA_TYPE", "DDA_NAME"],
      cacheKey: "hud-dda-2026",
    })
  ).map(parseDda);

  const rel = parseDelimited((await fetchCached(ZCTA_TRACT_URL, "tab20_zcta520_tract20_natl.txt")).toString("utf8"), "|");
  const [z, t, lp, tl] = ["GEOID_ZCTA5_20", "GEOID_TRACT_20", "AREALAND_PART", "AREALAND_TRACT_20"].map((c) => rel.col(c));
  const parts: ZctaPart[] = rel.rows
    .filter((r) => r[z] && r[t])
    .map((r) => ({ zcta: r[z], tract: r[t], landPart: Number(r[lp]) || 0, tractLand: Number(r[tl]) || 0 }));

  const result = overlay(universe, qct, ddas, parts, toUniverse, nonMetroTracts);

  const counties = new Set(universe.map((g) => g.slice(0, 5)));
  const orphanCounties = ddas.filter((d) => d.area?.kind === "county" && !counties.has(d.area.fips));
  if (orphanCounties.length > 0) {
    throw new Error(
      `Non-metro DDAs name counties with no tract in the universe (old Connecticut codes?): ` +
        orphanCounties.map((d) => `${d.area?.kind === "county" ? d.area.fips : ""} ${d.name}`).join(", ")
    );
  }
  for (const d of ddas.filter((x) => x.area && x.area.kind !== "county")) {
    const n = universe.filter((g) => nonMetroDda(g, [d], nonMetroTracts)).length;
    log(`hud: non-county DDA "${d.name}" (${d.area!.kind}) covers ${n} tracts`);
  }
  const qctOutside = [...qct].filter((g) => !universeSet.has(g));
  if (qctOutside.length > 0) log(`hud: ${qctOutside.length} QCT GEOIDs not in the 2020 tract universe: ${qctOutside.slice(0, 10).join(", ")}`);
  const tally = { qct: 0, ddaAll: 0, ddaPart: 0 };
  for (const o of result.values()) {
    if (o.qct) tally.qct++;
    if (o.dda === "all") tally.ddaAll++;
    if (o.dda === "part") tally.ddaPart++;
  }
  log(`hud: ${tally.qct.toLocaleString("en-US")} QCT tracts, ${tally.ddaAll.toLocaleString("en-US")} wholly and ${tally.ddaPart.toLocaleString("en-US")} partly in a DDA`);

  writeCsv(
    path.join(CLEAN_DIR, "hud_qct_dda.csv"),
    ["geoid20", "qct_2026", "dda_2026", "dda_county", "dda_zcta_land_share"],
    universe.map((g) => {
      const o = result.get(g)!;
      return [g, o.qct, o.dda, o.ddaCounty, o.ddaZctaLandShare];
    })
  );
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  buildHudQctDda().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
