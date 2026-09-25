/**
 * Anchor institutions ("eds and meds") by 2020 tract: postsecondary
 * institutions from NCES and hospitals from CMS.
 *
 * Large universities and hospitals are stable employers and draw activity
 * around them, which bears on whether a project nearby can work. The product
 * reports where they are; it does not rate them.
 *
 *  - Colleges: NCES EDGE "Postsecondary School Locations - Current" (IPEDS
 *    institutions, with NCES's own coordinates), placed in tracts with the
 *    1:500k tract boundaries. Includes every IPEDS institution, from research
 *    universities to small certificate schools.
 *  - Hospitals: CMS Hospital General Information. CMS publishes addresses only,
 *    so they are placed with the Census batch geocoder, which returns the tract
 *    directly, and a single-address retry for its misses. These are public
 *    facility addresses, not personal data. About 14% (mostly rural-route and
 *    highway addresses) still cannot be matched; they are listed in
 *    anchors_unplaced_hospitals.csv, never placed by guesswork.
 *
 * Outputs:
 *  - pipeline/clean/anchors_by_tract.csv: counts per tract;
 *  - pipeline/clean/anchor_points.csv: every placed institution with its
 *    coordinates, small enough to bundle so "what is near this site" needs no
 *    live call.
 */

import path from "node:path";
import { parseAddressResponse } from "../../lib/sources/censusGeocoder/client";
import { CLEAN_DIR } from "../config";
import { queryAllAttributes } from "../lib/arcgis";
import { fetchCached, log, mapLimit } from "../lib/http";
import { splitLine, writeCsv } from "../lib/table";
import { loadTractIndex } from "../lib/tractIndex";

const NCES_LAYER =
  "https://services1.arcgis.com/Ua5sjt3LWTPigjyD/arcgis/rest/services/Postsecondary_School_Locations_Current/FeatureServer/0";
const CMS_HOSPITALS = "https://data.cms.gov/provider-data/api/1/datastore/query/xubh-q36u/0";
const BATCH_GEOCODER = "https://geocoding.geo.census.gov/geocoder/geographies/addressbatch";
const ONELINE_GEOCODER = "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress";
const BATCH_SIZE = 5_000;

export interface Anchor {
  kind: "college" | "hospital";
  id: string;
  name: string;
  /** Hospital type from CMS, e.g. "Acute Care Hospitals"; null for colleges. */
  subtype: string | null;
  lon: number;
  lat: number;
  geoid: string;
}

interface CmsHospital {
  facility_id: string;
  facility_name: string;
  address: string;
  citytown: string;
  state: string;
  zip_code: string;
  hospital_type: string;
}

async function cmsHospitals(): Promise<CmsHospital[]> {
  const out: CmsHospital[] = [];
  let total = Infinity;
  for (let offset = 0; offset < total; offset += 500) {
    const u = new URL(CMS_HOSPITALS);
    u.searchParams.set("limit", "500");
    u.searchParams.set("offset", String(offset));
    u.searchParams.set("count", "true");
    u.searchParams.set("schema", "false");
    const page = JSON.parse((await fetchCached(u.toString(), `cms-hospitals-${offset}.json`)).toString("utf8")) as {
      results: CmsHospital[];
      count: number;
    };
    total = page.count;
    out.push(...page.results);
  }
  if (out.length !== total) throw new Error(`CMS hospitals: expected ${total}, got ${out.length}`);
  return out;
}

/**
 * Parse the Census batch geocoder's CSV response:
 * "id","input","Match"|"No_Match"|"Tie","Exact"|"Non_Exact","matched","lon,lat","tiger","side","state","county","tract","block"
 */
export function parseBatchResult(text: string): Map<string, { lon: number; lat: number; geoid: string }> {
  const out = new Map<string, { lon: number; lat: number; geoid: string }>();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const f = splitLine(line).map((x) => x.replace(/^"|"$/g, ""));
    if (f[2] !== "Match" || f.length < 12) continue;
    const [lon, lat] = f[5].split(",").map(Number);
    const geoid = f[8] + f[9] + f[10];
    if (Number.isFinite(lon) && Number.isFinite(lat) && /^\d{11}$/.test(geoid)) out.set(f[0], { lon, lat, geoid });
  }
  return out;
}

function csvCell(s: string): string {
  return `"${s.replace(/"/g, "'")}"`;
}

