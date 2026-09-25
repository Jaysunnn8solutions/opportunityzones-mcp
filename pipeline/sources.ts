/**
 * Every external input the product fetches, offline in the pipeline or live
 * in `lib/sources/`, and the terms it is used under.
 *
 * This file is the licence boundary of the product. A stage or client may only
 * fetch a URL that is built from an entry here, and `sources.test.ts` fails the build if an
 * entry lacks a licence, a commercial-use verdict, or an attribution string. The
 * README's data table is generated from the same list, so what the product says
 * about its inputs cannot drift from what it actually uses.
 *
 * Licence verdicts were checked by an adversarial pass that tried to refute each
 * one (2026-09-15/16). Federal works carry no copyright under 17 U.S.C. § 105,
 * but most agencies still ask for attribution, so "public domain" here never
 * means "no credit needed".
 */

export type CommercialUse = "public-domain" | "attribution" | "share-alike";

/**
 * Why a source is in the product. A source that serves none of these is not
 * admitted (docs/ARCHITECTURE.md, "Admitting a source").
 *
 * - statutory: decides or explains OZ qualification under § 1400Z-1/-2.
 * - feasibility: bears on whether a project can work at a place.
 * - impact-baseline: measures a place before investment, or how past zones
 *   fared, so later change can be seen against it.
 */
export type Purpose = "statutory" | "feasibility" | "impact-baseline";

/**
 * How the product reaches a source (docs/ARCHITECTURE.md, "Where data comes from").
 *
 * - api-runtime: queried live per place, when a user or MCP client asks.
 * - api-pipeline: queried through an API by the offline pipeline, which
 *   writes a national table that ships with the app.
 * - file-pipeline: a published file downloaded by the offline pipeline.
 */
export type Access = "api-runtime" | "api-pipeline" | "file-pipeline";

export interface Source {
  id: string;
  name: string;
  publisher: string;
  /** Landing page a person can check. Fetch URLs are built by the stage. */
  homepage: string;
  license: string;
  commercialUse: CommercialUse;
  /** The credit line the README and the app carry. */
  attribution: string;
  /** Unit and boundary vintage of the data as published. */
  geography: string;
  vintage: string;
  /** What the pipeline takes from it, and anything that bites. */
  notes: string;
  /** At least one; the rationale says how each is served. */
  purposes: readonly Purpose[];
  /** Why the product needs this source, and why nothing already in serves it. */
  rationale: string;
  /** Some sources are reached both ways (live per site, pipeline nationally). */
  access: readonly Access[];
}

