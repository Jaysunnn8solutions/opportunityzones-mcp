import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { dataDir } from "../data/tracts";
import { countyUnemployment } from "../sources/bls/laus";
import { countyJobs } from "../sources/bls/qcew";
import { countyLaborMarket } from "../sources/census/qwi";
import { tractAtPoint } from "../sources/censusGeocoder/client";
import { milesBetween, sitesNear } from "../sources/epa/client";
import { floodZoneAt } from "../sources/fema/client";
import { amenitiesNear } from "../sources/foursquare/places";
import { busiestRoadsNear } from "../sources/hpms/client";
import { wildfireLikelihoodAt } from "../sources/usfs/wildfire";
import { seismicDesignAt } from "../sources/usgs/seismic";
import { DESCRIPTION_SUFFIX, fmt, readOnlyLive, text, unavailable } from "./shared";

export const nearbyConfig = {
  title: "What is near a site",
  description:
    "Live context around a point (from check_address): natural hazards (FEMA flood zone at the point, USGS seismic design " +
    "category, Forest Service wildfire burn probability, each reported separately with no combined score), EPA Superfund and brownfield sites, " +
    "the busiest nearby roads (FHWA traffic counts), colleges and hospitals, everyday amenities (Foursquare, where " +
    "configured), and the county's labor market (BLS, Census QWI). Each source is reported separately; one that does not " +
    "answer is marked unavailable. Third parties receive only an approximate location, except the Census Bureau, which " +
    "receives the point to find its tract. Coordinates are not stored or logged." +
    DESCRIPTION_SUFFIX,
  inputSchema: z
    .object({
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
      radiusMiles: z.number().gt(0).max(2).optional().describe("Search radius for sites, roads and amenities; default 1 mile."),
    })
    .strict(),
  annotations: readOnlyLive,
};

interface AnchorPoint {
  kind: string;
  name: string;
  subtype: string | null;
  lon: number;
  lat: number;
}
let anchors: AnchorPoint[] | null = null;
function anchorPoints(): AnchorPoint[] {
  anchors ??= JSON.parse(readFileSync(path.join(dataDir(), "anchor_points.json"), "utf8")) as AnchorPoint[];
  return anchors;
}

