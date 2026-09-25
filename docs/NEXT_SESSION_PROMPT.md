# Handoff prompt: data sources, API clients, MCP server

Paste everything below the line into a new Claude Code session on
`Jaysunnn8solutions/opportunityzones-mcp`.

---

You are continuing work on `opportunityzones-mcp`, an Opportunity Zone
**screening tool** for investors and funds: a TypeScript/Next.js 16 app plus an
MCP server. Read `AGENTS.md`, `lib/oz/eligibility.ts`, `pipeline/sources.ts`,
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

## Step 0: make the build green

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

## Step 1: require a documented reason for every source

Add a required `rationale` field to `Source` in `pipeline/sources.ts` and a
check in `pipeline/sources.test.ts` that it is non-empty. Each rationale must
name which of these it serves: **statutory** (OZ qualification rules),
**feasibility** (can a project work here), or **impact baseline** (the
before-investment measure). Backfill the existing entries. Also add an
`access` field: `"api-runtime" | "api-pipeline" | "file-pipeline"`.

A source is admissible only if it (1) serves one of those three purposes,
(2) is tract-level or honestly allocable to tracts (otherwise label the
coarser geography in every output), (3) is authoritative and maintained,
(4) is license-clean, (5) is not a weaker duplicate of something already in.

## Step 2: API clients

Prefer live APIs. Create one typed client per source under `lib/sources/<id>/`
with: timeouts, retries with backoff, a small in-memory/disk cache, key
redaction in every thrown or logged URL, and no logging of query arguments.
Reuse patterns from `pipeline/lib/http.ts` and `pipeline/lib/census.ts`.
Each client gets unit tests with recorded fixtures (no network in `npm test`).

Decide per source whether it is queried **at runtime** (per-site lookups from
the MCP server/app) or **in the pipeline** (national tract tables rebuilt on a
schedule), record it in `access`, and justify the choice in the PR.

Sources to add, in priority order:

| # | Source | Purpose | Access (proposed) | Notes |
|---|---|---|---|---|
| 1 | 2027 OZ designations (Treasury/CDFI) | statutory | pipeline | Not yet published. Build the ingest stage and schema now so it lands the day it appears. |
| 2 | Census urban areas (2020) + places > 50,000 via TIGERweb REST | statutory | pipeline | Reproduce the OBBBA "rural" definition for qualified rural opportunity funds and show *why* a tract is rural. Verify the definition against the statute (P.L. 119-21 § 70421) and check it against Treasury's rural flag already in `pipeline/oz2/eligible.ts`; report disagreements, do not hide them. |
| 3 | HUD Qualified Census Tracts + Difficult Development Areas | feasibility | pipeline | LIHTC 30% basis boost; common OZ stacking. |
| 4 | CDFI Fund NMTC eligible tracts | feasibility | pipeline | Same publisher as the OZ lists. Mind the tract vintage. |
| 5 | ACS year structure built (B25034) | statutory | pipeline (Census API) | Relevant to the substantial-improvement test on existing buildings. Add to the existing ACS stage. |
| 6 | EPA brownfields (ACRES) + Superfund NPL (SEMS) | feasibility | runtime and pipeline | Per-tract counts/flags; point lookup near a site. |
| 7 | HMDA (CFPB Data Browser API) | impact baseline | pipeline | Loan volume and denial rates by tract. Check tract vintage per year. |
| 8 | Anchor institutions: IPEDS postsecondary (NCES) + CMS hospitals | feasibility | pipeline | Authoritative "eds and meds" anchors. CMS gives addresses only; geocode with the Census Geocoder in the pipeline. |
| 9 | HUD Small Area Fair Market Rents (HUD USER API, `HUD_USER_API_TOKEN`) | feasibility | pipeline | ZIP-level: label the geography; do not present as tract-level. |
| 10 | FHWA HPMS traffic counts via NTAD ArcGIS REST | feasibility | runtime | Max AADT on segments touching the tract/site, truck share, distance to nearest interstate. **No level-of-service**: no national source exists. |
| 11 | Foursquare OS Places | feasibility | runtime | See below. |
| 12 | Natural hazards | feasibility | runtime | See below. |

### Foursquare Open Source Places (https://opensource.foursquare.com/os-places/)

- **Never bulk-download it.** Query it remotely (e.g. DuckDB `@duckdb/node-api`
  with `httpfs` reading the published Parquet/Iceberg with bounding-box and
  column pruning), fetching only the rows for the tract or site being looked up.
- First confirm the current access method and license on that page. It has
  moved between a gated Hugging Face dataset and Foursquare's Places Portal
  (Iceberg catalog). Use `HF_TOKEN` or `FSQ_PORTAL_TOKEN` accordingly. Confirm
  the license is still Apache-2.0 before registering it.
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
- **Seismic:** USGS Seismic Design Maps web service at a point.
- **Wildfire:** USFS Wildfire Risk to Communities (public domain).
- **Coastal / sea level rise:** NOAA, optional.

Present each hazard as its own measure. Do not combine them into a composite
risk score.

## Step 3: MCP server at `/mcp`

Using `mcp-handler` and `@modelcontextprotocol/server` (already dependencies):

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
