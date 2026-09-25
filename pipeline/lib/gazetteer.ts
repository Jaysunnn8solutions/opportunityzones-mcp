/**
 * 2020 Census Gazetteer: one row per 2020 tract with its land and water area
 * and an internal point guaranteed to fall inside the tract. Used wherever a
 * tract needs a location without loading its polygon.
 *
 * Connecticut is in 2020 Census (old county) GEOIDs, as the 2020 file predates
 * the planning regions.
 */

import { unzipText } from "./archive";
import { fetchCached } from "./http";
import { parseDelimited } from "./table";

const URL = "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2020_Gazetteer/2020_Gaz_tracts_national.zip";

export interface TractPoint {
  geoid: string;
  lon: number;
  lat: number;
  landM2: number;
  waterM2: number;
}

export function parseGazetteer(text: string): TractPoint[] {
  const t = parseDelimited(text, "\t");
  // The last header carries trailing spaces in the published file.
  const at = (name: string) => {
    const i = t.header.findIndex((h) => h.trim() === name);
    if (i < 0) throw new Error(`Gazetteer lacks ${name}; header ${t.header.join(",")}`);
    return i;
  };
  const [g, lat, lon, land, water] = ["GEOID", "INTPTLAT", "INTPTLONG", "ALAND", "AWATER"].map(at);
  return t.rows.map((r) => ({
    geoid: r[g].trim(),
    lon: Number(r[lon]),
    lat: Number(r[lat]),
    landM2: Number(r[land]),
    waterM2: Number(r[water]),
  }));
}

export async function tractPoints(): Promise<TractPoint[]> {
  const zip = await fetchCached(URL, "2020_Gaz_tracts_national.zip");
  const [file] = unzipText(zip, /\.txt$/);
  if (!file) throw new Error("No text file in the 2020 tract Gazetteer zip");
  return parseGazetteer(file.text);
}
