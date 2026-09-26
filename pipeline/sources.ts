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
      "Dollar figures are in each vintage's final-year dollars. Missing estimates arrive as sentinels such as -666666666 and are mapped to null. B25034 (year structure built, 2020-2024) is pulled by pipeline/acs/housingAge.ts.",
    purposes: ["statutory", "feasibility", "impact-baseline"],
    rationale:
      "Statutory: median family income and poverty rate are the inputs of the § 1400Z-1(c)(1) low-income-community test. Impact baseline: tract income, rents, home values, vacancy and population before and after the 2018 designations. Feasibility: the age of the housing stock (B25034), including the only tract-level count of homes built since 2020. No other source publishes these at tract level.",
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
      "Total population (P1_001N) and housing units (H1_001N) per block weight the 2010-to-2020 tract crosswalk. One API call per state returns every block. Place-level P1_001N gives the city populations for the rural test.",
    purposes: ["statutory", "impact-baseline"],
    rationale:
      "The 2018 zones are frozen on 2010 tracts while current data is on 2020 tracts. Block population and housing counts weight the crosswalk between them by people rather than land, and are the only complete count at block level. Statutory: the 2020 Census population of a place decides whether it is a city over 50,000 in the rural test.",
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
  urbanAreas2020: {
    id: "urbanAreas2020",
    name: "2020 Census Urban Areas, block list (2020_UA_BLOCKS)",
    publisher: "U.S. Census Bureau, Geography Division",
    homepage: "https://www.census.gov/programs-surveys/geography/guidance/geo-areas/urban-rural.html",
    license: "U.S. federal work, no copyright (17 U.S.C. § 105)",
    commercialUse: "public-domain",
    attribution: "U.S. Census Bureau, 2020 Census Urban Areas",
    geography: "2020 census block to 2020 urban area",
    vintage: "2020 Census (file of 2023-04-14)",
    notes: "282 MB pipe-delimited text; streamed, never loaded as one string.",
    purposes: ["statutory"],
    rationale:
      "IRS Notice 2025-50 reads the statute's \"urbanized area\" as any 2020 Census urban area, so this is the authoritative input to the rural test of § 1400Z-2(b)(2)(C)(ii).",
    access: ["file-pipeline"],
  },
  places2020: {
    id: "places2020",
    name: "2020 Census places: national place codes and block assignment files (INCPLACE_CDP)",
    publisher: "U.S. Census Bureau, Geography Division",
    homepage: "https://www.census.gov/geographies/reference-files/time-series/geo/block-assignment-files.html",
    license: "U.S. federal work, no copyright (17 U.S.C. § 105)",
    commercialUse: "public-domain",
    attribution: "U.S. Census Bureau, 2020 Census place codes and Block Assignment Files",
    geography: "2020 census block to incorporated place or CDP",
    vintage: "2020 Census",
    notes:
      "national_place2020.txt says whether a place is incorporated or a CDP; the per-state block assignment zips map blocks to places. Place populations come from the 2020 P.L. 94-171 API (decennialPl).",
    purposes: ["statutory"],
    rationale:
      "Identifies the \"city or town that has a population of greater than 50,000\" in the rural test, block by block, so a tract's rural status can be explained by naming the city that excludes it.",
    access: ["file-pipeline"],
  },
  hudQct: {
    id: "hudQct",
    name: "LIHTC Qualified Census Tracts, 2026",
    publisher: "U.S. Department of Housing and Urban Development",
    homepage: "https://hudgis-hud.opendata.arcgis.com/datasets/HUD::qualified-census-tracts-2026/about",
    license: "U.S. federal work, no copyright (17 U.S.C. § 105)",
    commercialUse: "public-domain",
    attribution: "U.S. Department of Housing and Urban Development, Qualified Census Tracts 2026",
    geography: "2020 census tract (Connecticut in 2022 planning-region GEOIDs)",
    vintage: "2026 designation (service data of 2025-09-22)",
    notes:
      "From HUD's own ArcGIS service (owner HUD.Official.Content) because huduser.gov answers scripts with an empty HTTP 202. The layer description still says 2024; the service name and edit date are 2026. All 14,496 GEOIDs match the 2020 tract universe.",
    purposes: ["feasibility"],
    rationale:
      "A LIHTC building in a QCT may take a 30% boost to eligible basis (IRC § 42(d)(5)(B)), one of the incentives most often stacked with an OZ investment. HUD's designation is the only authority.",
    access: ["api-pipeline"],
  },
  hudDda: {
    id: "hudDda",
    name: "LIHTC Difficult Development Areas, 2026",
    publisher: "U.S. Department of Housing and Urban Development",
    homepage: "https://hudgis-hud.opendata.arcgis.com/search?tags=difficult+development+areas",
    license: "U.S. federal work, no copyright (17 U.S.C. § 105)",
    commercialUse: "public-domain",
    attribution: "U.S. Department of Housing and Urban Development, Difficult Development Areas 2026",
    geography:
      "ZIP Code Tabulation Area in metro areas; county (or territory, or Puerto Rico's nonmetro area) outside them. Carried to 2020 tracts as a land share, labelled as ZCTA-derived.",
    vintage: "2026 designation (service data of 2025-09-22)",
    notes:
      "2,615 small-area (ZCTA) and 287 non-metro DDAs. Puerto Rico's single nonmetro DDA is matched to tracts by testing Gazetteer internal points against HUD's polygon.",
    purposes: ["feasibility"],
    rationale:
      "The other half of the LIHTC 30% basis boost: areas with high construction, land and utility costs relative to income. Not tract-level, so it is reported as the share of a tract's land inside a DDA.",
    access: ["api-pipeline"],
  },
  zctaTract2020: {
    id: "zctaTract2020",
    name: "2020 ZCTA to 2020 Census Tract Relationship File",
    publisher: "U.S. Census Bureau, Geography Division",
    homepage: "https://www.census.gov/geographies/reference-files/time-series/geo/relationship-files.2020.html",
    license: "U.S. federal work, no copyright (17 U.S.C. § 105)",
    commercialUse: "public-domain",
    attribution: "U.S. Census Bureau, 2020 ZCTA to Census Tract Relationship File",
    geography: "2020 ZCTA x 2020 census tract, with land area of each intersection",
    vintage: "2020 Census",
    notes: "Tract GEOIDs use Connecticut's 2020 county codes; mapped to planning regions via connecticutGeography.",
    purposes: ["feasibility"],
    rationale:
      "Allocates ZIP-level designations (small-area DDAs, and later Small Area Fair Market Rents) to tracts by land area, the only published link between the two geographies.",
    access: ["file-pipeline"],
  },
  gazetteerTracts2020: {
    id: "gazetteerTracts2020",
    name: "2020 Census Gazetteer File, census tracts",
    publisher: "U.S. Census Bureau, Geography Division",
    homepage: "https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.2020.html",
    license: "U.S. federal work, no copyright (17 U.S.C. § 105)",
    commercialUse: "public-domain",
    attribution: "U.S. Census Bureau, 2020 Census Gazetteer Files",
    geography: "2020 census tract (Connecticut in 2020 county codes)",
    vintage: "2020 Census",
    notes: "Internal point, land and water area per tract; the internal point is guaranteed to fall inside the tract.",
    purposes: ["feasibility"],
    rationale:
      "Gives every tract a location without loading polygons: used to place tracts inside designation polygons (Puerto Rico's nonmetro DDA) and, later, to find what is near a tract.",
    access: ["file-pipeline"],
  },
  nmtcLic: {
    id: "nmtcLic",
    name: "NMTC Low-Income Community eligibility, 2016-2020 ACS",
    publisher: "U.S. Department of the Treasury, CDFI Fund",
    homepage: "https://www.cdfifund.gov/news/537",
    license: "U.S. federal work, no copyright (17 U.S.C. § 105)",
    commercialUse: "public-domain",
    attribution: "U.S. Department of the Treasury, CDFI Fund, NMTC 2016-2020 ACS Low-Income Community eligibility data",
    geography:
      "2020 census tract, 50 states, DC and Puerto Rico; Connecticut in 2020 county codes, mapped to planning regions. Island areas published separately and not included.",
    vintage: "2016-2020 ACS; in effect from 2023-09-01",
    notes:
      "85,395 tracts; the LIC verdict is taken as published. A second sheet lists 62 high-migration rural tracts eligible at 85% of benchmark income. The MFI column is labelled a percent but holds a fraction.",
    purposes: ["feasibility"],
    rationale:
      "NMTC is a federal credit commonly paired with OZ investment in the same places. The CDFI Fund's file is the authority on which tracts qualify.",
    access: ["file-pipeline"],
  },
  epaSites: {
    id: "epaSites",
    name: "EPA Superfund (National Priorities List) and Brownfields (ACRES) site locations",
    publisher: "U.S. Environmental Protection Agency",
    homepage: "https://geopub.epa.gov/arcgis/rest/services/EMEF/efpoints/MapServer",
    license: "U.S. federal work, no copyright (17 U.S.C. § 105)",
    commercialUse: "public-domain",
    attribution: "U.S. Environmental Protection Agency, Envirofacts: Superfund (NPL) and Brownfields (ACRES) sites",
    geography: "Site points; counted by 2020 census tract using 1:500,000 boundaries",
    vintage: "Live at query time (runtime); snapshot at pipeline run (tract counts)",
    notes:
      "1,373 NPL and ~44,000 ACRES points. Runtime queries send EPA a point rounded to ~1 km with a padded radius and filter locally, so the exact searched site never leaves the product. A listed brownfield may already be cleaned up; each result links to EPA's record.",
    purposes: ["feasibility"],
    rationale:
      "Contamination history bears on whether and how a site can be developed, and brownfield cleanup is a common part of OZ projects. EPA's registries are the authoritative record; no other national source lists these sites.",
    access: ["api-runtime", "api-pipeline"],
  },
  hmdaLar: {
    id: "hmdaLar",
    name: "HMDA Snapshot National Loan-Level Dataset (public LAR)",
    publisher: "Consumer Financial Protection Bureau / FFIEC",
    homepage: "https://ffiec.cfpb.gov/data-publication/snapshot-national-loan-level-dataset",
    license: "U.S. federal work, no copyright (17 U.S.C. § 105)",
    commercialUse: "public-domain",
    attribution: "Consumer Financial Protection Bureau and FFIEC, HMDA Snapshot National Loan-Level Dataset",
    geography: "Loan record, reported by 2020 census tract (HMDA uses 2020 tracts from 2022)",
    vintage: "2024 activity year (snapshot as of 2025-05-19)",
    notes:
      "~660 MB zip streamed and tallied per tract; never held whole. Purchased loans are excluded; the denial rate uses decided applications only. Covers most but not all mortgage lenders.",
    purposes: ["impact-baseline"],
    rationale:
      "Mortgage applications, originations and denial rates describe credit access in a tract before investment arrives, and HMDA is the only national source of them at tract level. The Data Browser API cannot aggregate below the county, hence the national file.",
    access: ["file-pipeline"],
  },
  ncesPostsecondary: {
    id: "ncesPostsecondary",
    name: "NCES EDGE Postsecondary School Locations (current, IPEDS institutions)",
    publisher: "U.S. Department of Education, National Center for Education Statistics",
    homepage: "https://nces.ed.gov/programs/edge/Geographic/SchoolLocations",
    license: "U.S. federal work, no copyright (17 U.S.C. § 105)",
    commercialUse: "public-domain",
    attribution: "U.S. Department of Education, NCES, EDGE Postsecondary School Locations",
    geography: "Institution point; placed in 2020 census tracts with 1:500,000 boundaries",
    vintage: "2024-2025 school year",
    notes: "6,605 institutions, from research universities to small certificate schools; NCES's own coordinates.",
    purposes: ["feasibility"],
    rationale:
      "Colleges are stable anchor institutions that draw employment and activity around them. NCES is the authoritative register of every IPEDS institution and its location.",
    access: ["api-pipeline"],
  },
  cmsHospitals: {
    id: "cmsHospitals",
    name: "CMS Hospital General Information",
    publisher: "Centers for Medicare & Medicaid Services",
    homepage: "https://data.cms.gov/provider-data/dataset/xubh-q36u",
    license: "U.S. federal work, no copyright (17 U.S.C. § 105)",
    commercialUse: "public-domain",
    attribution: "Centers for Medicare & Medicaid Services, Hospital General Information",
    geography: "Hospital street address; placed in 2020 census tracts by the Census batch geocoder",
    vintage: "Current CMS release at pipeline run",
    notes:
      "~5,400 Medicare-registered hospitals with type and ownership. CMS gives addresses only; 4,672 of 5,419 geocode to a tract (first run). The rest, mostly rural-route and highway addresses, are listed as unplaced rather than guessed, so hospital counts are a floor.",
    purposes: ["feasibility"],
    rationale:
      "Hospitals are the other half of \"eds and meds\" anchors. CMS's register covers every hospital billing Medicare, which is nearly all of them; the product uses name, type and location only, never the quality ratings.",
    access: ["api-pipeline"],
  },
  hudSafmr: {
    id: "hudSafmr",
    name: "HUD Small Area Fair Market Rents, FY2026",
    publisher: "U.S. Department of Housing and Urban Development",
    homepage: "https://hudgis-hud.opendata.arcgis.com/search?q=small%20area%20fair%20market%20rents",
    license: "U.S. federal work, no copyright (17 U.S.C. § 105)",
    commercialUse: "public-domain",
    attribution: "U.S. Department of Housing and Urban Development, Small Area Fair Market Rents FY2026",
    geography:
      "ZIP Code (metro and nonmetro HUD areas). Carried to 2020 census tracts as a land-weighted average, labelled as ZIP-derived.",
    vintage: "FY2026 (service data of 2025-09-30)",
    notes:
      "From HUD's own ArcGIS table (no key). 51,895 rows for 38,601 ZIPs; a ZIP straddling HUD areas is listed per area with identical rents, which the stage asserts. Replaces the HUD USER API, which needs a token and whose host blocks scripts.",
    purposes: ["feasibility"],
    rationale:
      "HUD's 40th-percentile rent benchmark by ZIP is the published reference for what a rental unit in a place rents for, per bedroom count. No federal rent benchmark exists at tract level; the ZIP figure is labelled as such.",
    access: ["api-pipeline"],
  },
  fhwaHpms: {
    id: "fhwaHpms",
    name: "Highway Performance Monitoring System, national full join (current)",
    publisher: "U.S. Department of Transportation, Federal Highway Administration",
    homepage: "https://services.arcgis.com/xOi1kZaI0eWDREZv/arcgis/rest/services/HPMS_National_Current/FeatureServer",
    license: "U.S. federal work, no copyright (17 U.S.C. § 105)",
    commercialUse: "public-domain",
    attribution: "U.S. Department of Transportation, FHWA Office of Highway Policy Information, Highway Performance Monitoring System",
    geography: "Road segment, looked up around a site (no areal aggregation)",
    vintage: "2024 data year",
    notes:
      "Published by the USDOT ArcGIS organisation. Queried live with a bounding box around a ~1 km-rounded point; exact distances computed locally. The service ignores ordering on spatial queries, so the busiest roads come from a max-AADT statistics query first. No level-of-service measure exists nationally.",
    purposes: ["feasibility"],
    rationale:
      "Traffic volume and truck share on nearby roads bear on retail and logistics feasibility at a site. HPMS is the federal record of AADT on public roads.",
    access: ["api-runtime"],
  },
  tigerPrimaryRoads: {
    id: "tigerPrimaryRoads",
    name: "TIGER/Line 2024 Primary Roads",
    publisher: "U.S. Census Bureau, Geography Division",
    homepage: "https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html",
    license: "U.S. federal work, no copyright (17 U.S.C. § 105)",
    commercialUse: "public-domain",
    attribution: "U.S. Census Bureau, TIGER/Line Shapefiles 2024, Primary Roads",
    geography: "Road centerlines; distance measured from each 2020 census tract's Gazetteer internal point",
    vintage: "2024",
    notes: "Route type I (Interstate) only: 5,619 features. Tracts with no Interstate within 150 miles get no value.",
    purposes: ["feasibility"],
    rationale:
      "Distance to the Interstate network bears on logistics and access. Computed offline because live HPMS queries for it took 2-17 s; TIGER is one 38 MB national file of the same centerlines.",
    access: ["file-pipeline"],
  },
  foursquarePlaces: {
    id: "foursquarePlaces",
    name: "Foursquare Open Source Places",
    publisher: "Foursquare Labs, Inc.",
    homepage: "https://docs.foursquare.com/data-products/docs/access-fsq-os-places",
    license: "Apache License 2.0",
    commercialUse: "attribution",
    attribution: "Foursquare Open Source Places, © Foursquare Labs, Inc., licensed under Apache 2.0",
    geography: "Place point, looked up around a site (no areal aggregation)",
    vintage: "Current release at query time; each place carries date_refreshed",
    notes:
      "NOT YET VERIFIED LIVE: the Iceberg catalog endpoint, warehouse and table come from the Places Portal code page (needs the owner's account) and FSQ_PORTAL_TOKEN is not set. Free account; the separate paid Places API is never used. Queried per site with a box around a ~1 km-rounded point; never bulk-downloaded. Closed places excluded.",
    purposes: ["feasibility"],
    rationale:
      "Everyday amenities near a site (grocery, pharmacy, bank, restaurants, retail) bear on residential and commercial feasibility. OS Places is the only openly licensed national place dataset with commercial rights.",
    access: ["api-runtime"],
  },
  femaNfhl: {
    id: "femaNfhl",
    name: "FEMA National Flood Hazard Layer (NFHL)",
    publisher: "Federal Emergency Management Agency",
    homepage: "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer",
    license: "U.S. federal work, no copyright (17 U.S.C. § 105)",
    commercialUse: "public-domain",
    attribution: "Federal Emergency Management Agency, National Flood Hazard Layer",
    geography: "Effective flood zone polygons, looked up at a site (no areal aggregation)",
    vintage: "Effective FIRMs at query time",
    notes:
      "FEMA is sent only a ~1.3 km box around a ~1 km-rounded point; the exact point is tested against the returned polygons locally. Where there is no digital FIRM the answer says so, never 'no risk'. Levee-protected zone X is described as reduced, not removed, risk. Not an official flood determination.",
    purposes: ["feasibility"],
    rationale:
      "Flood zone bears directly on insurance, construction and financing of a project at a site. FEMA's effective flood maps are the authoritative record; the FEMA National Risk Index was rejected by the owner as too broad.",
    access: ["api-runtime"],
  },
  usgsSeismicDesign: {
    id: "usgsSeismicDesign",
    name: "USGS Seismic Design Maps web service (ASCE 7-22)",
    publisher: "U.S. Geological Survey, Earthquake Hazards Program",
    homepage: "https://earthquake.usgs.gov/ws/designmaps/asce7-22.html",
    license: "U.S. federal work, no copyright (17 U.S.C. § 105)",
    commercialUse: "public-domain",
    attribution: "U.S. Geological Survey, Seismic Design Maps (ASCE 7-22 design ground motions)",
    geography: "Design ground motions at a point (no areal aggregation)",
    vintage: "ASCE 7-22 (2023 USGS National Seismic Hazard Model), at query time",
    notes:
      "Seismic Design Category and design accelerations for Risk Category II on the default site class. USGS is sent the point rounded to two decimals (~1 km); design values vary over tens of km, so the rounding does not change the answer in practice. Not a structural determination, which needs the site's measured soil class.",
    purposes: ["feasibility"],
    rationale:
      "The Seismic Design Category sets the building code's earthquake requirements at a site, so it bears on what a project costs to build there. USGS publishes the values the code adopts; the owner asked for hazard-specific sources in place of the National Risk Index.",
    access: ["api-runtime"],
  },
  usfsWildfireRisk: {
    id: "usfsWildfireRisk",
    name: "Wildfire Risk to Communities: annual burn probability",
    publisher: "USDA Forest Service, Rocky Mountain Research Station",
    homepage: "https://wildfirerisk.org/",
    license: "U.S. federal work, no copyright (17 U.S.C. § 105)",
    commercialUse: "public-domain",
    attribution: "USDA Forest Service, Wildfire Risk to Communities (Scott et al., burn probability)",
    geography: "270 m raster cells, looked up at a site (no areal aggregation)",
    vintage: "2024 release; landscape as of end of 2020 (LANDFIRE 2020 fuels)",
    notes:
      "ImageServer identify on the WRC burn probability raster at the point rounded to two decimals (~1 km), from the federal GeoPlatform copy (imagery.geoplatform.gov), falling back to apps.fs.usda.gov, which refused GitHub-hosted requests. The GeoPlatform copy stores probability x 10,000 as 16-bit integers (inferred from its reported range 0-1352; see VALUE_SCALE). Reported as published (probability and '1 in N years'), with no classes of our own. Zero is reported as 'no wildland fire reached this area in the simulation', never as no risk; NoData as outside coverage.",
    purposes: ["feasibility"],
    rationale:
      "Wildfire likelihood bears on insurability and construction standards at a site. The Forest Service's burn probability is the authoritative national model; the owner asked for hazard-specific sources in place of the National Risk Index.",
    access: ["api-runtime"],
  },
  censusQwi: {
    id: "censusQwi",
    name: "Quarterly Workforce Indicators (QWI)",
    publisher: "U.S. Census Bureau, Center for Economic Studies (LEHD)",
    homepage: "https://www.census.gov/data/developers/data-sets/qwi.html",
    license: "U.S. federal work, no copyright (17 U.S.C. § 105)",
    commercialUse: "public-domain",
    attribution: "U.S. Census Bureau, LEHD Quarterly Workforce Indicators",
    geography: "County, labelled as such in every output",
    vintage: "Newest quarter available per county at query time (about a year behind)",
    notes:
      "Employment, hires and average monthly earnings, all ownership. Newest quarters are often partly released, so each measure reports its own quarter. Year-over-year change compares the same quarter. Earnings nominal. Uses CENSUS_API_KEY.",
    purposes: ["impact-baseline"],
    rationale:
      "A current picture of the county labor market around a tract, which LODES (tract-level but two to three years behind) cannot give. QWI is the Census Bureau's own quarterly series.",
    access: ["api-runtime"],
  },
  blsQcew: {
    id: "blsQcew",
    name: "Quarterly Census of Employment and Wages (QCEW), open data files",
    publisher: "U.S. Bureau of Labor Statistics",
    homepage: "https://www.bls.gov/cew/additional-resources/open-data/",
    license: "U.S. federal work, no copyright (17 U.S.C. § 105)",
    commercialUse: "public-domain",
    attribution: "U.S. Bureau of Labor Statistics, Quarterly Census of Employment and Wages",
    geography: "County, labelled as such in every output",
    vintage: "Newest published quarter at query time (about six months behind)",
    notes:
      "Keyless CSV per county and quarter. County total plus top private supersectors. Suppressed cells (disclosure N) are missing, never zero.",
    purposes: ["impact-baseline"],
    rationale:
      "The most complete count of jobs and wages covered by unemployment insurance, by county and industry, and more current than LODES. BLS is the authority.",
    access: ["api-runtime"],
  },
  blsLaus: {
    id: "blsLaus",
    name: "Local Area Unemployment Statistics (LAUS), BLS Public Data API v2",
    publisher: "U.S. Bureau of Labor Statistics",
    homepage: "https://www.bls.gov/lau/",
    license: "U.S. federal work, no copyright (17 U.S.C. § 105)",
    commercialUse: "public-domain",
    attribution: "U.S. Bureau of Labor Statistics, Local Area Unemployment Statistics",
    geography: "County, labelled as such in every output",
    vintage: "Newest month at query time; the newest is usually preliminary",
    notes:
      "Needs BLS_API_KEY (not yet set): parsing verified on a real series from the keyless v1 API. Not seasonally adjusted; compared year over year. Key sent in the POST body.",
    purposes: ["impact-baseline"],
    rationale:
      "The most current reading of the local labor market (monthly), which QCEW and QWI, both quarterly and lagged, cannot give.",
    access: ["api-runtime"],
  },
  censusBps: {
    id: "censusBps",
    name: "Building Permits Survey, annual county files",
    publisher: "U.S. Census Bureau",
    homepage: "https://www.census.gov/construction/bps/",
    license: "U.S. federal work, no copyright (17 U.S.C. § 105)",
    commercialUse: "public-domain",
    attribution: "U.S. Census Bureau, Building Permits Survey",
    geography: "County (Connecticut by planning region), labelled as such in every output",
    vintage: "Newest annual file at pipeline run (2025 when first built), with the prior year for change",
    notes:
      "Housing units authorized by permit, by building size, using the estimates that include imputation. Permits are authorizations, not starts or completions. Place-level permits are a possible follow-up.",
    purposes: ["feasibility"],
    rationale:
      "The current signal of whether anyone is building near a tract; the ACS 'built 2020 or later' share is tract-level but lags. BPS is the standard federal source; FRED only republishes it under stricter terms.",
    access: ["file-pipeline"],
  },
  censusCartographic2024: {
    id: "censusCartographic2024",
    name: "2024 Cartographic Boundary Files: census tracts (1:500,000) and counties (1:20,000,000)",
    publisher: "U.S. Census Bureau, Geography Division",
    homepage: "https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.2024.html",
    license: "U.S. federal work, no copyright (17 U.S.C. § 105)",
    commercialUse: "public-domain",
    attribution: "U.S. Census Bureau, 2024 Cartographic Boundary Files",
    geography: "2020 census tracts (Connecticut by planning region) and counties, generalised for mapping",
    vintage: "2024 release",
    notes:
      "Two national shapefiles (cb_2024_us_tract_500k, cb_2024_us_county_20m). pipeline/map/boundaries.ts writes one GeoJSON file per state with every tract, plus a counties file, to public/boundaries, keeping only GEOID (and county NAME), with coordinates rounded to 4 decimals (~11 m). The tract file also places point sources in tracts (pipeline/lib/tractIndex.ts), which can misplace a point within ~100 m of a tract edge.",
    purposes: ["statutory"],
    rationale:
      "Draws every tract in a state whose eligibility and designation the product reports, served by the app itself so the map neither waits on nor depends on a Census web service. The Bureau's own map-scale boundaries, with the same GEOIDs as the data.",
    access: ["file-pipeline"],
  },
  censusTigerweb: {
    id: "censusTigerweb",
    name: "TIGERweb map services (tract and county boundaries)",
    publisher: "U.S. Census Bureau, Geography Division",
    homepage: "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb",
    license: "U.S. federal work, no copyright (17 U.S.C. § 105)",
    commercialUse: "public-domain",
    attribution: "U.S. Census Bureau, TIGERweb",
    geography: "2020 census tract and county boundaries (Current vintage; Connecticut by planning region)",
    vintage: "Current TIGER at query time",
    notes:
      "Fallback only: until pipeline/map/boundaries.ts has written public/boundaries (censusCartographic2024), tract and county outlines are fetched per map tile through /api/boundaries and cached at the CDN for 30 days (public data, identical for every viewer). The basemap under them is openFreeMap or usgsNationalMap.",
    purposes: ["statutory"],
    rationale:
      "Draws the tracts whose eligibility and designation the product reports, with the Census Bureau's own boundaries and cartography, at no cost and with no file to host.",
    access: ["api-runtime"],
  },
  openFreeMap: {
    id: "openFreeMap",
    name: "OpenFreeMap vector basemap (Positron and Liberty styles)",
    publisher: "OpenFreeMap, from OpenStreetMap contributors and OpenMapTiles",
    homepage: "https://openfreemap.org/",
    license: "Map data ODbL 1.0 (OpenStreetMap); tile schema and styles BSD/CC-BY (OpenMapTiles); service free, no key",
    commercialUse: "share-alike",
    attribution: "OpenFreeMap © OpenMapTiles, data from OpenStreetMap contributors",
    geography: "Worldwide vector tiles (roads, water, buildings, place names); not census geography",
    vintage: "OpenStreetMap, rebuilt weekly by OpenFreeMap",
    notes:
      "Displayed only, loaded by the browser from tiles.openfreemap.org; nothing is stored or derived from it, so ODbL share-alike does not reach our data. The attribution travels in the style and MapLibre shows it. No request limits and commercial use allowed per openfreemap.org.",
    purposes: ["feasibility"],
    rationale:
      "Street, water and place-name context under the tract colours, so a user can tell where a tract is and what surrounds a site; TIGERweb's map images were too coarse and slow for that.",
    access: ["api-runtime"],
  },
  usgsNationalMap: {
    id: "usgsNationalMap",
    name: "USGS The National Map basemap: Imagery Topo",
    publisher: "U.S. Geological Survey, National Geospatial Program",
    homepage: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer",
    license: "U.S. federal work, no copyright (17 U.S.C. § 105); imagery from USDA NAIP, public domain",
    commercialUse: "public-domain",
    attribution: "USGS The National Map: orthoimagery (NAIP) and US Topo",
    geography: "United States raster tiles to zoom 16; not census geography",
    vintage: "Current cache at view time (NAIP imagery, typically 1-3 years old by state)",
    notes: "Displayed only, loaded by the browser as cached map tiles. Roads and names are baked into the images.",
    purposes: ["feasibility"],
    rationale:
      "Aerial view of what is on the ground at a site (vacant land, existing buildings, surroundings), which bears on the original-use and substantial-improvement paths and nothing else in the product shows.",
    access: ["api-runtime"],
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
      "Keyless. The searched address goes to the Census Bureau and nowhere else: only the GEOID and coordinates are kept, and the address is never logged, cached or put in an error. The pipeline also uses its batch endpoint for public facility addresses (CMS hospitals).",
    purposes: ["statutory", "feasibility"],
    rationale:
      "Turns an address into the tract whose 2027 eligibility and 2018 designation decide OZ status, and is the entry point of every per-site lookup. Chosen over Nominatim, whose public server's policy rules out commercial use, and because it returns the tract directly. Feasibility: places hospitals, which CMS publishes by address only.",
    access: ["api-runtime", "api-pipeline"],
  },
} as const satisfies Record<string, Source>;

export type SourceId = keyof typeof SOURCES;

/** One line per source, for the report and README. */
export function attributionLines(): string[] {
  return Object.values(SOURCES).map((s) => `${s.attribution}. ${s.license}.`);
}
