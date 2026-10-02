/**
 * Live check of the natural-hazard clients against the real services, at
 * public landmarks chosen to exercise each answer (high and low seismic
 * category; wildfire modeled, zero in a dense core, and outside coverage).
 *
 *   npx tsx scripts/check-hazards.ts
 *
 * Exits non-zero if a service does not answer in the shape the client reads.
 */
import { floodZoneAt } from "../lib/sources/fema/client";
import { identifyUrl, SERVICES, wildfireLikelihoodAt } from "../lib/sources/usfs/wildfire";
import { seismicDesignAt } from "../lib/sources/usgs/seismic";

const PLACES: Array<[string, number, number]> = [
  ["Los Angeles City Hall", -118.2427, 34.0537],
  ["Georgia State Capitol, Atlanta", -84.3880, 33.7490],
  ["Joshua Tree NP visitor center, CA", -116.3130, 34.0747],
  ["Midtown Manhattan", -73.9857, 40.7484],
  ["Gulf of Mexico (open water)", -89.5, 27.0],
];

/** When the wildfire parse fails, show what each host actually returns, to diagnose units or scaling. */
async function wildfireDiagnostics(lon: number, lat: number) {
  for (const service of SERVICES) {
    try {
      const info = (await (await fetch(`${service}?f=json`)).json()) as Record<string, unknown>;
      const keep = ["pixelType", "minValues", "maxValues", "meanValues", "bandCount", "serviceDataType", "description"];
      console.log(`    ${new URL(service).host} info:`, JSON.stringify(Object.fromEntries(keep.map((k) => [k, typeof info[k] === "string" ? String(info[k]).slice(0, 300) : info[k]]))));
      const raw = await (await fetch(identifyUrl(lon, lat, service))).text();
      console.log(`    ${new URL(service).host} identify:`, raw.slice(0, 400));
    } catch (err) {
      console.log(`    ${new URL(service).host}: ${err instanceof Error ? err.message : err}`);
    }
  }
}

async function main() {
  for (const [name, lon, lat] of PLACES) {
    console.log(`\n${name}`);
    const [flood, seismic, fire] = await Promise.allSettled([floodZoneAt(lon, lat), seismicDesignAt(lon, lat), wildfireLikelihoodAt(lon, lat)]);
    for (const [label, r] of [["flood", flood], ["seismic", seismic], ["wildfire", fire]] as const) {
      if (r.status === "fulfilled") console.log(`  ${label}: ${JSON.stringify(r.value)}`);
      else {
        console.log(`  ${label}: FAILED ${r.reason instanceof Error ? r.reason.message : r.reason}`);
        if (label === "wildfire") await wildfireDiagnostics(lon, lat);
        // Open water is outside seismic coverage; anything else is a real failure.
        if (!(label === "seismic" && name.includes("open water"))) process.exitCode = 1;
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
