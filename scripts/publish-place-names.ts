/** Refresh the bundled, public-domain city navigation index. No runtime API/key. */
import { unzipSync, strFromU8 } from "fflate";
import { writeFileSync } from "node:fs";
import { SOURCES } from "../pipeline/sources";
import type { GazetteerRow } from "../lib/geo/placeNames";

const source = SOURCES.gazetteerPlaces2024;
const url = `https://www2.census.gov/geo/docs/maps-data/data/gazetteer/${source.vintage}_Gazetteer/${source.vintage}_Gaz_place_national.zip`;
const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
if (!response.ok) throw new Error(`Gazetteer download failed: ${response.status}`);
const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
const file = Object.entries(files).find(([name]) => name.endsWith(".txt"));
if (!file) throw new Error("Gazetteer text file missing");
const lines = strFromU8(file[1]).trim().split(/\r?\n/);
const columns = lines.shift()!.split("\t").map((v) => v.trim());
const required = ["GEOID", "NAME", "USPS", "INTPTLONG", "INTPTLAT", "ALAND", "AWATER"];
if (required.some((name) => !columns.includes(name))) throw new Error("Unexpected Gazetteer columns");
const rows: GazetteerRow[] = lines.map((line) => {
  const values = line.split("\t").map((v) => v.trim());
  const field = (name: string) => values[columns.indexOf(name)];
  const lon = Number(field("INTPTLONG")), lat = Number(field("INTPTLAT"));
  const area = Number(field("ALAND")) + Number(field("AWATER"));
  const zoom = Math.round(Math.max(8, Math.min(12, Math.log2(40_000 * Math.cos(lat * Math.PI / 180) / (Math.sqrt(area / 1e6) * 2 || 1))))) * 10 / 10;
  if (!/^\d{7}$/.test(field("GEOID")) || !Number.isFinite(lon) || !Number.isFinite(lat) || area < 0) throw new Error("Invalid Gazetteer row");
  return [field("GEOID"), field("NAME"), field("USPS"), lon, lat, zoom];
});
if (rows.length < 30_000 || new Set(rows.map((r) => r[0])).size !== rows.length) throw new Error("Incomplete Gazetteer");
writeFileSync(new URL("../data/place-names.json", import.meta.url), JSON.stringify({ source: source.id, vintage: source.vintage, rows }) + "\n");
console.log(`Published ${rows.length} city and place names (${source.vintage}).`);
