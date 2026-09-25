/**
 * Age of the housing stock by 2020 tract, from ACS table B25034 ("Year
 * Structure Built"), 2020-2024 5-year estimates.
 *
 * Two uses, both about the place rather than any project:
 *  - Existing buildings. OZ property must be original-use or substantially
 *    improved (§ 1400Z-2(d)(2)(D)); the share of older stock says how much of a
 *    tract's building stock is the kind that would need the improvement route.
 *  - New construction. "Built 2020 or later" is the only tract-level signal of
 *    recent building. It lags a few years, and small counts carry wide margins
 *    of error, so its MOE is kept and reported beside it. County building
 *    permits (a later stage) are the current but coarser companion.
 *
 * A separate stage from pipeline/acs/vintages.ts on purpose: that one serves the
 * 2018 retrospective, and adding variables there would re-batch and re-fetch
 * every vintage.
 *
 * Output: pipeline/clean/acs_2024_housing_age.csv
 */

import path from "node:path";
import { CLEAN_DIR } from "../config";
import { fetchNationalTracts, type AcsRow } from "../lib/census";
import { log } from "../lib/http";
import { writeCsv } from "../lib/table";

export const VINTAGE = 2024;

/** B25034 categories, newest first, as labelled in the 2024 ACS. */
export const YEAR_BUILT = {
  total: "B25034_001E",
  built2020Later: "B25034_002E",
  built2010to2019: "B25034_003E",
  built2000to2009: "B25034_004E",
  built1990to1999: "B25034_005E",
  built1980to1989: "B25034_006E",
  built1970to1979: "B25034_007E",
  built1960to1969: "B25034_008E",
  built1950to1959: "B25034_009E",
  built1940to1949: "B25034_010E",
  built1939Earlier: "B25034_011E",
} as const;
export const BUILT_2020_LATER_MOE = "B25034_002M";

const PRE_1980: ReadonlyArray<keyof typeof YEAR_BUILT> = [
  "built1970to1979",
  "built1960to1969",
  "built1950to1959",
  "built1940to1949",
  "built1939Earlier",
];

export interface HousingAge {
  units: number | null;
  built2020Later: number | null;
  built2020LaterMoe: number | null;
  /** Shares of all housing units; null when the tract has no units or data. */
  share2020Later: number | null;
  share2010Later: number | null;
  sharePre1980: number | null;
}

function share(part: number | null, whole: number | null): number | null {
  if (part == null || whole == null || whole <= 0) return null;
  return Math.round((part / whole) * 1e4) / 1e4;
}

export function shapeHousingAge(row: AcsRow): HousingAge {
  const units = row[YEAR_BUILT.total];
  const recent = row[YEAR_BUILT.built2020Later];
  const decade = row[YEAR_BUILT.built2010to2019];
  const old = PRE_1980.map((k) => row[YEAR_BUILT[k]]);
  const oldSum = old.some((v) => v == null) ? null : old.reduce<number>((s, v) => s + (v ?? 0), 0);
  return {
    units,
    built2020Later: recent,
    built2020LaterMoe: row[BUILT_2020_LATER_MOE],
    share2020Later: share(recent, units),
    share2010Later: recent == null || decade == null ? null : share(recent + decade, units),
    sharePre1980: share(oldSum, units),
  };
}

export async function buildHousingAge(): Promise<void> {
  const codes = [...Object.values(YEAR_BUILT), BUILT_2020_LATER_MOE];
  const table = await fetchNationalTracts(codes, VINTAGE);
  const rows = [...table.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([geoid, row]) => {
      const h = shapeHousingAge(row);
      return [
        geoid,
        h.units,
        h.built2020Later,
        h.built2020LaterMoe,
        h.share2020Later,
        h.share2010Later,
        h.sharePre1980,
      ];
    });
  writeCsv(
    path.join(CLEAN_DIR, `acs_${VINTAGE}_housing_age.csv`),
    ["geoid20", "housing_units", "built_2020_later", "built_2020_later_moe", "share_built_2020_later", "share_built_2010_later", "share_built_pre_1980"],
    rows
  );
  log(`housing age: ${rows.length.toLocaleString("en-US")} tracts from ACS ${VINTAGE - 4}-${VINTAGE} B25034`);
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  buildHousingAge().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
