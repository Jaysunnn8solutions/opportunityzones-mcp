# opportunityzones-mcp

A screening tool for U.S. Opportunity Zones: an MCP server (and, next, a web
map) that describes any census tract against the 2027 designation rules and the
public data around it.

> **Informational only, not investment, tax or legal advice.** It describes
> places. It does not recommend any tract, fund or transaction, and it does not
> compute anyone's tax outcome.

## What it answers

- **Is this place eligible for the 2027 designations?** Treasury's own list of
  eligible low-income communities, reproduced exactly from the statute
  (`lib/oz/eligibility.ts`, 85,529 of 85,529 tracts), with the income and
  poverty figures behind each verdict.
- **Is it rural** for the 2027 rules, and why: the city or urban area that
  excludes it (IRS Notice 2025-50 and Treasury's March 2026 methodology).
- **Was it a 2018 zone**, and how did the 2018 zones fare against similar
  tracts that were not chosen (`data/oz1/REPORT.md`)?
- **What stacks with it:** HUD Qualified Census Tracts and Difficult
  Development Areas, NMTC low-income communities.
- **What is it like, and what is around it:** people, housing, jobs, lending,
  rents, EPA sites, flood zone, traffic, anchor institutions, the county labor
  market and building permits. Every figure names its source, vintage and
  geography; county- and ZIP-level figures are labelled as such.

The 2027 designations themselves are not yet published; the ingest is ready for
the day Treasury releases them (`pipeline/oz2/designated.ts`).

## MCP tools

Served at `/mcp` (Streamable HTTP, stateless, read-only, no account):

| Tool | What it does |
|---|---|
| `check_address` | Address to tract (Census Geocoder), with the tract's OZ status |
| `get_tract` | Everything published for one tract |
| `list_tracts` | Tracts in a state or county, filtered on OZ and incentive status |
| `compare_tract` | Per-measure percentiles among eligible tracts in the state |
| `oz1_findings` | Findings of the 2018-zone retrospective |
| `nearby` | Live context around a point: flood, EPA sites, traffic, anchors, county jobs |

### Connect

Run locally (`npm run dev`), then add the server to your MCP client.

Claude Code:

```sh
claude mcp add --transport http opportunityzones http://localhost:3000/mcp
```

Claude Desktop (via `mcp-remote` for stdio-only clients), in
`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "opportunityzones": { "command": "npx", "args": ["-y", "mcp-remote", "http://localhost:3000/mcp"] }
  }
}
```

Replace `http://localhost:3000` with the deployed URL once it is hosted.

## Privacy

Nothing personal is stored. The server keeps no accounts and logs no tool
arguments. An address goes only to the Census Bureau to find its tract. Other
live sources receive only an approximate location (a point rounded to about
1 km, or a box around it); exact distances and flood-zone tests are computed
here. See `docs/ARCHITECTURE.md`.

## Setup

Requires Node 22+.

```sh
npm ci
npm test               # unit and integration tests; no network
npm run dev            # http://localhost:3000/mcp
npm run test:client    # calls every tool against the running server
```

The committed `data/` is all the server needs. Some live sources need keys,
read only from the environment. Copy `.env.example` to `.env.local` (gitignored)
and fill in what you have:

| Variable | Needed for | Without it |
|---|---|---|
| `CENSUS_API_KEY` | County labor market (QWI) live; rebuilding the data | That source reports "not available" |
| `BLS_API_KEY` | County unemployment (LAUS) | Reports "not available" |
| `FSQ_PORTAL_TOKEN` | Everyday amenities (Foursquare), once its catalog is configured | Reports "not available" |

Never commit a key: `npm test` fails if one appears in a file git would commit.

### Rebuilding the data

```sh
npm run pipeline   # downloads ~3 GB of federal files into pipeline/cache/, then publishes data/
```

## Data sources

Generated from `pipeline/sources.ts` (`npx tsx scripts/readme-sources.ts`);
each entry there records the licence, attribution, geography, vintage and why
the product needs it. All inputs are public domain or openly licensed for
commercial use.

<!-- sources:start -->
| Source | Publisher | Purpose | Access | Licence |
|---|---|---|---|---|
| [American Community Survey 5-year estimates](https://www.census.gov/data/developers/data-sets/acs-5year.html) | U.S. Census Bureau | statutory, feasibility, impact-baseline | offline (API) | U.S. federal work, no copyright (17 U.S.C. § 105) |
| [2020 Census Redistricting Data (P.L. 94-171), block level](https://www.census.gov/programs-surveys/decennial-census/about/rdo/summary-files.html) | U.S. Census Bureau | statutory, impact-baseline | offline (API) | U.S. federal work, no copyright (17 U.S.C. § 105) |
| [2010 to 2020 Tabulation Block Relationship Files](https://www.census.gov/geographies/reference-files/time-series/geo/relationship-files.html) | U.S. Census Bureau, Geography Division | impact-baseline | offline (file) | U.S. federal work, no copyright (17 U.S.C. § 105) |
| [Connecticut 2022 county subdivision to tract relationship file, and county-to-town crosswalk](https://www2.census.gov/geo/docs/reference/ct_change/) | U.S. Census Bureau, Geography Division | statutory, impact-baseline | offline (file) | U.S. federal work, no copyright (17 U.S.C. § 105) |
| [2010 Cartographic Boundary File, census tracts, 1:500,000](https://www.census.gov/geographies/mapping-files/time-series/geo/carto-boundary-file.2010.html) | U.S. Census Bureau | impact-baseline | offline (file) | U.S. federal work, no copyright (17 U.S.C. § 105) |
| [Designated Qualified Opportunity Zones (2018 round)](https://www.cdfifund.gov/opportunity-zones) | U.S. Department of the Treasury, CDFI Fund | statutory, impact-baseline | offline (file) | U.S. federal work, no copyright (17 U.S.C. § 105) |
| [Opportunity Zones Information Resource: tracts eligible for 2018 designation](https://www.cdfifund.gov/opportunity-zones) | U.S. Department of the Treasury, CDFI Fund | impact-baseline | offline (file) | U.S. federal work, no copyright (17 U.S.C. § 105) |
| [OZ 2.0 Eligible Low-Income Community Tracts (data transparency file)](https://home.treasury.gov/policy-issues/tax-policy/data-transparency/qualified-opportunity-zones) | U.S. Department of the Treasury, Office of Tax Analysis | statutory | offline (file) | U.S. federal work, no copyright (17 U.S.C. § 105) |
| [Designated Qualified Opportunity Zones (2027 round)](https://home.treasury.gov/policy-issues/tax-policy/data-transparency/qualified-opportunity-zones) | U.S. Department of the Treasury | statutory | offline (file) | U.S. federal work, no copyright (17 U.S.C. § 105) |
| [2020 Census Urban Areas, block list (2020_UA_BLOCKS)](https://www.census.gov/programs-surveys/geography/guidance/geo-areas/urban-rural.html) | U.S. Census Bureau, Geography Division | statutory | offline (file) | U.S. federal work, no copyright (17 U.S.C. § 105) |
| [2020 Census places: national place codes and block assignment files (INCPLACE_CDP)](https://www.census.gov/geographies/reference-files/time-series/geo/block-assignment-files.html) | U.S. Census Bureau, Geography Division | statutory | offline (file) | U.S. federal work, no copyright (17 U.S.C. § 105) |
| [LIHTC Qualified Census Tracts, 2026](https://hudgis-hud.opendata.arcgis.com/datasets/HUD::qualified-census-tracts-2026/about) | U.S. Department of Housing and Urban Development | feasibility | offline (API) | U.S. federal work, no copyright (17 U.S.C. § 105) |
| [LIHTC Difficult Development Areas, 2026](https://hudgis-hud.opendata.arcgis.com/search?tags=difficult+development+areas) | U.S. Department of Housing and Urban Development | feasibility | offline (API) | U.S. federal work, no copyright (17 U.S.C. § 105) |
| [2020 ZCTA to 2020 Census Tract Relationship File](https://www.census.gov/geographies/reference-files/time-series/geo/relationship-files.2020.html) | U.S. Census Bureau, Geography Division | feasibility | offline (file) | U.S. federal work, no copyright (17 U.S.C. § 105) |
| [2020 Census Gazetteer File, census tracts](https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.2020.html) | U.S. Census Bureau, Geography Division | feasibility | offline (file) | U.S. federal work, no copyright (17 U.S.C. § 105) |
| [NMTC Low-Income Community eligibility, 2016-2020 ACS](https://www.cdfifund.gov/news/537) | U.S. Department of the Treasury, CDFI Fund | feasibility | offline (file) | U.S. federal work, no copyright (17 U.S.C. § 105) |
| [EPA Superfund (National Priorities List) and Brownfields (ACRES) site locations](https://geopub.epa.gov/arcgis/rest/services/EMEF/efpoints/MapServer) | U.S. Environmental Protection Agency | feasibility | live, offline (API) | U.S. federal work, no copyright (17 U.S.C. § 105) |
| [HMDA Snapshot National Loan-Level Dataset (public LAR)](https://ffiec.cfpb.gov/data-publication/snapshot-national-loan-level-dataset) | Consumer Financial Protection Bureau / FFIEC | impact-baseline | offline (file) | U.S. federal work, no copyright (17 U.S.C. § 105) |
| [NCES EDGE Postsecondary School Locations (current, IPEDS institutions)](https://nces.ed.gov/programs/edge/Geographic/SchoolLocations) | U.S. Department of Education, National Center for Education Statistics | feasibility | offline (API) | U.S. federal work, no copyright (17 U.S.C. § 105) |
| [CMS Hospital General Information](https://data.cms.gov/provider-data/dataset/xubh-q36u) | Centers for Medicare & Medicaid Services | feasibility | offline (API) | U.S. federal work, no copyright (17 U.S.C. § 105) |
| [HUD Small Area Fair Market Rents, FY2026](https://hudgis-hud.opendata.arcgis.com/search?q=small%20area%20fair%20market%20rents) | U.S. Department of Housing and Urban Development | feasibility | offline (API) | U.S. federal work, no copyright (17 U.S.C. § 105) |
| [Highway Performance Monitoring System, national full join (current)](https://services.arcgis.com/xOi1kZaI0eWDREZv/arcgis/rest/services/HPMS_National_Current/FeatureServer) | U.S. Department of Transportation, Federal Highway Administration | feasibility | live | U.S. federal work, no copyright (17 U.S.C. § 105) |
| [TIGER/Line 2024 Primary Roads](https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html) | U.S. Census Bureau, Geography Division | feasibility | offline (file) | U.S. federal work, no copyright (17 U.S.C. § 105) |
| [Foursquare Open Source Places](https://docs.foursquare.com/data-products/docs/access-fsq-os-places) | Foursquare Labs, Inc. | feasibility | live | Apache License 2.0 |
| [FEMA National Flood Hazard Layer (NFHL)](https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer) | Federal Emergency Management Agency | feasibility | live | U.S. federal work, no copyright (17 U.S.C. § 105) |
| [Quarterly Workforce Indicators (QWI)](https://www.census.gov/data/developers/data-sets/qwi.html) | U.S. Census Bureau, Center for Economic Studies (LEHD) | impact-baseline | live | U.S. federal work, no copyright (17 U.S.C. § 105) |
| [Quarterly Census of Employment and Wages (QCEW), open data files](https://www.bls.gov/cew/additional-resources/open-data/) | U.S. Bureau of Labor Statistics | impact-baseline | live | U.S. federal work, no copyright (17 U.S.C. § 105) |
| [Local Area Unemployment Statistics (LAUS), BLS Public Data API v2](https://www.bls.gov/lau/) | U.S. Bureau of Labor Statistics | impact-baseline | live | U.S. federal work, no copyright (17 U.S.C. § 105) |
| [Building Permits Survey, annual county files](https://www.census.gov/construction/bps/) | U.S. Census Bureau | feasibility | offline (file) | U.S. federal work, no copyright (17 U.S.C. § 105) |
| [TIGERweb map services (tract and county boundaries)](https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb) | U.S. Census Bureau, Geography Division | statutory | live | U.S. federal work, no copyright (17 U.S.C. § 105) |
| [OpenFreeMap vector basemap (Positron and Liberty styles)](https://openfreemap.org/) | OpenFreeMap, from OpenStreetMap contributors and OpenMapTiles | feasibility | live | Map data ODbL 1.0 (OpenStreetMap); tile schema and styles BSD/CC-BY (OpenMapTiles); service free, no key |
| [USGS The National Map basemap: Imagery Topo](https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer) | U.S. Geological Survey, National Geospatial Program | feasibility | live | U.S. federal work, no copyright (17 U.S.C. § 105); imagery from USDA NAIP, public domain |
| [FHFA Annual House Price Index, census tract (developmental)](https://www.fhfa.gov/data/hpi/datasets) | Federal Housing Finance Agency | impact-baseline | offline (file) | U.S. federal work, no copyright (17 U.S.C. § 105) |
| [LEHD Origin-Destination Employment Statistics v8, Workplace Area Characteristics](https://lehd.ces.census.gov/data/) | U.S. Census Bureau, Center for Economic Studies | impact-baseline | offline (file) | U.S. federal work, no copyright (17 U.S.C. § 105) |
| [Consumer Price Index for All Urban Consumers (CPI-U), U.S. city average, all items](https://www.bls.gov/cpi/) | U.S. Bureau of Labor Statistics | impact-baseline | offline (API) | U.S. federal work, no copyright (17 U.S.C. § 105) |
| [Census Geocoder (geographies)](https://geocoding.geo.census.gov/geocoder/) | U.S. Census Bureau | statutory, feasibility | live, offline (API) | U.S. federal work, no copyright (17 U.S.C. § 105) |
<!-- sources:end -->

## Status

Built step by step from `docs/NEXT_SESSION_PROMPT.md`; progress is tracked in
issue #1. Next: the web map (Step 4).

## Licence

See `LICENSE`.
