# Architecture: where data comes from and what is kept

Agreed with the owner on 2026-09-25. Every source, tool and page is judged
against this document; change it deliberately, not by drift.

> Informational only, not investment, tax or legal advice. The product
> describes places. It never recommends an allocation, a fund or a deal.

## Where data comes from: live per place, bundled nationally

The product answers two kinds of question, and each has its own data path.

| Question | Example | Path | `access` in `pipeline/sources.ts` |
|---|---|---|---|
| About **one place** | "What is at this address?" | Queried **live** from the source when a user or MCP client asks | `api-runtime` |
| **Across many places** | "Every eligible tract in Texas", "percentile within the state", the national map | Built **offline** by the pipeline into national tables that ship with the app | `api-pipeline` or `file-pipeline` |

A source can be reached both ways: EPA brownfields is live for "what is near
this site" and offline for per-tract counts.

**Default to live** when the source has an API that answers one place quickly.
Use the pipeline when:
- the question spans many places (screening, ranking, percentiles, the map);
- the source is only a file download;
- the data changes about yearly and is small (eligibility lists, 2018 zones,
  QCT/DDA, NMTC). A live call there adds latency and a failure point for
  nothing.

## A live request, step by step

1. **Address to tract, once.** The address goes to the Census Geocoder
   (`geographies` endpoint, which returns the tract directly) in a **POST
   body**, never a URL query, because Vercel logs request URLs. Nominatim is not
   used: its public server's policy rules out heavy or commercial use.
2. **Everything after is keyed by GEOID or coordinates.** The address is not
   passed further.
3. **Sources are fetched in parallel, each with its own short timeout.** A
   slow or failing source yields "unavailable right now" for that measure, never
   a failed report.
4. **Each measure carries its source, vintage and geography**, and every
   county- or metro-level figure is labelled as such.
5. **The report is assembled in the browser.** The user downloads or prints it;
   the server keeps nothing.

## What may be cached, and what may not

| Data | Cache | Why |
|---|---|---|
| Results keyed by **tract GEOID** (public data about a public area) | Yes, shared (CDN / server), for as long as the source takes to change: ACS weeks, flood monthly, unemployment monthly, 2018 zones indefinitely | Fast, and spares the sources' rate limits |
| Results keyed by **exact coordinates** of a searched site | **No shared cache.** At most the lifetime of one request | Exact coordinates of a searched address identify the address |
| Addresses, gain amounts, tool arguments, reports | **Never** stored, cached or logged | AGENTS.md: nothing personal is stored |

Serving a stale cached value while refreshing in the background is fine for
GEOID-keyed data.

User inputs live in client state and the URL **hash**, which browsers never send
to the server.

## Admitting a source

A source is added to `pipeline/sources.ts` only if it:
1. serves a named purpose: **statutory**, **feasibility** or **impact
   baseline** (`purposes`, with a `rationale` saying how);
2. is tract-level, or honestly allocable to tracts; otherwise its coarser
   geography is labelled in every output;
3. is authoritative and maintained;
4. is license-clean for commercial use (see AGENTS.md);
5. is not a weaker duplicate of a source already in.

`npm test` fails if an entry lacks a purpose, rationale, access method, licence
or attribution.

## Keys

| Where | Who puts them there |
|---|---|
| `.env.local` (gitignored) for local runs | The owner |
| Vercel project environment variables for runtime sources | The owner |
| GitHub Actions secrets for the data-refresh workflow | The owner |

Keyed APIs are called only from the server, never the browser. Keyless APIs
may later be called from the browser directly where they allow it, so the
server never sees the location at all.

## When to add a database

Not yet. The trigger is not traffic but one of: cross-place queries that
outgrow the bundled tables (Vercel functions cap at 250 MB), joins over many
years, reproducible reports that must show the data as of a date, or
reliability promised to paying clients.

In order of cost: Parquet files queried by DuckDB (about $0, and DuckDB is
already planned for Foursquare); Postgres/PostGIS on a free tier; BigQuery only
if analysts or clients need SQL at terabyte scale. **Anything billable needs the
owner's approval first.** Stored public data does not breach the "nothing
personal is stored" rule; client data never goes in.

## The national map

**Decided 2026-09-25 by the owner: Census TIGERweb, no hosted tile file.**

- Basemap (changed 2026-09-26): TIGERweb's map images were too coarse, so the
  basemap is chosen in the panel from `lib/geo/basemaps.ts`: OpenFreeMap
  vector styles (Light = Positron, Streets = Liberty; OpenStreetMap, ODbL,
  no key, commercial use allowed) or USGS National Map aerial imagery (public
  domain). The map's own layers are merged in beneath the basemap's first
  label layer so names stay readable. Esri basemaps were considered and left
  out: they are metered past a free quota (the "free services only" rule in
  AGENTS.md), need an API key exposed in the browser, and are licensed under
  Esri's terms rather than an open licence.
- Tract and county outlines: TIGERweb queries per web-mercator tile through
  `/api/boundaries/{tracts|counties}/{z}/{x}/{y}`, cached at the CDN for 30
  days, so the Census servers see each tile about once. Counties below zoom 8,
  tracts from zoom 8. TIGERweb returns whole polygons, so the client merges
  tiles and de-duplicates by GEOID.
- Colours come from our data: `/api/status/{state}` (flag bits per tract) and
  `/api/counties` (eligible share per county).

Trade-offs accepted: the map depends on TIGERweb being up (the CDN cache softens
this), new areas take 0.5-2 s to fill in, and there is no nationwide tract-level
view. A hosted PMTiles file (Vercel static via Git LFS or a build step, or
Cloudflare R2, which needs a payment method) remains the upgrade path without
changing the map's design.

MapLibre's web worker must be served from `public/maplibre/` and set with
`setWorkerUrl`: the bundler does not emit it beside MapLibre's code, and the map
then never loads, silently (`scripts/copy-maplibre-worker.ts`).
