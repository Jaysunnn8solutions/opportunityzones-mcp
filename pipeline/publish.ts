/**
 * Publish the per-tract results the app and MCP server read at runtime.
 *
 * Joins every cleaned table onto Treasury's 2027 tract universe (85,529 2020
 * tracts, Connecticut by planning region) and writes, under data/:
 *  - tracts.bin      one columnar payload (lib/data/columnar.ts): every numeric
 *                    per-tract measure, nulls kept distinct from zero;
 *  - lookups.json    names the payload refers to by code: states, counties,
 *                    CBSAs, rural-explanation places, county permits, and
 *                    which states' 2027 designations are certified, and when;
 *  - safmr_zip.json  HUD Small Area FMRs by ZIP, for the ZIP a geocoded site has;
 *  - anchor_points.json  colleges and hospitals with coordinates, for "nearby";
 *  - manifest.json   what each column means, its unit, and each source's vintage.
 *
 * Everything here is public data about places; nothing about users.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { encodePayload, type ColumnSpec } from "../lib/data/columnar";
import { CLEAN_DIR, DATA_DIR, STATES } from "./config";
import { log } from "./lib/http";
import { designationCode } from "./oz2/designated";
import { readCsv, type Table } from "./lib/table";
import { SOURCES } from "./sources";
import { publishResearchContext } from "../scripts/publish-research-context";

type Getter = (geoid: string) => number | null;

function table(name: string): Table {
  const file = path.join(CLEAN_DIR, name);
  if (!existsSync(file)) throw new Error(`Missing ${name}; run npm run pipeline first`);
  return readCsv(file);
}

function num(s: string | undefined): number | null {
  if (s == null || s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Index a table by its first (GEOID) column and return a getter per named column. */
function byGeoid(t: Table, keyCol = 0) {
  const rows = new Map(t.rows.map((r) => [r[keyCol], r]));
  return (col: string, map: (s: string | undefined) => number | null = num): Getter => {
    const i = t.col(col);
    return (g) => map(rows.get(g)?.[i]);
  };
}

const flag = (s: string | undefined) => (s === "1" ? 1 : s === "0" ? 0 : null);
const ratio = (a: Getter, b: Getter): Getter => (g) => {
  const x = a(g);
  const y = b(g);
  return x == null || y == null || y <= 0 ? null : Math.round((x / y) * 1e4) / 1e4;
};

interface Col {
  spec: ColumnSpec;
  get: Getter;
  source: keyof typeof SOURCES;
}

