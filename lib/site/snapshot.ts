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
  checkedAt?: number;
  unavailable?: string;
}

function why(err: unknown): string {
  if (err instanceof SourceError && err.kind === "limited") return "Source temporarily paused or at its allowance; try later";
  if (err instanceof SourceError && err.kind === "missing-key") return "Source not enabled on this site";
  if (err instanceof SourceError && err.kind === "unavailable") return "Source could not be reached, timed out, or returned a service error";
  if (err instanceof SourceError && err.kind === "rejected") return "Source rejected the request";
  if (err instanceof SourceError && err.kind === "bad-response") return "Source response could not be interpreted";
  return "Source not available right now";
}

export async function siteSnapshot(lon: number, lat: number, only?: SnapshotItem["key"]): Promise<SnapshotItem[]> {
  const run = <T,>(key: SnapshotItem["key"], request: () => Promise<T>): Promise<T> => only && only !== key ? Promise.reject(new Error("not requested")) : request();
  const [flood, quake, fire, epa, roads, places] = await Promise.allSettled([
    run("flood", () => floodZoneAt(lon, lat)),
    run("earthquake", () => seismicDesignAt(lon, lat)),
    run("wildfire", () => wildfireLikelihoodAt(lon, lat)),
    run("epa", () => sitesNear(lon, lat, 1)),
    run("traffic", () => busiestRoadsNear(lon, lat, 0.5)),
    run("amenities", () => amenitiesNear(lon, lat, 1)),
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
      w.burnProbability != null && w.burnProbability > 0 ? `${(w.burnProbability * 100).toPrecision(2)}% modeled annual chance` : w.status === "not-covered" ? "Not modeled here" : "None modeled",
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
  ].filter((result) => !only || result.key === only);
}