export const SOURCES = {
  acs5: {
    id: "acs5",
    name: "American Community Survey 5-year estimates",
    publisher: "U.S. Census Bureau",
    homepage: "https://www.census.gov/data/developers/data-sets/acs-5year.html",
    license: "U.S. federal work, no copyright (17 U.S.C. § 105)",
    commercialUse: "public-domain",
    attribution: "U.S. Census Bureau, American Community Survey 5-year estimates",
    geography:
      "Census tract. Vintages 2010-2019 are tabulated on 2010 tracts; 2020 onward on 2020 tracts (verified: Delaware has 218 tracts in 2010-2019, 262 from 2020).",
    vintage: "2006-2010, 2012-2016, 2013-2017, 2020-2024",
    notes:
      "Dollar figures are in each vintage's final-year dollars. Missing estimates arrive as sentinels such as -666666666 and are mapped to null.",
    purposes: ["statutory", "impact-baseline"],
    rationale:
      "Statutory: median family income and poverty rate are the inputs of the § 1400Z-1(c)(1) low-income-community test. Impact baseline: tract income, rents, home values, vacancy and population before and after the 2018 designations. No other source publishes these at tract level.",
    access: ["api-pipeline"],
  },
  decennialPl: {
    id: "decennialPl",
    name: "2020 Census Redistricting Data (P.L. 94-171), block level",
    publisher: "U.S. Census Bureau",
    homepage: "https://www.census.gov/programs-surveys/decennial-census/about/rdo/summary-files.html",
    license: "U.S. federal work, no copyright (17 U.S.C. § 105)",
    commercialUse: "public-domain",
    attribution: "U.S. Census Bureau, 2020 Census Redistricting Data (P.L. 94-171)",
    geography: "2020 census block",
    vintage: "2020",
    notes:
      "Total population (P1_001N) and housing units (H1_001N) per block weight the 2010-to-2020 tract crosswalk. One API call per state returns every block.",
    purposes: ["impact-baseline"],
    rationale:
      "The 2018 zones are frozen on 2010 tracts while current data is on 2020 tracts. Block population and housing counts weight the crosswalk between them by people rather than land, and are the only complete count at block level.",
    access: ["api-pipeline"],
  },
  blockRelationship: {
    id: "blockRelationship",
    name: "2010 to 2020 Tabulation Block Relationship Files",
    publisher: "U.S. Census Bureau, Geography Division",
    homepage: "https://www.census.gov/geographies/reference-files/time-series/geo/relationship-files.html",
    license: "U.S. federal work, no copyright (17 U.S.C. § 105)",
    commercialUse: "public-domain",
    attribution: "U.S. Census Bureau, 2010 to 2020 Tabulation Block Relationship Files",
    geography: "2010 block x 2020 block, with land area of each intersection",
    vintage: "2020 Census",
    notes:
      "Carries land-area intersections only, no population. Population weights come from joining 2020 block counts, which is what makes the tract crosswalk population- rather than area-weighted.",
    purposes: ["impact-baseline"],
    rationale:
      "Says which 2010 block became which 2020 block. Without it, the 2018 zones (2010 tracts) cannot be compared with 2020-tract outcomes at all.",
    access: ["file-pipeline"],
  },
  connecticutGeography: {
    id: "connecticutGeography",
    name: "Connecticut 2022 county subdivision to tract relationship file, and county-to-town crosswalk",
    publisher: "U.S. Census Bureau, Geography Division",
    homepage: "https://www2.census.gov/geo/docs/reference/ct_change/",
    license: "U.S. federal work, no copyright (17 U.S.C. § 105)",
    commercialUse: "public-domain",
    attribution: "U.S. Census Bureau, Connecticut planning region relationship and crosswalk files (2022)",
    geography: "2022 Connecticut tract (planning-region GEOID) x town, and town x 2020 county",
    vintage: "2022",
    notes:
      "Maps the planning-region tract GEOIDs used by the 2020-2024 ACS, FHFA and Treasury back to the 2020 Census GEOIDs of the crosswalk. Without it every Connecticut tract silently drops out of the joins.",
    purposes: ["statutory", "impact-baseline"],
    rationale:
      "Connecticut's 884 tracts carry different GEOIDs in the 2020 Census than in the ACS and Treasury's 2027 eligibility file. This file is the only authoritative map between them, so Connecticut is neither dropped from eligibility nor from the retrospective.",
    access: ["file-pipeline"],
  },
  tracts2010Cb: {
    id: "tracts2010Cb",
    name: "2010 Cartographic Boundary File, census tracts, 1:500,000",
    publisher: "U.S. Census Bureau",
    homepage: "https://www.census.gov/geographies/mapping-files/time-series/geo/carto-boundary-file.2010.html",
    license: "U.S. federal work, no copyright (17 U.S.C. § 105)",
    commercialUse: "public-domain",
    attribution: "U.S. Census Bureau, 2010 Cartographic Boundary Files",
    geography: "2010 census tract polygons",
    vintage: "2010",
    notes:
      "Used only to find which 2010 tracts border a designated zone, so controls next door to a zone can be excluded as a spillover check.",
    purposes: ["impact-baseline"],
    rationale:
      "Tract adjacency for the spillover check in the 2018 retrospective, since effects can leak into neighbouring tracts. The relationship files carry no adjacency.",
    access: ["file-pipeline"],
  },
  oz1Designated: {
    id: "oz1Designated",
    name: "Designated Qualified Opportunity Zones (2018 round)",
    publisher: "U.S. Department of the Treasury, CDFI Fund",
    homepage: "https://www.cdfifund.gov/opportunity-zones",
    license: "U.S. federal work, no copyright (17 U.S.C. § 105)",
    commercialUse: "public-domain",
    attribution: "U.S. Department of the Treasury, CDFI Fund, Designated Qualified Opportunity Zones",
    geography:
      "2010 census tract. Frozen by statute at 2010 boundaries for the life of the designation (IRS Announcement 2021-10).",
    vintage: "Final list of 2018-12-14",
    notes:
      "GEOIDs can be read as numbers and lose the leading zero for states 01-09; forced to 11-character strings on ingest.",
    purposes: ["statutory", "impact-baseline"],
    rationale:
      "Statutory: whether a tract is a 2018 zone, which stays in force through 2028. Impact baseline: the treated group of the retrospective. The CDFI Fund list is the official record.",
    access: ["file-pipeline"],
  },
  oz1Eligible: {
    id: "oz1Eligible",
    name: "Opportunity Zones Information Resource: tracts eligible for 2018 designation",
    publisher: "U.S. Department of the Treasury, CDFI Fund",
    homepage: "https://www.cdfifund.gov/opportunity-zones",
    license: "U.S. federal work, no copyright (17 U.S.C. § 105)",
    commercialUse: "public-domain",
    attribution:
      "U.S. Department of the Treasury, CDFI Fund, Opportunity Zones Information Resource (2018)",
    geography: "2010 census tract",
    vintage: "2018-02-27, from 2011-2015 ACS",
    notes:
      "The control group. Lists every tract that could have been designated, low-income communities and the non-LIC contiguous tracts, so eligible-but-not-designated tracts can be compared with the designated ones. Published as .xlsb.",
    purposes: ["impact-baseline"],
    rationale:
      "Defines the comparison group for the 2018 retrospective: tracts that were eligible but not chosen. The designated list alone cannot say which tracts could have been.",
    access: ["file-pipeline"],
  },
  oz2Eligible: {
    id: "oz2Eligible",
    name: "OZ 2.0 Eligible Low-Income Community Tracts (data transparency file)",
    publisher: "U.S. Department of the Treasury, Office of Tax Analysis",
    homepage: "https://home.treasury.gov/policy-issues/tax-policy/data-transparency/qualified-opportunity-zones",
    license: "U.S. federal work, no copyright (17 U.S.C. § 105)",
    commercialUse: "public-domain",
    attribution:
      "U.S. Department of the Treasury, OZ 2.0 Eligible LIC Tracts data transparency file (March 2026)",
    geography: "2020 census tract, all 56 jurisdictions",
    vintage: "2026-03-23, from 2020-2024 ACS and 2020 DECIA",
    notes:
      "Same 25,332 eligible tracts as the Rev. Proc. 2026-14 appendix, plus the inputs and comparison-area incomes Treasury used, which is what lets the eligibility engine be checked row by row.",
    purposes: ["statutory"],
    rationale:
      "Treasury's official list of tracts eligible for the 2027 designations, with the inputs it used. It is the authority the eligibility engine is validated against.",
    access: ["file-pipeline"],
  },
  oz2Designated: {
    id: "oz2Designated",
    name: "Designated Qualified Opportunity Zones (2027 round)",
    publisher: "U.S. Department of the Treasury",
    homepage: "https://home.treasury.gov/policy-issues/tax-policy/data-transparency/qualified-opportunity-zones",
    license: "U.S. federal work, no copyright (17 U.S.C. § 105)",
    commercialUse: "public-domain",
    attribution: "U.S. Department of the Treasury, Designated Qualified Opportunity Zones (2027 round)",
    geography: "2020 census tract, Connecticut in 2022 planning-region GEOIDs (as the 2027 eligible list)",
    vintage: "Not yet published: nominations close 2026-09-28 (2026-10-28 if extended); designations take effect 2027-01-01",
    notes:
      "Ingest stage built ahead of publication (pipeline/oz2/designated.ts). Checked against the eligible list and each jurisdiction's statutory cap; disagreements are flagged, never dropped.",
    purposes: ["statutory"],
    rationale:
      "Whether a tract is a designated 2027-2036 zone is the central statutory fact the product reports. Only Treasury's certified list says so; eligibility alone does not.",
    access: ["file-pipeline"],
  },
  fhfaTractHpi: {
    id: "fhfaTractHpi",
    name: "FHFA Annual House Price Index, census tract (developmental)",
    publisher: "Federal Housing Finance Agency",
    homepage: "https://www.fhfa.gov/data/hpi/datasets",
    license: "U.S. federal work, no copyright (17 U.S.C. § 105)",
    commercialUse: "public-domain",
    attribution:
      "Federal Housing Finance Agency, Annual House Price Indexes at the census tract level (Bogin, Doerner and Larson, FHFA Working Paper 16-01)",
    geography: "2020 census tract (per FHFA's FAQ), so it needs the crosswalk to meet 2010 zones",
    vintage: "Annual, through 2024; 2025 rows are blank placeholders",
    notes:
      "Built from repeat sales, so it only exists where enough homes resell. Coverage is thin exactly in low-income tracts, and a missing value must stay missing, never be substituted from a coarser geography without saying so.",
    purposes: ["impact-baseline"],
    rationale:
      "Same-home price change, which ACS median home values cannot give: a median moves when new, pricier housing is built even if no existing home appreciates. Used as an outcome and a pre-trend check, never as a matching feature, because it is revised after the fact.",
    access: ["file-pipeline"],
  },
  lodesWac: {
    id: "lodesWac",
    name: "LEHD Origin-Destination Employment Statistics v8, Workplace Area Characteristics",
    publisher: "U.S. Census Bureau, Center for Economic Studies",
    homepage: "https://lehd.ces.census.gov/data/",
    license: "U.S. federal work, no copyright (17 U.S.C. § 105)",
    commercialUse: "public-domain",
    attribution: "U.S. Census Bureau, LEHD Origin-Destination Employment Statistics (LODES 8)",
    geography: "2020 census block (LODES 8 re-tabulates its whole history on 2020 blocks)",
    vintage: "2002-2023",
    notes:
      "Jobs located in each block, all jobs (JT00) all workers (S000). Noise-infused for disclosure avoidance, so block values are unreliable and only tract sums are used. Puerto Rico is not covered.",
    purposes: ["impact-baseline"],
    rationale:
      "The only source of jobs located in a tract. QWI, QCEW and LAUS stop at county or metro level, so this is the tract-level jobs baseline they sit around.",
    access: ["file-pipeline"],
  },
  blsCpi: {
    id: "blsCpi",
    name: "Consumer Price Index for All Urban Consumers (CPI-U), U.S. city average, all items",
    publisher: "U.S. Bureau of Labor Statistics",
    homepage: "https://www.bls.gov/cpi/",
    license: "U.S. federal work, no copyright (17 U.S.C. § 105)",
    commercialUse: "public-domain",
    attribution: "U.S. Bureau of Labor Statistics, CPI-U (series CUUR0000SA0)",
    geography: "National",
    vintage: "Annual averages of monthly values, 2005-2024",
    notes:
      "Census recommends CPI-U-RS for adjusting ACS dollars, but BLS serves that research file only to browsers (HTTP 403 to scripts). CPI-U through the public API is the reproducible substitute; since 2000 the two series move almost identically.",
    purposes: ["impact-baseline"],
    rationale:
      "Puts dollar changes across ACS vintages into real terms, so income and rent growth are not inflation.",
    access: ["api-pipeline"],
  },
  censusGeocoder: {
    id: "censusGeocoder",
    name: "Census Geocoder (geographies)",
    publisher: "U.S. Census Bureau",
    homepage: "https://geocoding.geo.census.gov/geocoder/",
    license: "U.S. federal work, no copyright (17 U.S.C. § 105)",
    commercialUse: "public-domain",
    attribution: "U.S. Census Bureau, Census Geocoder",
    geography:
      "Address or point to 2020 census tract (Current vintage; Connecticut in 2022 planning-region GEOIDs)",
    vintage: "Current benchmark and vintage at query time",
    notes:
      "Keyless. The searched address goes to the Census Bureau and nowhere else: only the GEOID and coordinates are kept, and the address is never logged, cached or put in an error.",
    purposes: ["statutory"],
    rationale:
      "Turns an address into the tract whose 2027 eligibility and 2018 designation decide OZ status, and is the entry point of every per-site lookup. Chosen over Nominatim, whose public server's policy rules out commercial use, and because it returns the tract directly.",
    access: ["api-runtime"],
  },
} as const satisfies Record<string, Source>;

export type SourceId = keyof typeof SOURCES;

/** One line per source, for the report and README. */
export function attributionLines(): string[] {
  return Object.values(SOURCES).map((s) => `${s.attribution}. ${s.license}.`);
}
