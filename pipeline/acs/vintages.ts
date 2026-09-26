/**
 * ACS 5-year pulls for the OZ 1.0 retrospective.
 *
 * Four vintages, chosen so that every feature describes the world as it could
 * be known when governors nominated (March-April 2018), and every pair of
 * vintages compared is non-overlapping — the Census Bureau's own condition for
 * comparing 5-year estimates:
 *
 *   2006-2010  (vintage 2010)  pre-trend start          2010 tracts
 *   2012-2016  (vintage 2016)  baseline, released 2017-12-07, i.e. the latest
 *                              ACS available at designation   2010 tracts
 *   2013-2017  (vintage 2017)  sensitivity baseline only: released 2018-12-06,
 *                              AFTER designation, so it may never feed a
 *                              feature                        2010 tracts
 *   2020-2024  (vintage 2024)  outcome                  2020 tracts
 *
 * Vintages 2010-2019 are tabulated on 2010 tracts and 2020 onward on 2020 tracts
 * (verified: Delaware returns 218 tracts for 2010-2019 and 262 from 2020).
 *
 * 26 tracts were renumbered after 2010 without a boundary change; later
 * vintages report the new number. Everything on 2010 tracts is re-keyed to the
 * original 2010 Census number so it joins the block relationship file.
 *
 * Output: pipeline/clean/acs_{vintage}.csv, nominal dollars, nulls empty.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { CLEAN_DIR } from "../config";
import { fetchNationalTracts, type AcsTable } from "../lib/census";
import { log } from "../lib/http";
import { readCsv, writeCsv } from "../lib/table";

/** Present in every vintage from 2006-2010 on. */
export const CORE_VARS = {
  homeValue: "B25077_001E",
  homeValueMoe: "B25077_001M",
  rent: "B25064_001E",
  rentMoe: "B25064_001M",
  hhIncome: "B19013_001E",
  hhIncomeMoe: "B19013_001M",
  familyIncome: "B19113_001E",
  povertyUniverse: "B17001_001E",
  povertyBelow: "B17001_002E",
  population: "B01003_001E",
  housingUnits: "B25001_001E",
  occupancyUniverse: "B25002_001E",
  vacant: "B25002_003E",
  tenureUniverse: "B25003_001E",
  ownerOccupied: "B25003_002E",
  yearBuilt: "B25035_001E",
} as const;

/** Only from 2012 on (verified missing from 2006-2010). Baseline levels only. */
export const EXTENDED_VARS = {
  eduUniverse: "B15003_001E",
  eduBachelors: "B15003_022E",
  eduMasters: "B15003_023E",
  eduProfessional: "B15003_024E",
  eduDoctorate: "B15003_025E",
  laborForce: "B23025_003E",
  unemployed: "B23025_005E",
  // Measures of money in the tract's households, for the 2018-zone growth
  // analysis (all published from 2012 on, on the same tables in 2016 and 2024).
  perCapitaIncome: "B19301_001E",
  hhIncomeUniverse: "B19001_001E",
  hhIncome100to125k: "B19001_014E",
  hhIncome125to150k: "B19001_015E",
  hhIncome150to200k: "B19001_016E",
  hhIncome200kPlus: "B19001_017E",
  snapUniverse: "B22003_001E",
  snapReceived: "B22003_002E",
  publicAssistanceUniverse: "B19057_001E",
  publicAssistanceReceived: "B19057_002E",
  vehiclesUniverse: "B25044_001E",
  ownerNoVehicle: "B25044_003E",
  renterNoVehicle: "B25044_010E",
  childrenUnder18: "B09001_001E",
  mortgageUniverse: "B25081_001E",
  withMortgage: "B25081_002E",
} as const;

export const VINTAGES = [
  { vintage: 2010, geography: "tract2010", extended: false, role: "pre-trend start" },
  { vintage: 2016, geography: "tract2010", extended: true, role: "baseline (available at designation)" },
  { vintage: 2017, geography: "tract2010", extended: true, role: "sensitivity baseline (post-designation release)" },
  { vintage: 2024, geography: "tract2020", extended: true, role: "outcome" },
] as const;

export type VarName = keyof typeof CORE_VARS | keyof typeof EXTENDED_VARS;

/** Renumbered -> original, for the pairs Census 2010 geography confirmed. */
function renumberingMap(): Map<string, string> {
  const file = path.join(CLEAN_DIR, "oz1_renumbering.csv");
  if (!existsSync(file)) throw new Error("Run pipeline/oz1/lists.ts first; it writes the renumbering table");
  const t = readCsv(file);
  const iOld = t.col("original_2010");
  const iNew = t.col("renumbered");
  const iValid = t.col("valid");
  return new Map(t.rows.filter((r) => r[iValid] === "1").map((r) => [r[iNew], r[iOld]]));
}

/**
 * Re-key a vintage's renumbered tracts to their 2010 numbers, but only where the
 * original number is absent from that same vintage. If both numbers are present,
 * they are two different tracts and re-keying one onto the other would silently
 * overwrite real data — so that is refused, and any duplicate key that remains
 * fails the build instead of being resolved by whichever row came last.
 */
export function rekeyTo2010(
  geoids: readonly string[],
  newToOld: ReadonlyMap<string, string>
): { keys: string[]; rekeyed: number } {
  const present = new Set(geoids);
  let rekeyed = 0;
  const keys = geoids.map((g) => {
    const old = newToOld.get(g);
    if (old && !present.has(old)) {
      rekeyed++;
      return old;
    }
    return g;
  });
  const seen = new Set<string>();
  for (const k of keys) {
    if (seen.has(k)) throw new Error(`Duplicate tract ${k} after renumbering; refusing to overwrite data`);
    seen.add(k);
  }
  return { keys, rekeyed };
}

export async function buildAcsVintages(): Promise<void> {
  const newToOld = renumberingMap();

  for (const v of VINTAGES) {
    const named: Array<[VarName, string]> = [
      ...(Object.entries(CORE_VARS) as Array<[VarName, string]>),
      ...(v.extended ? (Object.entries(EXTENDED_VARS) as Array<[VarName, string]>) : []),
    ];
    const table: AcsTable = await fetchNationalTracts(
      named.map(([, code]) => code),
      v.vintage
    );

    const entries = [...table.entries()];
    const { keys, rekeyed } =
      v.geography === "tract2010"
        ? rekeyTo2010(entries.map(([g]) => g), newToOld)
        : rekeyTo2010(entries.map(([g]) => g), new Map());
    const rows: Array<Array<string | number | null>> = entries.map(([, row], i) => [
      keys[i],
      ...named.map(([, code]) => row[code]),
    ]);
    rows.sort((a, b) => (String(a[0]) < String(b[0]) ? -1 : 1));

    const key = v.geography === "tract2010" ? "geoid10" : "geoid20";
    const out = path.join(CLEAN_DIR, `acs_${v.vintage}.csv`);
    writeCsv(out, [key, ...named.map(([name]) => name)], rows);
    log(
      `acs ${v.vintage} (${v.role}): ${rows.length.toLocaleString("en-US")} tracts on ` +
        `${v.geography === "tract2010" ? "2010" : "2020"} boundaries` +
        (rekeyed ? `, ${rekeyed} renumbered tracts re-keyed to their 2010 numbers` : "")
    );
  }
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  buildAcsVintages().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
