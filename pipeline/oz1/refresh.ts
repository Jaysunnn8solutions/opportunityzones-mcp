/**
 * Rebuild just the OZ 1.0 analysis (data/oz1/) and its inputs, for the
 * "Refresh OZ 1.0 analysis" workflow: the stages of pipeline/index.ts that
 * analysis.csv depends on, in the same order, plus both HMDA years.
 *
 *   npx tsx pipeline/oz1/refresh.ts
 *
 * Needs CENSUS_API_KEY. Downloads are cached under pipeline/cache/.
 */

import path from "node:path";
import { buildAcsVintages } from "../acs/vintages";
import { buildCpi } from "../cpi";
import { buildCrosswalk } from "../crosswalk/blocks";
import { buildCtTracts } from "../crosswalk/connecticut";
import { buildFhfaHpi } from "../fhfa/hpi";
import { buildHmda } from "../hmda/lar";
import { log } from "../lib/http";
import { buildOz2Eligible } from "../oz2/eligible";
import { buildAdjacency } from "./adjacency";
import { assemble } from "./assemble";
import { compare } from "./compare";
import { buildGrowth } from "./growth";
import { buildOz1Lists } from "./lists";

const STAGES: Array<[string, () => Promise<unknown>]> = [
  ["crosswalk (blocks, 2020 P.L. counts, LODES)", buildCrosswalk],
  ["OZ 1.0 designated and eligible lists", buildOz1Lists],
  ["ACS 5-year vintages", buildAcsVintages],
  ["CPI-U", buildCpi],
  ["OZ 2.0 eligible tracts", buildOz2Eligible],
  ["FHFA tract house price index", buildFhfaHpi],
  ["Connecticut GEOID harmonisation", buildCtTracts],
  ["HMDA 2018 (2010 tracts)", () => buildHmda(2018)],
  ["HMDA 2024 (2020 tracts)", () => buildHmda(2024)],
  ["2010 tract adjacency", buildAdjacency],
  ["OZ 1.0 analysis table", assemble],
  ["OZ 1.0 comparison and report", compare],
  ["OZ 1.0 lift in money measures, overall and by kind of tract", buildGrowth],
];

async function main(): Promise<void> {
  for (const [name, run] of STAGES) {
    const t = performance.now();
    log(`=== ${name}`);
    await run();
    log(`=== ${name}: ${((performance.now() - t) / 1000).toFixed(1)} s`);
  }
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
