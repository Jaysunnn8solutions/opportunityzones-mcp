/**
 * Rebuild everything, raw -> clean -> analysis, in dependency order.
 *
 *   npm run pipeline
 *   CENSUS_ENV_FILE=../atl-mcp/.env.local npm run pipeline   # reuse a key
 *
 * Every download is cached under pipeline/cache/, so a re-run makes no network
 * calls it has already made and costs a few minutes of CPU. Delete a cached file
 * to force that one source to refresh.
 *
 * Order matters in three places, each enforced by the stage itself failing
 * loudly if its input is missing:
 *  - the OZ 1.0 lists validate the CDFI renumbering table against the 2010
 *    tract list the crosswalk writes;
 *  - ACS re-keys renumbered tracts using that validated table;
 *  - FHFA checks its boundary vintage against the ACS tract lists.
 */

import { buildAcsVintages } from "./acs/vintages";
import { buildCpi } from "./cpi";
import { buildCrosswalk } from "./crosswalk/blocks";
import { buildCtTracts } from "./crosswalk/connecticut";
import { buildFhfaHpi } from "./fhfa/hpi";
import { log } from "./lib/http";
import { buildAdjacency } from "./oz1/adjacency";
import { assemble } from "./oz1/assemble";
import { compare } from "./oz1/compare";
import { buildOz1Lists } from "./oz1/lists";
import { buildOz2Eligible } from "./oz2/eligible";

const STAGES: Array<[string, () => Promise<unknown>]> = [
  ["crosswalk (blocks, 2020 P.L. counts, LODES)", buildCrosswalk],
  ["OZ 1.0 designated and eligible lists", buildOz1Lists],
  ["ACS 5-year vintages", buildAcsVintages],
  ["CPI-U", buildCpi],
  ["OZ 2.0 eligible tracts", buildOz2Eligible],
  ["FHFA tract house price index", buildFhfaHpi],
  ["Connecticut GEOID harmonisation", buildCtTracts],
  ["2010 tract adjacency", buildAdjacency],
  ["OZ 1.0 analysis table", assemble],
  ["OZ 1.0 comparison and report", compare],
];

async function main(): Promise<void> {
  const t0 = performance.now();
  for (const [name, run] of STAGES) {
    const t = performance.now();
    log(`=== ${name}`);
    await run();
    log(`=== ${name}: ${((performance.now() - t) / 1000).toFixed(1)} s`);
  }
  log(`pipeline complete in ${((performance.now() - t0) / 1000 / 60).toFixed(1)} min`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
