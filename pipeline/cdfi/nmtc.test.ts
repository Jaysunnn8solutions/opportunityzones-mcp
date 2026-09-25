import { describe, expect, it } from "vitest";
import type { Sheet } from "../lib/archive";
import { parseNmtc } from "./nmtc";

// Shaped like the CDFI Fund's 2016-2020 file: GEOIDs as text, poverty as a
// percent, the MFI "percent" actually a fraction, N/A for missing values, and
// a second sheet of high-migration tracts below a notes paragraph.
const header = [
  "2020 Census Tract Number FIPS code. GEOID",
  "OMB Metro/Non-metro Designation, March 2020 (OMB Bulletin No. 20-01)",
  "Does Census Tract Qualify For NMTC Low-Income Community (LIC) on Poverty or Income Criteria?",
  "Census Tract Poverty Rate % (2016-2020 ACS)",
  "Does Census Tract Qualify on Poverty Criteria>=20%?",
  "Census Tract Percent of Benchmarked Median Family Income (%) 2016-2020 ACS",
  "Does Census Tract Qualify on Median Family Income Criteria<=80%?",
  "Census Tract Unemployment Rate (%) 2016-2020",
  "County Code",
  "State Name",
  "County Name",
  "Census Tract Unemployment to National Unemployment Ratio ",
];
const sheets: Sheet[] = [
  {
    name: "2016-2020",
    rows: [
      header,
      ["01001020200", "Metro", "YES", 17, "NO", 0.736, "YES", 4, "01001", "Alabama", "Autauga", 0.74],
      ["01001020100", "Metro", "NO", 13.7, "NO", 1.038, "NO", 2.1, "01001", "Alabama", "Autauga", 0.39],
      ["01035960400", "Non-Metro", "NO", "N/A", "NO", 0.817, "NO", 5, "01035", "Alabama", "Conecuh", 1.2],
    ],
  },
  {
    name: "High migration tracts",
    rows: [
      ["The New Markets Tax Credit (NMTC) Program supports ..."],
      ["2020 Census Tract Number FIPS code. GEOID", "High migration ...", "Census Tract Percent ..."],
      ["01035960400", -0.12, 0.817],
    ],
  },
];

describe("parseNmtc", () => {
  const [lic, notLic, migration] = parseNmtc(sheets);

  it("takes the CDFI Fund's verdict and converts poverty to a share", () => {
    expect(lic).toMatchObject({ geoid: "01001020200", lic: true, highMigration: false, metro: true, povertyRate: 0.17, mfiRatio: 0.736 });
    expect(notLic.lic).toBe(false);
  });

  it("adds tracts eligible only through the high-migration rule", () => {
    expect(migration).toMatchObject({ geoid: "01035960400", lic: true, highMigration: true, metro: false });
  });

  it("reads N/A as missing, never as zero", () => {
    expect(migration.povertyRate).toBeNull();
  });

  it("fails loudly if a column disappears", () => {
    const broken: Sheet[] = [{ ...sheets[0], rows: [header.slice(0, 3), ...sheets[0].rows.slice(1)] }, sheets[1]];
    expect(() => parseNmtc(broken)).toThrow(/column/);
  });
});