export async function nearbyHandler({ lat, lon, radiusMiles = 1 }: { lat: number; lon: number; radiusMiles?: number }) {
  // Point lookups start at once; only the county measures wait for the tract.
  const pointLookups = Promise.allSettled([
    floodZoneAt(lon, lat),
    sitesNear(lon, lat, radiusMiles),
    busiestRoadsNear(lon, lat, radiusMiles),
    amenitiesNear(lon, lat, radiusMiles),
    seismicDesignAt(lon, lat),
    wildfireLikelihoodAt(lon, lat),
  ]);
  const tract = await tractAtPoint(lon, lat).catch(() => null);
  const county = tract?.countyFips ?? null;
  const [[flood, epa, roads, places, seismic, wildfire], [jobs, qwi, laus]] = await Promise.all([
    pointLookups,
    Promise.allSettled([
      county ? countyJobs(county) : Promise.resolve(null),
      county ? countyLaborMarket(county) : Promise.resolve(null),
      county ? countyUnemployment(county) : Promise.resolve(null),
    ]),
  ]);

  const lines = [`# Around ${lat.toFixed(4)}, ${lon.toFixed(4)} (radius ${radiusMiles} mi)`];
  if (tract) lines.push(`Census tract ${tract.geoid} (use get_tract for its profile).`);

  lines.push("", "## Flood (FEMA)");
  if (flood.status === "fulfilled") {
    const f = flood.value;
    lines.push(`- ${f.zone ? `Zone ${f.zone}${f.subtype ? ` (${f.subtype.toLowerCase()})` : ""}: ` : ""}${f.description}${f.baseFloodElevationFt != null ? ` Base flood elevation ${f.baseFloodElevationFt} ft.` : ""}`);
    lines.push("- FEMA's mapped zone, not an official flood determination.");
  } else lines.push(`- ${unavailable("Flood zone", flood.reason)}`);

  lines.push("", "## Earthquake (USGS)");
  if (seismic.status === "fulfilled") {
    const q = seismic.value;
    lines.push(`- Seismic Design Category ${q.category}: ${q.description}${q.sds != null ? ` Design short-period acceleration S_DS ${q.sds.toFixed(2)} g` : ""}${q.sd1 != null ? `, S_D1 ${q.sd1.toFixed(2)} g` : ""}${q.sds != null || q.sd1 != null ? "." : ""}`);
    lines.push("- For an ordinary building (Risk Category II) on the code's default soil, for the area around the site (ASCE 7-22). Not a structural determination.");
  } else lines.push(`- ${unavailable("Seismic design category", seismic.reason)}`);

  lines.push("", "## Wildfire (USDA Forest Service)");
  if (wildfire.status === "fulfilled") {
    lines.push(`- ${wildfire.value.description}`);
    if (wildfire.value.status === "modelled") lines.push("- Annual burn probability for the area around the site (270 m model cells; landscape as of 2020).");
  } else lines.push(`- ${unavailable("Wildfire likelihood", wildfire.reason)}`);

  lines.push("", "## EPA sites");
  if (epa.status === "fulfilled") {
    const s = epa.value.sites;
    const npl = s.filter((x) => x.program === "superfund");
    const bf = s.filter((x) => x.program === "brownfield");
    lines.push(`- Superfund (NPL): ${npl.length}${npl[0] ? `; nearest ${npl[0].name}, ${fmt.miles(npl[0].distanceMiles)}` : ""}.`);
    lines.push(`- Brownfields (ACRES): ${bf.length}${bf[0] ? `; nearest ${bf[0].name}, ${fmt.miles(bf[0].distanceMiles)}` : ""}${epa.value.truncated ? " (EPA capped the list; there may be more)" : ""}.`);
    lines.push("- A listed site describes history, not current condition; see EPA's record for each.");
  } else lines.push(`- ${unavailable("EPA sites", epa.reason)}`);

  lines.push("", "## Traffic (FHWA HPMS)");
  if (roads.status === "fulfilled") {
    if (roads.value.length === 0) lines.push("- No counted road segments in the radius.");
    for (const r of roads.value) {
      lines.push(`- ${r.name ?? "Unnamed road"} (${r.roadClass}): ${fmt.int(r.aadt)} vehicles/day${r.truckShare != null ? `, ${fmt.pct(r.truckShare)} trucks` : ""}, ${fmt.miles(r.distanceMiles)} away (${r.dataYear ?? "n/a"}).`);
    }
  } else lines.push(`- ${unavailable("Traffic", roads.reason)}`);

  lines.push("", "## Anchor institutions");
  const near = anchorPoints()
    .map((a) => ({ ...a, d: milesBetween(lon, lat, a.lon, a.lat) }))
    .filter((a) => a.d <= Math.max(radiusMiles, 2))
    .sort((a, b) => a.d - b.d)
    .slice(0, 8);
  if (near.length === 0) lines.push(`- No colleges or hospitals within ${Math.max(radiusMiles, 2)} miles.`);
  for (const a of near) lines.push(`- ${a.name} (${a.kind === "college" ? "college" : a.subtype ?? "hospital"}), ${fmt.miles(a.d)}.`);

  lines.push("", "## Everyday amenities (Foursquare)");
  if (places.status === "fulfilled") {
    for (const [k, s] of Object.entries(places.value.amenities)) {
      lines.push(`- ${k}: ${s.count}${s.nearestName ? `; nearest ${s.nearestName}, ${fmt.miles(s.nearestMiles)}` : ""}.`);
    }
  } else lines.push(`- ${unavailable("Amenities", places.reason)}`);

  lines.push("", "## County labor market (county-level, not the tract)");
  if (jobs.status === "fulfilled" && jobs.value) {
    const j = jobs.value;
    lines.push(`- Jobs ${j.quarter} (BLS QCEW): ${fmt.int(j.employment)}, ${fmt.pct(j.employmentChangeYoY)} year over year; average weekly wage ${fmt.usd(j.averageWeeklyWage)}.`);
    if (j.topPrivateSectors.length) lines.push(`- Largest private sectors: ${j.topPrivateSectors.map((s) => s.sector).join(", ")}.`);
  } else lines.push(`- ${jobs.status === "rejected" ? unavailable("QCEW jobs", jobs.reason) : "QCEW jobs: n/a."}`);
  if (qwi.status === "fulfilled" && qwi.value) {
    const q = qwi.value;
    lines.push(`- Hiring ${q.quarter} (Census QWI): hires equal to ${fmt.pct(q.hiresRate)} of employment; average monthly earnings ${fmt.usd(q.monthlyEarnings)} (${q.earningsQuarter}).`);
  } else lines.push(`- ${qwi.status === "rejected" ? unavailable("QWI", qwi.reason) : "QWI: n/a."}`);
  if (laus.status === "fulfilled" && laus.value) {
    const u = laus.value;
    lines.push(`- Unemployment ${u.month} (BLS LAUS): ${u.unemploymentRate}%${u.preliminary ? " (preliminary)" : ""}${u.changeFromYearAgo != null ? `, ${u.changeFromYearAgo >= 0 ? "+" : ""}${u.changeFromYearAgo} points from a year earlier` : ""}.`);
  } else lines.push(`- ${laus.status === "rejected" ? unavailable("Unemployment", laus.reason) : "Unemployment: n/a."}`);

  return text(lines.join("\n"), [
    "censusGeocoder",
    "femaNfhl",
    "usgsSeismicDesign",
    "usfsWildfireRisk",
    "epaSites",
    "fhwaHpms",
    "ncesPostsecondary",
    "cmsHospitals",
    "foursquarePlaces",
    "blsQcew",
    "censusQwi",
    "blsLaus",
  ]);
}
