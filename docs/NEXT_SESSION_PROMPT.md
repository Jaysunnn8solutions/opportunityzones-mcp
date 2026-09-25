# Handoff prompt: data sources, API clients, MCP server

Paste everything below the line into a new Claude Code session on
`Jaysunnn8solutions/opportunityzones-mcp`.

---

You are continuing work on `opportunityzones-mcp`, an Opportunity Zone
**screening tool** for investors and funds: a TypeScript/Next.js 16 app plus an
MCP server. Read `AGENTS.md`, `docs/ARCHITECTURE.md` (the agreed data-access,
caching and privacy design), `lib/oz/eligibility.ts`, `pipeline/sources.ts`,
`pipeline/lib/env.ts`, `pipeline/lib/http.ts` and `data/oz1/REPORT.md` before
writing any code. This repo uses Next.js 16: read the relevant guide in
`node_modules/next/dist/docs/` before touching app code.

## Non-negotiable rules (from AGENTS.md)

- Screening tool, not an adviser. Output describes places, never recommends an
  allocation, fund or deal. "Informational, not investment/tax/legal advice"
  appears in the UI, every MCP tool description and every tool response.
- Every source must be license-clean for commercial use and registered in
  `pipeline/sources.ts`. Add it there or not at all.
- Nothing personal is stored. Never log tool arguments, addresses or geocode
  queries, including in error messages sent to third-party APIs' logs of ours.
- API keys come only from the environment (`.env.local`, gitignored, or
  injected env vars). Never commit, print or log a key. `.env.example` lists
  every variable; keep it in sync with any new one.

## Step 0: make the build green (done, PR #2)

1. `npm ci` fails: `package-lock.json` is missing `@emnapi/core` and
   `@emnapi/runtime`. Regenerate the lockfile with `npm install`.
2. `xlsx` is installed from `cdn.sheetjs.com`. It is needed only by the
   pipeline. If that host is unreachable, keep it but make sure the app, tests
   and MCP server do not depend on it being installed (e.g. move it to
   `optionalDependencies` and import it lazily in `pipeline/lib/archive.ts`).
3. Fix the type error at `scripts/validate-eligibility.ts:93` (`text` used
   before assigned; the `catch` calls `process.exit`, so declare the return
   type `never` path explicitly or restructure).
4. `package.json` references `pipeline/tiles.ts` and `scripts/test-client.ts`,
   which do not exist. Create them or remove the scripts.
5. `npm run lint`, `npm run type-check`, `npm test` all pass. Commit.

## Step 1: require a documented reason for every source (done)

`Source` in `pipeline/sources.ts` now requires `purposes` (**statutory**,
**feasibility** or **impact-baseline**), a `rationale`, and `access` (one or
more of `"api-runtime" | "api-pipeline" | "file-pipeline"`), and
`pipeline/sources.test.ts` enforces them. Every new source must fill them in.

A source is admissible only if it (1) serves one of those three purposes,
(2) is tract-level or honestly allocable to tracts (otherwise label the
coarser geography in every output), (3) is authoritative and maintained,
(4) is license-clean, (5) is not a weaker duplicate of something already in.

## Step 2: API clients

Prefer live APIs. Create one typed client per source under `lib/sources/<id>/`
with: timeouts, retries with backoff, key redaction in every thrown or logged
URL, and no logging of query arguments. Caching follows the table in
`docs/ARCHITECTURE.md`: shared caching only for results keyed by tract GEOID,
never for exact searched coordinates or addresses.
Reuse patterns from `pipeline/lib/http.ts` and `pipeline/lib/census.ts`.
Each client gets unit tests with recorded fixtures (no network in `npm test`).

Decide per source whether it is queried **at runtime** (per-site lookups from
the MCP server/app) or **in the pipeline** (national tract tables rebuilt on a
schedule) using the rule in `docs/ARCHITECTURE.md`, record it in `access`, and
justify the choice in the PR.

Sources to add, in priority order:

| # | Source | Purpose | Access (proposed) | Notes |
|---|---|---|---|---|
| 1 | 2027 OZ designations (Treasury/CDFI) | statutory | pipeline | Not yet published. Build the ingest stage and schema now so it lands the day it appears. |
| 2 | Census urban areas (2020) + places > 50,000 | statutory | pipeline | **Done (block-based), `pipeline/oz2/rural.ts`.** Follows IRS Notice 2025-50 and Treasury's March 2026 rural methodology; agrees with Treasury's flag on 98.3% of tracts and explains each. **Follow-up:** Treasury excludes detached "islands" of an urban area and counts urban areas that only touch a city; both need full-resolution urban area, place and 2020 tract polygons (~1 GB) to reproduce, which would move the explained share toward 100%. Treasury's flag stays the authority either way. |
| 3 | HUD Qualified Census Tracts + Difficult Development Areas | feasibility | pipeline | **Done, `pipeline/hud/qctDda.ts`.** From HUD's own ArcGIS services (huduser.gov returns an empty HTTP 202 to scripts). DDAs carried to tracts as a land share via the ZCTA-tract file. |
| 4 | CDFI Fund NMTC eligible tracts | feasibility | pipeline | **Done, `pipeline/cdfi/nmtc.ts`.** 2016-2020 ACS file on 2020 tracts; Connecticut mapped to planning regions; island areas not yet included (separate CDFI release). |
| 5 | ACS year structure built (B25034) | statutory | pipeline (Census API) | **Done, `pipeline/acs/housingAge.ts`** (own stage, so the retrospective's cached vintages are untouched). Relevant to the substantial-improvement test on existing buildings. Its "built 2020 or later" share is also the only **tract-level** new-construction signal (lags a few years); pair it with #15. |
| 6 | EPA brownfields (ACRES) + Superfund NPL (SEMS) | feasibility | runtime and pipeline | **Done:** `lib/sources/epa/client.ts` (sites near a point; EPA gets only a ~1 km-rounded point) and `pipeline/epa/sites.ts` (counts per tract via `pipeline/lib/tractIndex.ts`). |
| 7 | HMDA (CFPB Data Browser API) | impact baseline | pipeline | **Done, `pipeline/hmda/lar.ts`.** The Data Browser API cannot aggregate below the county, so the national 2024 loan-level file is streamed (ZIP64, 4.6 GB CSV) via `pipeline/lib/zipStream.ts`. |
| 8 | Anchor institutions: IPEDS postsecondary (NCES) + CMS hospitals | feasibility | pipeline | **Done, `pipeline/anchors/anchors.ts`.** Colleges from NCES EDGE coordinates; hospitals via the Census batch geocoder. Writes a small `anchor_points.csv` so "nearby" needs no live call. |
| 9 | HUD Small Area Fair Market Rents | feasibility | pipeline | **Done, `pipeline/hud/safmr.ts`.** From HUD's keyless ArcGIS table, so no `HUD_USER_API_TOKEN` is needed. ZIP-level, carried to tracts as a land-weighted average and labelled so. |
| 10 | FHWA HPMS traffic counts via NTAD ArcGIS REST | feasibility | runtime | **Done:** `lib/sources/hpms/client.ts` (busiest roads near a site, live) and `pipeline/roads/interstate.ts` (distance to nearest Interstate per tract, offline from TIGER, because live queries took 2-17 s). **No level-of-service**: no national source exists. |
| 11 | Foursquare OS Places | feasibility | runtime | **Built, not yet live:** `lib/sources/foursquare/places.ts` (query, categories, summary, tested). To finish: the owner sets `FSQ_PORTAL_TOKEN`, copies the endpoint/warehouse/table from the Portal's code page into `CATALOG`, then add `@duckdb/node-api` and a runner, and check the Vercel bundle size. See below. |
| 12 | Natural hazards | feasibility | runtime | See below. |
| 13 | Census Quarterly Workforce Indicators (QWI) | impact baseline | runtime (Census API, `CENSUS_API_KEY`) | **Done, `lib/sources/census/qwi.ts`** (county, all industries). By-industry breakdown is a possible follow-up. |
| 14 | BLS jobs and unemployment: QCEW + LAUS | impact baseline | runtime | QCEW: county jobs and wages by industry, quarterly, about 6 months behind, open data files with no key. LAUS: county/metro unemployment, monthly, via BLS API v2 (`BLS_API_KEY`; the keyless v1 allows only 25 requests/day). Label the geography. See below. |
| 15 | Census Building Permits Survey (BPS) | feasibility | pipeline | County and permit-issuing place, monthly/annual, permitted units by building size. File downloads, no key. **Not tract-level**: label it in every output. See below. |

### Foursquare Open Source Places (https://opensource.foursquare.com/os-places/)

- **Never bulk-download it.** Query it remotely (e.g. DuckDB `@duckdb/node-api`
  with `httpfs` reading the published Parquet/Iceberg with bounding-box and
  column pruning), fetching only the rows for the tract or site being looked up.
- Access is through the Foursquare Places Portal (https://places.foursquare.com/),
  which since Oct 2025 serves OS Places from an Iceberg REST catalog
  authenticated with a bearer token (`FSQ_PORTAL_TOKEN`). The portal's
  "OS Places → Code" page has DuckDB/Spark/PyIceberg snippets; use its exact
  endpoint, namespace and table names. Re-confirm the license is Apache-2.0
  before registering the source.
- The portal account is free and OS Places stays free under Apache-2.0 with
  attribution (confirmed from Foursquare's docs and announcement, Sep 2026).
  Do not confuse it with Foursquare's separate **paid Places API**, and never
  add a payment method or use a paid endpoint. Hugging Face is not used.
- Exclude closed places (`date_closed`) and report data freshness
  (`date_refreshed`). Aggregate by Foursquare category into tract-level measures
  (counts and nearest distance for grocery, pharmacy, bank, restaurants/retail).
- A national precompute would effectively stream the whole dataset. Do not do
  that without asking the user first; start with runtime per-tract queries plus
  a cache.

### Natural hazard risk: do NOT use the FEMA National Risk Index

The user rejected the NRI as too broad. Replace it with **hazard-specific,
authoritative sources evaluated at the tract or site**. Proposed (confirm with
the user before building beyond flood):

- **Flood:** FEMA National Flood Hazard Layer ArcGIS REST: share of the tract
  in a Special Flood Hazard Area (A/V zones) and a point lookup for a site.
  Report "no digital FIRM" areas explicitly rather than as "no risk".
  **Point lookup done** (`lib/sources/fema/client.ts`). **Follow-up:** the
  tract SFHA share needs tract polygons intersected with FEMA's detailed zone
  polygons; large rural tracts make that heavy live, so it wants its own design
  (offline per state, or on demand with caching by GEOID).
- **Seismic:** USGS Seismic Design Maps web service at a point.
- **Wildfire:** USFS Wildfire Risk to Communities (public domain).
- **Coastal / sea level rise:** NOAA, optional.

Present each hazard as its own measure. Do not combine them into a composite
risk score.

### Jobs and building activity

- **Jobs:** LODES (already in the pipeline) stays the tract-level core, as the
  impact baseline of jobs located in the tract. QWI (#13) and QCEW/LAUS (#14)
  add a current county/metro picture around it. They never stand in for tract
  values, and every output names their geography and period.
- **Building activity:** no public source tracks new construction at tract
  level. Use BPS (#15) at county/place level for current permits, and ACS
  "built 2020 or later" (#5) as the lagging tract-level signal. Show them side
  by side, each labelled.
- **Rejected:** job postings (Lightcast, Indeed) and Dodge/ConstructConnect,
  which are proprietary and not license-clean. FRED is also rejected: it only
  republishes BPS (a weaker duplicate) and its terms are stricter than the
  public-domain original.
- **Deferred; ask the user first:** BEA regional data (`BEA_API_KEY`), and
  city open-data permit portals (site-level, but city by city with differing
  licenses; only for markets the user picks).

## Step 3: MCP server at `/mcp`

Using `mcp-handler` and `@modelcontextprotocol/server` (already dependencies):

Reuse, by copying (never importing or calling), the patterns in the sibling
project `C:\Projects\portfolio\atl-mcp`, which is **read-only** and whose
`.env*` files must never be opened: `app/mcp/route.ts` (handler setup),
`lib/tools/*` (config/handler split, `text`/`error` helpers),
`scripts/test-client.ts`, `.github/workflows/ci.yml` and `refresh-data.yml`, and
`next.config.ts` (`outputFileTracingIncludes` for `data/`). Do **not** copy its
geocoder: it takes the address in a GET query string, marks responses
`public, max-age=86400`, keeps an in-memory cache of addresses, and uses
Nominatim. Tools that call live sources set `openWorldHint: true`.

- `check_address` (Census Geocoder → tract → 2027 eligibility with the
  `eligibility.ts` explanation, 2018 designation, rural status, overlays)
- `get_tract` (everything known about one GEOID)
- `list_tracts` (by state/county, with filters on eligibility and overlays)
- `compare_tract` (percentiles vs. eligible tracts in the same state)
- `oz1_findings` (the published results from `data/oz1/results.json`)
- `nearby` (Foursquare categories, anchors, brownfields, traffic, hazards around
  a point)

Every response ends with the disclaimer footer and lists the sources used, with
their vintage and geography. Present raw measures and within-state percentiles;
**no composite "investability" score**. Add `scripts/test-client.ts` that
exercises every tool against a local `next dev`.

## Step 4: web app

Address search, map of eligible/designated tracts (MapLibre + PMTiles from
`npm run tiles`), and a tract page that shows the same data as `get_tract`.

## Step 5: CI and docs

GitHub Actions: lint, type-check, test on every PR. README: what it is, the
source table generated from `pipeline/sources.ts`, how to set `.env.local`, and
how to connect the MCP server to Claude Desktop / Claude Code.

## Working rules

- Work on a feature branch, small commits, one PR per step. Run lint,
  type-check and tests before every push.
- If a host is blocked by the environment's network policy, name the host and
  ask the user to allow it; do not work around it.
- If a key is missing, say which env var is needed; never ask for the key in
  chat.
- Ask the user before any decision that changes what the product claims
  (definitions, thresholds, hazard method, national Foursquare precompute).
