/**
 * The live site snapshot on a tract page: hazards and surroundings at one
 * point, each source reported on its own and marked unavailable when it does
 * not answer. The same sources the MCP nearby tool uses, as data for the page.
 *
 * Informational only. Third parties receive only an approximate location (see
 * each client); nothing is stored or logged.
 */

import { sitesNear } from "../sources/epa/client";
import { floodZoneAt } from "../sources/fema/client";
import { amenitiesNear } from "../sources/foursquare/places";
import { busiestRoadsNear } from "../sources/hpms/client";
import { SourceError } from "../sources/http";
import { wildfireLikelihoodAt } from "../sources/usfs/wildfire";
import { seismicDesignAt } from "../sources/usgs/seismic";

export interface SnapshotItem {
  key: "flood" | "earthquake" | "wildfire" | "epa" | "traffic" | "amenities";
  label: string;
  /** One-line headline, or null when the source did not answer. */
  headline: string | null;
  detail: string | null;
  source: string;
  unavailable?: string;
}

function why(err: unknown): string {
  if (err instanceof SourceError && err.kind === "missing-key") return "not configured on this server";
  if (err instanceof SourceError && err.kind === "unavailable") return "the source did not answer in time";
  return "not available right now";
}

export async function siteSnapshot(lon: number, lat: number): Promise<SnapshotItem[]> {
  const [flood, quake, fire, epa, roads, places] = await Promise.allSettled([
    floodZoneAt(lon, lat),
    seismicDesignAt(lon, lat),
    wildfireLikelihoodAt(lon, lat),
    sitesNear(lon, lat, 1),
    busiestRoadsNear(lon, lat, 0.5),
    amenitiesNear(lon, lat, 1),
  ]);
  const item = <T,>(
    key: SnapshotItem["key"],
    label: string,
    source: string,
    r: PromiseSettledResult<T>,
    show: (v: T) => [string, string | null]
  ): SnapshotItem => {
    if (r.status === "rejected") return { key, label, source, headline: null, detail: null, unavailable: why(r.reason) };
    const [headline, detail] = show(r.value);
    return { key, label, source, headline, detail };
  };
  return [
    item("flood", "Flood zone", "FEMA National Flood Hazard Layer", flood, (f) => [
      f.zone ? `Zone ${f.zone}${f.sfha ? " (high-risk floodplain)" : ""}` : f.status === "no-digital-firm" ? "No digital flood map" : "Not determined",
      f.description,
    ]),
    item("earthquake", "Earthquake", "USGS Seismic Design Maps (ASCE 7-22)", quake, (q) => [`Seismic Design Category ${q.category}`, q.description]),
    item("wildfire", "Wildfire", "USDA Forest Service, Wildfire Risk to Communities", fire, (w) => [
      w.oneInYears ? `About 1 in ${w.oneInYears.toLocaleString("en-US")} years` : w.status === "not-covered" ? "Not modelled here" : "None modelled",
      w.description,
    ]),
    item("epa", "EPA sites within 1 mile", "EPA Superfund (NPL) and brownfields (ACRES)", epa, (e) => {
      const npl = e.sites.filter((s) => s.program === "superfund").length;
      const bf = e.sites.filter((s) => s.program === "brownfield").length;
      const nearest = e.sites[0];
      return [
        `${npl} Superfund, ${bf}${e.truncated ? "+" : ""} brownfield`,
        nearest ? `Nearest: ${nearest.name}, ${nearest.distanceMiles.toFixed(2)} mi. A listing describes history, not current condition.` : "None listed within a mile.",
      ];
    }),
    item("traffic", "Busiest road within ½ mile", "FHWA Highway Performance Monitoring System", roads, (rs) =>
      rs[0]
        ? [`${rs[0].aadt.toLocaleString("en-US")} vehicles a day`, `${rs[0].name ?? "Unnamed road"} (${rs[0].roadClass}), ${rs[0].distanceMiles.toFixed(2)} mi${rs[0].dataYear ? `, ${rs[0].dataYear}` : ""}.`]
        : ["No counted roads", "No road segments with traffic counts within half a mile."]
    ),
    item("amenities", "Everyday amenities within 1 mile", "Foursquare Open Source Places", places, (a) => [
      `${a.amenities.grocery.count} grocery, ${a.amenities.pharmacy.count} pharmacy, ${a.amenities.bank.count} bank`,
      `${a.amenities.restaurant.count} restaurants, ${a.amenities.retail.count} shops.`,
    ]),
  ];
}
