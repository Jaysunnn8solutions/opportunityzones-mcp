/**
 * OZ 1.0 treated and control lists, on 2010 tracts.
 *
 * Two CDFI Fund files define the 2018 round:
 *  - the Information Resource of 2018-02-27 (.xlsb): every tract that COULD be
 *    designated — 31,848 low-income communities, 10,312 same-state contiguous
 *    non-LIC tracts and 446 cross-state ones;
 *  - the final designated list of 2018-12-14 (.xlsx): the 8,764 that were.
 *
 * Three things in these files would silently corrupt a naive join, and each is
 * handled here:
 *
 *  1. 51 designations were made on 2012-2016 ACS data, after the eligible list
 *     was published from 2011-2015 data, so they are absent from it. 32 of them
 *     were on the contiguous list under the older data. They are added to the
 *     universe with their own basis rather than dropped.
 *  2. 26 tracts were renumbered after 2010 (Shannon County SD became Oglala
 *     Lakota, 46113 -> 46102, and similar) and states "may use either set of
 *     numbers". Every GEOID is normalised to the ORIGINAL 2010 Census number,
 *     which is what the block relationship file and 2010-vintage geography use.
 *     The CDFI table is not trusted blindly: one of its 26 rows maps Staten
 *     Island tract 36085000900 onto 36085008900, but both are real, distinct
 *     2010 tracts (1,880 people and 0), and applying that row merged them. A pair
 *     is used only if Census 2010 geography confirms it — the original exists as
 *     a 2010 tract and the new number does not.
 *  3. GEOIDs are forced to 11-character strings.
 *
 * Output: pipeline/clean/oz1_tracts.csv, one row per 2010 tract in the 2018
 * eligible-or-designated universe.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { CLEAN_DIR } from "../config";
import { readWorkbook, type Sheet } from "../lib/archive";
import { fetchCached, log } from "../lib/http";
import { readCsv, tractGeoid, writeCsv } from "../lib/table";

const DESIGNATED_URL = "https://www.cdfifund.gov/system/files/documents/designated-qozs.12.14.18.xlsx";
const ELIGIBLE_URL =
  "https://www.cdfifund.gov/system/files/documents/ozone-information-resource.2.27.18-locked2.xlsb";

export type EligibleBasis =
  | "lic"
  | "contiguous"
  | "cross-state-contiguous"
  | "added-2012-2016"
  | "not-listed";

export interface Oz1Tract {
  /** Original 2010 Census tract GEOID. */
  geoid10: string;
  stateFips: string;
  stateName: string;
  /** On the 2018-02-27 list as a low-income community. */
  lic: boolean;
  /** On either contiguous list (and not an LIC). */
  contiguous: boolean;
  basis: EligibleBasis;
  designated: boolean;
  designatedType: "lic" | "contiguous" | null;
  /** ACS vintage the designation relied on. */
  designatedAcs: "2011-2015" | "2012-2016" | null;
  /** The post-2010 number, when the tract was renumbered. */
  renumberedTo: string | null;
}

function sheet(sheets: Sheet[], name: string): Sheet {
  const s = sheets.find((x) => x.name.trim().toLowerCase() === name.toLowerCase());
  if (!s) throw new Error(`Sheet "${name}" not found; have ${sheets.map((x) => x.name).join(", ")}`);
  return s;
}

/** Map a possibly-renumbered GEOID to the original 2010 Census number. */
export function canonical(geoid: string, newToOld: ReadonlyMap<string, string>): string {
  return newToOld.get(geoid) ?? geoid;
}

export interface Renumbering {
  original: string;
  renumbered: string;
  valid: boolean;
  reason: string;
}

export interface Oz1Lists {
  tracts: Oz1Tract[];
  renumbering: Renumbering[];
  counts: Record<string, number>;
}

/**
 * Check a published renumbering against Census 2010 geography. A genuine
 * renumbering has an original that is a 2010 tract and a new number that is not
 * (it only appears in later vintages). If both are 2010 tracts, the "change" is
 * really two different places, and applying it would merge them.
 */
export function validateRenumbering(
  original: string,
  renumbered: string,
  tracts2010: ReadonlySet<string> | null
): { valid: boolean; reason: string } {
  if (!tracts2010) return { valid: true, reason: "unchecked: no 2010 tract list supplied" };
  if (!tracts2010.has(original)) return { valid: false, reason: "original is not a 2010 Census tract" };
  if (tracts2010.has(renumbered)) {
    return { valid: false, reason: "new number is itself a distinct 2010 Census tract; applying it would merge two tracts" };
  }
  return { valid: true, reason: "confirmed against 2010 Census geography" };
}