export async function publish(): Promise<void> {
  const treasury = table("oz2_eligible.csv");
  const universe = treasury.rows.map((r) => r[treasury.col("geoid20")]);
  const ct = table("ct_tracts.csv");
  const toPlanning = new Map(ct.rows.map((r) => [r[ct.col("geoid_census2020")], r[ct.col("geoid_planning_region")]]));

  // Names by code.
  const states: Record<string, string> = {};
  const counties: Record<string, { name: string; cbsa: number | null }> = {};
  const cbsas: string[] = [];
  const cbsaIndex = new Map<string, number>();
  const [iState, iCounty, iCbsa] = ["state_name", "county_name", "cbsa_name"].map((c) => treasury.col(c));
  for (const r of treasury.rows) {
    const g = r[0];
    states[g.slice(0, 2)] ??= r[iState];
    const cbsaName = r[iCbsa];
    if (cbsaName && !cbsaIndex.has(cbsaName)) {
      cbsaIndex.set(cbsaName, cbsas.length);
      cbsas.push(cbsaName);
    }
    counties[g.slice(0, 5)] ??= { name: r[iCounty], cbsa: cbsaName ? cbsaIndex.get(cbsaName)! : null };
  }

  // 2018 zones on 2020 tracts: share of each 2020 tract's population in a 2018 designated tract.
  const oz1 = table("oz1_tracts.csv");
  const designated2018 = new Set(oz1.rows.filter((r) => r[oz1.col("designated")] === "1").map((r) => r[0]));
  const xw = table("xwalk_t10_t20.csv");
  const [x10, x20, xPop, xJobs17, xJobs23] = ["geoid10", "geoid20", "pop20", "jobs_2017", "jobs_2023"].map((c) => xw.col(c));
  const pop20 = new Map<string, number>();
  const popIn2018 = new Map<string, number>();
  const jobs17 = new Map<string, number>();
  const jobs23 = new Map<string, number>();
  for (const r of xw.rows) {
    const g = toPlanning.get(r[x20]) ?? r[x20];
    const p = Number(r[xPop]) || 0;
    pop20.set(g, (pop20.get(g) ?? 0) + p);
    if (designated2018.has(r[x10])) popIn2018.set(g, (popIn2018.get(g) ?? 0) + p);
    const j17 = num(r[xJobs17]);
    const j23 = num(r[xJobs23]);
    if (j17 != null) jobs17.set(g, (jobs17.get(g) ?? 0) + j17);
    if (j23 != null) jobs23.set(g, (jobs23.get(g) ?? 0) + j23);
  }

  // LODES is missing for some state-years (Puerto Rico always; Alaska and
  // Michigan in some years): jobs there are null, never zero.
  const lodes = table("lodes_coverage.csv");
  const lodesMissing = new Set(
    lodes.rows.filter((r) => r[lodes.col("available")] !== "1").map((r) => `${r[lodes.col("state_fips")]}-${r[lodes.col("year")]}`)
  );
  const jobsIn = (m: Map<string, number>, year: number): Getter => (g) => {
    if (lodesMissing.has(`${g.slice(0, 2)}-${year}`)) return null;
    const v = m.get(g);
    return v == null ? null : Math.round(v);
  };

  // HMDA covers the 50 states, DC and Puerto Rico: a tract there with no
  // records had no applications (0); island areas stay null.
  const hmdaCovered = new Set(STATES.map((s) => s.fips));
  const hmdaCount = (get: Getter): Getter => (g) => get(g) ?? (hmdaCovered.has(g.slice(0, 2)) ? 0 : null);

  // Rural explanations: reason code plus an index into a names list.
  const rural = table("oz2_rural.csv");
  const ruralNames: string[] = [];
  const ruralNameIndex = new Map<string, number>();
  const ruralRows = new Map(rural.rows.map((r) => [r[0], r]));
  const [rReason, rCity, rCityPop, rUa, rStatus, rBlocks] = [
    "not_rural_reason",
    "city",
    "city_population",
    "urban_area",
    "explanation_status",
    "rural_by_blocks",
  ].map((c) => rural.col(c));
  const nameIdx = (s: string) => {
    if (!ruralNameIndex.has(s)) {
      ruralNameIndex.set(s, ruralNames.length);
      ruralNames.push(s);
    }
    return ruralNameIndex.get(s)!;
  };

  const eligible = byGeoid(treasury);
  const acs = byGeoid(table("acs_2024.csv"));
  const age = byGeoid(table("acs_2024_housing_age.csv"));
  const hud = byGeoid(table("hud_qct_dda.csv"));
  const nmtc = byGeoid(table("nmtc_lic.csv"));
  const epa = byGeoid(table("epa_sites.csv"));
  const hmda = byGeoid(table("hmda_2024.csv"));
  const anchors = byGeoid(table("anchors_by_tract.csv"));
  const safmr = byGeoid(table("hud_safmr_by_tract.csv"));
  const interstate = byGeoid(table("interstate_distance.csv"));
  // Point counts list only tracts with at least one site; any other tract has none.
  const zeroIfAbsent = (get: Getter): Getter => (g) => get(g) ?? 0;

  const share = (name: string, description: string, get: Getter, source: Col["source"]): Col => ({
    spec: { name, type: "u16", scale: 1e-4, unit: "share", description },
    get,
    source,
  });
  const count = (name: string, description: string, get: Getter, source: Col["source"], type: "u16" | "u32" = "u32"): Col => ({
    spec: { name, type, unit: "count", description },
    get,
    source,
  });
  const dollars = (name: string, description: string, get: Getter, source: Col["source"]): Col => ({
    spec: { name, type: "u32", unit: "USD", description },
    get,
    source,
  });
  const code = (name: string, description: string, get: Getter, source: Col["source"]): Col => ({
    spec: { name, type: "u8", unit: "code", description },
    get,
    source,
  });

  // 2027 designations: absent files mean nothing is published yet, so every tract is pending.
  const designatedFile = path.join(CLEAN_DIR, "oz2_designated.csv");
  const statesFile = path.join(CLEAN_DIR, "oz2_designation_states.csv");
  const designatedSet = new Set(existsSync(designatedFile) ? readCsv(designatedFile).rows.map((r) => r[0]) : []);
  const certified = new Map<string, string>(existsSync(statesFile) ? readCsv(statesFile).rows.map((r) => [r[0], r[1]] as [string, string]) : []);

  const columns: Col[] = [
    // Statutory: 2027 eligibility and rural status (Treasury).
    code("eligible_2027", "1 if Treasury lists the tract as an eligible low-income community for the 2027 designations.", eligible("eligible", flag), "oz2Eligible"),
    code("designated_2027", "1 a designated 2027 zone; 0 not designated (its state's list is published); null pending (not yet published for its state).", (g) => designationCode(g, designatedSet, certified), "oz2Designated"),
    code("rural_2027", "1 if Treasury classifies the tract as comprised entirely of a rural area.", eligible("rural", flag), "oz2Eligible"),
    share("poverty_rate", "Poverty rate, 2020-2024 ACS, as Treasury used it.", eligible("poverty_rate"), "oz2Eligible"),
    dollars("median_family_income", "Median family income, 2020-2024 ACS (Treasury's input).", eligible("mfi"), "oz2Eligible"),
    dollars("area_median_family_income", "The comparison MFI Treasury applied: the CBSA's if in one, else the state's.", eligible("area_mfi"), "oz2Eligible"),
    { spec: { name: "mfi_ratio", type: "f32", unit: "ratio", description: "Tract MFI divided by the applicable area MFI." }, get: eligible("mfi_ratio"), source: "oz2Eligible" },
    // 2018 zones, carried to 2020 tracts by population.
    share("oz2018_population_share", "Share of the tract's 2020 population living in a 2018 Opportunity Zone (2010 tract), via the block crosswalk.", (g) => (pop20.get(g) ? Math.round(((popIn2018.get(g) ?? 0) / pop20.get(g)!) * 1e4) / 1e4 : null), "oz1Designated"),
    // Rural explanation.
    code("rural_by_blocks", "1 if the block-based reproduction finds the tract rural, 0 if not; null where not computed.", (g) => flag(ruralRows.get(g)?.[rBlocks]), "urbanAreas2020"),
    code("rural_reason", "Why not rural, by blocks: 1 city over 50,000, 2 urban area touching one; null if rural or not computed.", (g) => ({ city: 1, "urban-area": 2 })[ruralRows.get(g)?.[rReason] ?? ""] ?? null, "urbanAreas2020"),
    { spec: { name: "rural_city", type: "u16", unit: "index", description: "Index into lookups.ruralNames of the excluding city." }, get: (g) => { const r = ruralRows.get(g); return r?.[rCity] ? nameIdx(`${r[rCity]}|${r[rCityPop]}`) : null; }, source: "places2020" },
    { spec: { name: "rural_urban_area", type: "u16", unit: "index", description: "Index into lookups.ruralNames of the excluding urban area." }, get: (g) => { const r = ruralRows.get(g); return r?.[rUa] ? nameIdx(r[rUa]) : null; }, source: "urbanAreas2020" },
    code("rural_explanation", "0 verified (block test agrees with Treasury), 1 unverified (they differ), 2 not computed.", (g) => ({ verified: 0, unverified: 1, "not-computed": 2 })[ruralRows.get(g)?.[rStatus] ?? ""] ?? null, "urbanAreas2020"),
    // Stacking incentives.
    code("qct_2026", "1 if a 2026 HUD Qualified Census Tract.", hud("qct_2026", flag), "hudQct"),
    code("dda_2026", "Difficult Development Area 2026: 0 none, 1 part of the tract, 2 all of it.", hud("dda_2026", (s) => ({ none: 0, part: 1, all: 2 })[s ?? ""] ?? null), "hudDda"),
    share("dda_zcta_land_share", "Share of the tract's land in small-area (ZIP-based) DDAs.", hud("dda_zcta_land_share"), "hudDda"),
    code("nmtc_lic", "1 if an NMTC low-income community (2016-2020 ACS); null in island areas (not covered).", nmtc("nmtc_lic", flag), "nmtcLic"),
    code("nmtc_high_migration", "1 if NMTC-eligible only through the high-migration rural rule.", nmtc("nmtc_high_migration", flag), "nmtcLic"),
    // Place profile, 2020-2024 ACS.
    count("population", "Population, 2020-2024 ACS.", acs("population"), "acs5"),
    count("housing_units", "Housing units, 2020-2024 ACS.", acs("housingUnits"), "acs5"),
    dollars("median_household_income", "Median household income, 2020-2024 ACS (2024 dollars).", acs("hhIncome"), "acs5"),
    dollars("median_home_value", "Median value of owner-occupied homes, 2020-2024 ACS.", acs("homeValue"), "acs5"),
    dollars("median_gross_rent", "Median gross rent, 2020-2024 ACS.", acs("rent"), "acs5"),
    share("vacancy_rate", "Vacant share of housing units, 2020-2024 ACS.", ratio(acs("vacant"), acs("occupancyUniverse")), "acs5"),
    share("owner_occupied_share", "Owner-occupied share of occupied units, 2020-2024 ACS.", ratio(acs("ownerOccupied"), acs("tenureUniverse")), "acs5"),
    share(
      "bachelors_or_higher_share",
      "Adults 25+ with a bachelor's degree or higher, 2020-2024 ACS.",
      (g) => {
        const parts = ["eduBachelors", "eduMasters", "eduProfessional", "eduDoctorate"].map((c) => acs(c)(g));
        const u = acs("eduUniverse")(g);
        return parts.some((p) => p == null) || u == null || u <= 0 ? null : Math.round((parts.reduce((s, p) => s! + p!, 0)! / u) * 1e4) / 1e4;
      },
      "acs5"
    ),
    share("unemployment_rate", "Unemployed share of the civilian labor force, 2020-2024 ACS.", ratio(acs("unemployed"), acs("laborForce")), "acs5"),
    // Housing stock.
    count("built_2020_or_later", "Housing units built 2020 or later, 2020-2024 ACS.", age("built_2020_later"), "acs5"),
    count("built_2020_or_later_moe", "Margin of error (90%) of built_2020_or_later.", age("built_2020_later_moe"), "acs5"),
    share("share_built_2010_or_later", "Share of housing units built 2010 or later.", age("share_built_2010_later"), "acs5"),
    share("share_built_before_1980", "Share of housing units built before 1980.", age("share_built_pre_1980"), "acs5"),
    // Jobs located in the tract (LODES).
    count("jobs_2023", "Jobs located in the tract, 2023 (LODES); null where LODES has no data for the state and year.", jobsIn(jobs23, 2023), "lodesWac"),
    count("jobs_2017", "Jobs located in the tract, 2017 (LODES); null where LODES has no data for the state and year.", jobsIn(jobs17, 2017), "lodesWac"),
    // Credit access (HMDA 2024).
    count("mortgage_applications", "Mortgage applications, 2024 (HMDA), excluding purchased loans.", hmdaCount(hmda("applications")), "hmdaLar"),
    count("mortgage_originations", "Mortgage originations, 2024 (HMDA).", hmdaCount(hmda("originations")), "hmdaLar"),
    share("mortgage_denial_rate", "Denials over decided applications, 2024 (HMDA); null with no decided applications.", hmda("denial_rate"), "hmdaLar"),
    count("home_purchase_originations", "Home-purchase originations, 2024 (HMDA).", hmdaCount(hmda("home_purchase_originations")), "hmdaLar"),
    { spec: { name: "originated_dollars", type: "f32", unit: "USD", description: "Dollars originated, 2024 (HMDA)." }, get: hmdaCount(hmda("originated_dollars")), source: "hmdaLar" },
    // Site conditions.
    count("npl_sites", "EPA Superfund NPL sites recorded in or at the edge of the tract.", zeroIfAbsent(epa("npl_sites")), "epaSites", "u16"),
    count("brownfield_sites", "EPA brownfield (ACRES) sites recorded in or at the edge of the tract.", zeroIfAbsent(epa("brownfield_sites")), "epaSites", "u16"),
    count("colleges", "Postsecondary institutions in the tract (NCES).", zeroIfAbsent(anchors("colleges")), "ncesPostsecondary", "u16"),
    count("hospitals", "Hospitals placed in the tract (CMS; a floor, as ~14% could not be geocoded).", zeroIfAbsent(anchors("hospitals")), "cmsHospitals", "u16"),
    dollars("safmr_2br_land_weighted", "HUD FY2026 two-bedroom Small Area FMR, land-weighted over the ZIPs overlapping the tract.", safmr("safmr_2br_land_weighted"), "hudSafmr"),
    share("safmr_land_covered", "Share of the tract's land in ZIPs with a Small Area FMR.", safmr("safmr_land_covered"), "hudSafmr"),
    { spec: { name: "miles_to_interstate", type: "f32", unit: "miles", description: "Miles from the tract's interior point to the nearest Interstate (TIGER 2024); null if none within 150 miles (e.g. Puerto Rico) or not computed." }, get: interstate("miles_to_interstate"), source: "tigerPrimaryRoads" },
  ];

  const payload = encodePayload({
    geoids: universe,
    columns: columns.map((c) => ({ spec: c.spec, values: universe.map((g) => c.get(g)) })),
  });

  // County permits, keyed by county FIPS.
  const bps = table("bps_county.csv");
  const permits: Record<string, { year: number; units: number; units5plus: number; change: number | null }> = {};
  for (const r of bps.rows) {
    permits[r[bps.col("county_fips")]] = {
      year: Number(r[bps.col("year")]),
      units: Number(r[bps.col("units_permitted")]),
      units5plus: Number(r[bps.col("units_5_plus")]),
      change: num(r[bps.col("change_from_prior_year")]),
    };
  }

  const safmrZip = table("hud_safmr_zip.csv");
  const zips: Record<string, [string, ...(number | null)[]]> = {};
  for (const r of safmrZip.rows) {
    zips[r[0]] = [r[safmrZip.col("area_type")], ...["safmr_0br", "safmr_1br", "safmr_2br", "safmr_3br", "safmr_4br"].map((c) => num(r[safmrZip.col(c)]))];
  }

  const points = table("anchor_points.csv");
  const anchorPoints = points.rows.map((r) => ({
    kind: r[points.col("kind")],
    name: r[points.col("name")],
    subtype: r[points.col("subtype")] || null,
    lon: Number(r[points.col("lon")]),
    lat: Number(r[points.col("lat")]),
  }));

  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(path.join(DATA_DIR, "tracts.bin"), payload);
  writeFileSync(path.join(DATA_DIR, "lookups.json"), JSON.stringify({ states, counties, cbsas, ruralNames, permits, designation: { certified: Object.fromEntries(certified) } }));
  writeFileSync(path.join(DATA_DIR, "safmr_zip.json"), JSON.stringify(zips));
  writeFileSync(path.join(DATA_DIR, "anchor_points.json"), JSON.stringify(anchorPoints));

  const usedSources = [...new Set(columns.map((c) => c.source)), "censusBps", "hudSafmr", "ncesPostsecondary", "cmsHospitals"] as const;
  writeFileSync(
    path.join(DATA_DIR, "manifest.json"),
    JSON.stringify(
      {
        generated: new Date().toISOString().slice(0, 10),
        tracts: universe.length,
        disclaimer: "Informational only, not investment, tax or legal advice.",
        columns: columns.map((c) => ({ ...c.spec, source: c.source })),
        sources: [...new Set(usedSources)].map((id) => {
          const s = SOURCES[id as keyof typeof SOURCES];
          return { id: s.id, name: s.name, publisher: s.publisher, vintage: s.vintage, geography: s.geography, attribution: s.attribution };
        }),
      },
      null,
      1
    )
  );
  publishResearchContext();
  log(
    `publish: ${universe.length.toLocaleString("en-US")} tracts x ${columns.length} columns, ` +
      `tracts.bin ${(payload.length / 1024 / 1024).toFixed(1)} MB; ${Object.keys(zips).length.toLocaleString("en-US")} ZIPs; ${anchorPoints.length.toLocaleString("en-US")} anchor points`
  );
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  publish().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