async function geocodeHospitals(hospitals: CmsHospital[]) {
  const placed = new Map<string, { lon: number; lat: number; geoid: string }>();
  for (let i = 0; i < hospitals.length; i += BATCH_SIZE) {
    const batch = hospitals.slice(i, i + BATCH_SIZE);
    const csv = batch
      .map((h) => [h.facility_id, h.address, h.citytown, h.state, h.zip_code].map(csvCell).join(","))
      .join("\n");
    const form = new FormData();
    form.set("addressFile", new Blob([csv], { type: "text/csv" }), "hospitals.csv");
    form.set("benchmark", "Public_AR_Current");
    form.set("vintage", "Current_Current");
    const res = await fetchCached(BATCH_GEOCODER, `census-batch-hospitals-${i}.csv`, {
      method: "POST",
      body: form,
      timeoutMs: 900_000,
    });
    for (const [k, v] of parseBatchResult(res.toString("utf8"))) placed.set(k, v);
  }
  // Second pass: the single-address endpoint matches some addresses the batch
  // endpoint rejects (suite numbers, highway names).
  const missing = hospitals.filter((h) => !placed.has(h.facility_id));
  const retried = await mapLimit(missing, 6, async (h) => {
    const u = new URL(ONELINE_GEOCODER);
    u.searchParams.set("address", `${h.address}, ${h.citytown}, ${h.state} ${h.zip_code}`);
    u.searchParams.set("benchmark", "Public_AR_Current");
    u.searchParams.set("vintage", "Current_Current");
    u.searchParams.set("layers", "Census Tracts");
    u.searchParams.set("format", "json");
    try {
      const json = JSON.parse((await fetchCached(u.toString(), `census-oneline-hospital-${h.facility_id}.json`)).toString("utf8"));
      const [m] = parseAddressResponse(json);
      return m ? ([h.facility_id, { lon: m.lon, lat: m.lat, geoid: m.geoid }] as const) : null;
    } catch {
      return null;
    }
  });
  for (const r of retried) if (r) placed.set(r[0], r[1]);
  log(`anchors: batch geocoder missed ${missing.length} hospitals; single-address retry placed ${retried.filter(Boolean).length}`);
  return placed;
}

export async function buildAnchors(): Promise<void> {
  const [index, colleges, hospitals] = await Promise.all([
    loadTractIndex(),
    queryAllAttributes({ layer: NCES_LAYER, outFields: ["UNITID", "NAME", "LAT", "LON"], cacheKey: "nces-postsecondary-current" }),
    cmsHospitals(),
  ]);

  const anchors: Anchor[] = [];
  let collegesUnplaced = 0;
  for (const c of colleges) {
    const lon = Number(c.LON);
    const lat = Number(c.LAT);
    const geoid = Number.isFinite(lon) && Number.isFinite(lat) ? index.locate(lon, lat) : null;
    if (!geoid) {
      collegesUnplaced++;
      continue;
    }
    anchors.push({ kind: "college", id: String(c.UNITID), name: String(c.NAME), subtype: null, lon, lat, geoid });
  }

  const placed = await geocodeHospitals(hospitals);
  const unplacedHospitals: CmsHospital[] = [];
  for (const h of hospitals) {
    const p = placed.get(h.facility_id);
    if (p) anchors.push({ kind: "hospital", id: h.facility_id, name: h.facility_name, subtype: h.hospital_type, ...p });
    else unplacedHospitals.push(h);
  }
  // Left out rather than guessed from a ZIP centroid, which would put them in
  // the wrong tract; listed so the gap is visible.
  writeCsv(
    path.join(CLEAN_DIR, "anchors_unplaced_hospitals.csv"),
    ["facility_id", "name", "type", "city", "state"],
    unplacedHospitals.map((h) => [h.facility_id, h.facility_name, h.hospital_type, h.citytown, h.state])
  );
  log(
    `anchors: ${colleges.length - collegesUnplaced} of ${colleges.length} colleges and ` +
      `${placed.size} of ${hospitals.length} hospitals placed in tracts`
  );

  const byTract = new Map<string, { colleges: number; hospitals: number }>();
  for (const a of anchors) {
    const c = byTract.get(a.geoid) ?? { colleges: 0, hospitals: 0 };
    if (a.kind === "college") c.colleges++;
    else c.hospitals++;
    byTract.set(a.geoid, c);
  }
  writeCsv(
    path.join(CLEAN_DIR, "anchors_by_tract.csv"),
    ["geoid20", "colleges", "hospitals"],
    [...byTract.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([g, c]) => [g, c.colleges, c.hospitals])
  );
  writeCsv(
    path.join(CLEAN_DIR, "anchor_points.csv"),
    ["kind", "id", "name", "subtype", "lon", "lat", "geoid20"],
    anchors.map((a) => [a.kind, a.id, a.name, a.subtype, Math.round(a.lon * 1e5) / 1e5, Math.round(a.lat * 1e5) / 1e5, a.geoid])
  );
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  buildAnchors().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
