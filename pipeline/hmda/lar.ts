/**
 * Mortgage lending by 2020 tract, from the HMDA Snapshot National Loan-Level
 * Dataset (CFPB/FFIEC), as a before-investment baseline of credit access.
 *
 * The Data Browser API cannot aggregate below the county, so the national
 * loan-level file (~660 MB zipped, 4.6 GB of CSV in a ZIP64 archive) is
 * streamed through pipeline/lib/zipStream.ts: decompressed chunk by chunk and
 * tallied per tract as rows pass, never held whole.
 *
 * Per tract:
 *  - applications: every record except loans purchased from another
 *    institution (action_taken 6), which are not applications in the tract;
 *  - originations (1), denials (3), and the denial rate as denied / (originated
 *    + approved-not-accepted + denied), the usual HMDA definition, which leaves
 *    out withdrawn and incomplete files;
 *  - home-purchase originations (loan_purpose 1) and total dollars originated.
 *
 * Geography: HMDA reports 2020 tracts from 2022 on. Counts are of loan records,
 * not people, and HMDA covers most but not all lenders.
 *
 * Output: pipeline/clean/hmda_{year}.csv
 */

import path from "node:path";
import { CLEAN_DIR } from "../config";
import { fetchCached, log } from "../lib/http";
import { splitLine, writeCsv } from "../lib/table";
import { listMembers, memberLines } from "../lib/zipStream";

export const YEAR = 2024;
const url = (year: number) => `https://files.ffiec.cfpb.gov/static-data/snapshot/${year}/${year}_public_lar_csv.zip`;

export interface TractLending {
  applications: number;
  originations: number;
  approvedNotAccepted: number;
  denials: number;
  homePurchaseOriginations: number;
  originatedDollars: number;
}

export function denialRate(t: TractLending): number | null {
  const decided = t.originations + t.approvedNotAccepted + t.denials;
  return decided > 0 ? Math.round((t.denials / decided) * 1e4) / 1e4 : null;
}

/** Tallies LAR rows by tract. Feed it the header line first, then each row. */
export class LarTally {
  readonly tracts = new Map<string, TractLending>();
  rows = 0;
  noTract = 0;
  private c: { tract: number; action: number; purpose: number; amount: number } | null = null;

  line(text: string): void {
    if (!this.c) {
      const h = splitLine(text).map((x) => x.trim().replace(/^"|"$/g, ""));
      const at = (n: string) => {
        const i = h.indexOf(n);
        if (i < 0) throw new Error(`HMDA LAR lacks column ${n}`);
        return i;
      };
      this.c = { tract: at("census_tract"), action: at("action_taken"), purpose: at("loan_purpose"), amount: at("loan_amount") };
      return;
    }
    const f = text.includes('"') ? splitLine(text).map((x) => x.replace(/^"|"$/g, "")) : text.split(",");
    this.rows++;
    const action = f[this.c.action];
    if (action === "6") return;
    const tract = f[this.c.tract];
    if (!/^\d{11}$/.test(tract)) {
      this.noTract++;
      return;
    }
    let t = this.tracts.get(tract);
    if (!t) {
      t = { applications: 0, originations: 0, approvedNotAccepted: 0, denials: 0, homePurchaseOriginations: 0, originatedDollars: 0 };
      this.tracts.set(tract, t);
    }
    t.applications++;
    if (action === "1") {
      t.originations++;
      const amount = Number(f[this.c.amount]);
      if (Number.isFinite(amount)) t.originatedDollars += amount;
      if (f[this.c.purpose] === "1") t.homePurchaseOriginations++;
    } else if (action === "2") t.approvedNotAccepted++;
    else if (action === "3") t.denials++;
  }
}

/** Tally every line of the one CSV in a (possibly ZIP64) archive. */
export async function tallyZip(zip: Buffer): Promise<LarTally> {
  const csvs = listMembers(zip).filter((m) => /\.csv$/i.test(m.name));
  if (csvs.length !== 1) throw new Error(`Expected one CSV in the HMDA zip, found ${csvs.length}`);
  const tally = new LarTally();
  for await (const line of memberLines(zip, csvs[0])) tally.line(line);
  return tally;
}

export async function buildHmda(year = YEAR): Promise<void> {
  const zip = await fetchCached(url(year), `hmda-${year}-public-lar-csv.zip`, { timeoutMs: 1_800_000 });
  const tally = await tallyZip(zip);

  const ct = [...tally.tracts.keys()].filter((g) => g.startsWith("09"));
  const ctScheme = ct.some((g) => /^091[1-9]/.test(g)) ? "planning regions" : "2020 county codes";
  log(
    `hmda ${year}: ${tally.rows.toLocaleString("en-US")} records, ${tally.tracts.size.toLocaleString("en-US")} tracts, ` +
      `${tally.noTract.toLocaleString("en-US")} applications without a tract; Connecticut keyed by ${ctScheme}`
  );
  writeCsv(
    path.join(CLEAN_DIR, `hmda_${year}.csv`),
    // HMDA reports 2010 tracts through 2021 and 2020 tracts from 2022.
    [year >= 2022 ? "geoid20" : "geoid10", "applications", "originations", "denials", "denial_rate", "home_purchase_originations", "originated_dollars"],
    [...tally.tracts.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([g, t]) => [g, t.applications, t.originations, t.denials, denialRate(t), t.homePurchaseOriginations, t.originatedDollars])
  );
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  buildHmda().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