export function parseOz1(
  eligibleSheets: Sheet[],
  designatedSheets: Sheet[],
  tracts2010: ReadonlySet<string> | null = null
): Oz1Lists {
  // Renumbering first, so every list below is keyed consistently.
  const renumRows = sheet(eligibleSheets, "Tract Number Changes").rows;
  const renumbering: Renumbering[] = [];
  for (const r of renumRows) {
    const a = tractGeoid(r[1]);
    const b = tractGeoid(r[2]);
    if (a && b) renumbering.push({ original: a, renumbered: b, ...validateRenumbering(a, b, tracts2010) });
  }
  const usable = renumbering.filter((x) => x.valid);
  const newToOld = new Map(usable.map((x) => [x.renumbered, x.original]));
  const oldToNew = new Map(usable.map((x) => [x.original, x.renumbered]));

  const byId = new Map<string, Oz1Tract>();
  const stateNames = new Map<string, string>();
  const upsert = (rawId: unknown, stateName: unknown): Oz1Tract | null => {
    const id0 = tractGeoid(rawId);
    if (!id0) return null;
    const id = canonical(id0, newToOld);
    let t = byId.get(id);
    if (!t) {
      t = {
        geoid10: id,
        stateFips: id.slice(0, 2),
        stateName: String(stateName ?? "").trim(),
        lic: false,
        contiguous: false,
        basis: "not-listed",
        designated: false,
        designatedType: null,
        designatedAcs: null,
        renumberedTo: oldToNew.get(id) ?? null,
      };
      byId.set(id, t);
    }
    if (t.stateName) stateNames.set(t.stateFips, t.stateName);
    return t;
  };

  let licRows = 0;
  for (const r of sheet(eligibleSheets, "1)LICs").rows.slice(1)) {
    const t = upsert(r[1], r[0]);
    if (!t) continue;
    t.lic = true;
    t.basis = "lic";
    licRows++;
  }

  let contigRows = 0;
  for (const r of sheet(eligibleSheets, "2)Contiguous").rows.slice(1)) {
    const t = upsert(r[1], r[0]);
    if (!t) continue;
    contigRows++;
    if (!t.lic) {
      t.contiguous = true;
      t.basis = "contiguous";
    }
  }

  let crossRows = 0;
  for (const r of sheet(eligibleSheets, "3)Cross-State").rows.slice(2)) {
    const t = upsert(r[1], r[0]);
    if (!t) continue;
    crossRows++;
    if (!t.lic && !t.contiguous) {
      t.contiguous = true;
      t.basis = "cross-state-contiguous";
    }
  }

  // The designated list has a title block; find its header row.
  const des = designatedSheets[0].rows;
  const headerAt = des.findIndex((r) =>
    r.some((c) => /census tract number/i.test(String(c ?? "")))
  );
  if (headerAt < 0) throw new Error("Designated list header row not found");
  let designatedRows = 0;
  let added = 0;
  for (const r of des.slice(headerAt + 1)) {
    const wasListed = (() => {
      const id0 = tractGeoid(r[2]);
      return id0 ? byId.has(canonical(id0, newToOld)) : false;
    })();
    const t = upsert(r[2], r[0]);
    if (!t) continue;
    designatedRows++;
    const type = String(r[3] ?? "");
    const acs = String(r[4] ?? "").trim();
    t.designated = true;
    t.designatedType = /low-income/i.test(type) ? "lic" : "contiguous";
    t.designatedAcs = acs === "2012-2016" ? "2012-2016" : "2011-2015";
    if (!wasListed) {
      t.basis = "added-2012-2016";
      added++;
    }
  }

  const tracts = [...byId.values()].sort((a, b) => (a.geoid10 < b.geoid10 ? -1 : 1));
  for (const t of tracts) if (!t.stateName) t.stateName = stateNames.get(t.stateFips) ?? "";

  const counts = {
    licRows,
    contiguousRows: contigRows,
    crossStateRows: crossRows,
    designatedRows,
    designatedAddedFrom2012_2016: added,
    universe: tracts.length,
    lic: tracts.filter((t) => t.lic).length,
    contiguousOnly: tracts.filter((t) => t.contiguous && !t.lic).length,
    designated: tracts.filter((t) => t.designated).length,
    designatedLic: tracts.filter((t) => t.designatedType === "lic").length,
    designatedContiguous: tracts.filter((t) => t.designatedType === "contiguous").length,
    licNotDesignated: tracts.filter((t) => t.lic && !t.designated).length,
    renumberingRows: renumbering.length,
    renumberingRejected: renumbering.filter((x) => !x.valid).length,
  };
  return { tracts, renumbering, counts };
}

/** 2010 Census tracts, from the block relationship file via the crosswalk stage. */
function loadTracts2010(): Set<string> {
  const file = path.join(CLEAN_DIR, "tract2010_land.csv");
  if (!existsSync(file)) {
    throw new Error("Run pipeline/crosswalk/blocks.ts first: renumbering is validated against its 2010 tract list");
  }
  return new Set(readCsv(file).rows.map((r) => r[0]));
}

export async function buildOz1Lists(): Promise<Oz1Lists> {
  const [eligibleBuf, designatedBuf] = await Promise.all([
    fetchCached(ELIGIBLE_URL, "oz1-eligible-2018-02-27.xlsb"),
    fetchCached(DESIGNATED_URL, "oz1-designated-2018-12-14.xlsx"),
  ]);
  const lists = parseOz1(readWorkbook(eligibleBuf), readWorkbook(designatedBuf), loadTracts2010());
  for (const r of lists.renumbering.filter((x) => !x.valid)) {
    log(`oz1 renumbering REJECTED ${r.original} -> ${r.renumbered}: ${r.reason}`);
  }

  const out = path.join(CLEAN_DIR, "oz1_tracts.csv");
  writeCsv(
    out,
    [
      "geoid10",
      "state_fips",
      "state_name",
      "lic",
      "contiguous",
      "basis",
      "designated",
      "designated_type",
      "designated_acs",
      "renumbered_to",
    ],
    lists.tracts.map((t) => [
      t.geoid10,
      t.stateFips,
      t.stateName,
      t.lic,
      t.contiguous,
      t.basis,
      t.designated,
      t.designatedType,
      t.designatedAcs,
      t.renumberedTo,
    ])
  );
  writeCsv(
    path.join(CLEAN_DIR, "oz1_renumbering.csv"),
    ["original_2010", "renumbered", "valid", "reason"],
    lists.renumbering.map((r) => [r.original, r.renumbered, r.valid, r.reason])
  );

  for (const [k, v] of Object.entries(lists.counts)) log(`oz1 ${k.padEnd(30)} ${v.toLocaleString("en-US")}`);
  return lists;
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  buildOz1Lists().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
