import { zipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { denialRate, LarTally, tallyZip } from "./lar";

const header =
  "activity_year,lei,derived_msa-md,state_code,county_code,census_tract,action_taken,loan_purpose,loan_amount";
const rows = [
  "2024,A,12060,GA,13121,13121003500,1,1,250000", // originated home purchase
  "2024,A,12060,GA,13121,13121003500,1,31,100000", // originated refinance
  "2024,A,12060,GA,13121,13121003500,3,1,200000", // denied
  "2024,A,12060,GA,13121,13121003500,2,1,150000", // approved, not accepted
  "2024,A,12060,GA,13121,13121003500,4,1,90000", // withdrawn: an application, not a decision
  "2024,A,12060,GA,13121,13121003500,6,1,300000", // purchased loan: not an application here
  "2024,A,NA,NA,NA,NA,3,1,50000", // no tract reported
];

describe("LarTally", () => {
  const t = new LarTally();
  for (const l of [header, ...rows]) t.line(l);
  const tract = t.tracts.get("13121003500")!;

  it("counts applications but not purchased loans", () => {
    expect(tract.applications).toBe(5);
    expect(t.rows).toBe(7);
  });

  it("counts originations, denials and home-purchase originations, and sums dollars", () => {
    expect(tract).toMatchObject({ originations: 2, denials: 1, approvedNotAccepted: 1, homePurchaseOriginations: 1, originatedDollars: 350000 });
  });

  it("computes the denial rate over decided applications only", () => {
    // 1 denied of (2 originated + 1 approved-not-accepted + 1 denied).
    expect(denialRate(tract)).toBe(0.25);
  });

  it("counts records with no tract instead of guessing one", () => {
    expect(t.noTract).toBe(1);
  });

  it("fails loudly if a needed column is missing", () => {
    expect(() => new LarTally().line("activity_year,lei")).toThrow(/census_tract/);
  });
});

describe("tallyZip", () => {
  it("streams the CSV out of a zip and tallies it", async () => {
    const csv = [header, ...rows].join("\r\n") + "\r\n";
    const zip = Buffer.from(zipSync({ "2024_public_lar.csv": strToU8(csv) }));
    const t = await tallyZip(zip);
    expect(t.rows).toBe(7);
    expect(t.tracts.get("13121003500")!.originations).toBe(2);
  });
});
