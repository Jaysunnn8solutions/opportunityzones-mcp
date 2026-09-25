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

import { buildHousingAge } from "./acs/housingAge";
import { buildAnchors } from "./anchors/anchors";
import { buildAcsVintages } from "./acs/vintages";
import { buildCpi } from "./cpi";
import { buildCrosswalk } from "./crosswalk/blocks";
import { buildCtTracts } from "./crosswalk/connecticut";
import { buildFhfaHpi } from "./fhfa/hpi";
import { buildNmtc } from "./cdfi/nmtc";
import { buildEpaSites } from "./epa/sites";
import { buildHmda } from "./hmda/lar";
import { buildHudQctDda } from "./hud/qctDda";
import { log } from "./lib/http";
import { buildAdjacency } from "./oz1/adjacency";
import { assemble } from "./oz1/assemble";
import { compare } from "./oz1/compare";
import { buildOz1Lists } from "./oz1/lists";
import { buildOz2Designated } from "./oz2/designated";
import { buildOz2Eligible } from "./oz2/eligible";
import { buildOz2Rural } from "./oz2/rural";

const STAGES: Array<[string, () => Promise<unknown>]> = [
  ["crosswalk (blocks, 2020 P.L. counts, LODES)", buildCrosswalk],
  ["OZ 1.0 designated and eligible lists", buildOz1Lists],
  ["ACS 5-year vintages", buildAcsVintages],
  ["CPI-U", buildCpi],
  ["OZ 2.0 eligible tracts", buildOz2Eligible],
  ["OZ 2.0 designations (pending Treasury)", buildOz2Designated],
  ["FHFA tract house price index", buildFhfaHpi],
  ["Connecticut GEOID harmonisation", buildCtTracts],
  ["OZ 2.0 rural status, reproduced and explained", buildOz2Rural],
  ["HUD Qualified Census Tracts and Difficult Development Areas", buildHudQctDda],
  ["NMTC low-income community eligibility", buildNmtc],
  ["Housing age (ACS B25034)", buildHousingAge],
  ["EPA Superfund and brownfield sites by tract", buildEpaSites],
  ["HMDA mortgage lending by tract", () => buildHmda()],
  ["Anchor institutions: colleges and hospitals", buildAnchors],
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
