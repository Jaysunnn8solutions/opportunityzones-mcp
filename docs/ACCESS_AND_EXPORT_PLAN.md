# Public research, free accounts, and controlled exports

Status: implementation authorized and local baseline built September 27, 2026. This document preserves the original plan. See [ACCESS_IMPLEMENTATION.md](ACCESS_IMPLEMENTATION.md) for actual behavior, revised details, checks, and remaining production gates.
Research date: September 27, 2026.

## Recommendation

Make exporting a carefully selected dataset a primary workflow. Keep public browsing useful, offer a free research account for advanced tools and downloads, and apply server-enforced limits to both. Produce bulk exports exclusively from a published, versioned dataset. An export must not trigger a new Census, BLS, geocoder, or hazard lookup for every row.

Maintain separate budgets for downloads, live-source calls, and hosting resources. Limiting downloads alone would leave the main provider-abuse routes open.

## 1. What the current solution actually uses

Local inspection found nonempty entries for `CENSUS_API_KEY`, `BLS_API_KEY`, and `FSQ_PORTAL_TOKEN` in `.env.local`. Values were not printed, transmitted, or tested. This establishes configuration presence, not validity, account-specific allowances, remaining usage, or production configuration. No provider dashboard or usage counter was available in this review.

| Service | Current use | Published limit / verified finding | Planning consequence |
|---|---|---|---|
| Census Data API | Offline ACS/decennial builds; live county QWI through MCP `nearby` | Current May 2026 guide requires a key for all data queries and permits 50 variables per query. It does not state a numerical daily keyed allowance. The old 500/day unauthenticated guidance is not a reliable current keyed quota. [Census query limits](https://www.census.gov/data/developers/guidance/api-user-guide.Query_Limits.html) | Keep builds cached and batched; use county QWI cache; obtain provider clarification before promising high-volume live access. Do not call it unlimited. |
| BLS Public Data API v2 | Live county unemployment through MCP | 500 queries/day, 50 series/query, 20 years/query, 50 requests/10 seconds; registration renewed at least annually. [BLS FAQ](https://www.bls.gov/developers/api_FAQs.htm) | Shared budget across users and jobs. Batch county series and cache by county/source period. |
| BLS Public Data API v1 | Offline CPI build | 25 queries/day, 25 series/query, 10 years/query, same published burst ceiling. Current pipeline makes two requests on a cold cache. [BLS FAQ](https://www.bls.gov/developers/api_FAQs.htm) | Track separately from v2; preserve the build cache. |
| Census Geocoder | Website address search, property lists, MCP address/point lookup; some pipeline work | Keyless service; batch endpoint accepts at most 10,000 records/file. No daily allowance established by the reviewed documentation. The app currently performs single lookups, not that batch API. [Official documentation](https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html) | Set our own conservative live-lookup budget. The 10,000 batch maximum is not permission for unlimited requests. |
| Foursquare OS Places | Amenities connector exists; token entry present | Free OS dataset is accessed through Places Portal/Iceberg. Public access documentation does not establish this account's request allowance. In this app, catalog fields are null and no runner is wired, so it does not currently issue a working amenities query. [OS Places access](https://docs.foursquare.com/data-products/docs/access-fsq-os-places) | Leave unavailable until catalog configuration, limits, and free-only access are verified. Do not substitute paid Places API quotas. |
| BLS QCEW | Live county CSV fetch through MCP | Separate open-data file endpoint; the v2 500/day figure is not established as its limit. No numeric daily cap found in the reviewed page. [QCEW open data](https://www.bls.gov/cew/additional-resources/open-data/home.htm) | Cache county/quarter data and stop repeated fallback searches. |
| OpenFreeMap | Browser basemap/styles/fonts | Provider states no map-view/request limits, no key, and completely free public service. [OpenFreeMap](https://openfreemap.org/) | Normal map viewing does not consume the Census key. Still avoid unnecessary downloads; availability is not guaranteed. |
| TIGERweb | Cached boundary fallback if bundled boundary data is unavailable | Keyless ArcGIS service; no request-per-day allowance established. Record limits describe response size, not traffic permission. [Service metadata](https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts_Blocks/MapServer?f=pjson) | Prefer existing bundled boundaries; throttle and cache fallback misses. |
| FEMA NFHL, EPA, FHWA HPMS, USFS wildfire | Live point context, website and/or MCP | No numeric daily allowance verified. Several official service-directory reads were unavailable during research. | Treat quotas as unknown, not unlimited. Maintain per-source budgets, low concurrency, and failure backoff. |
| USGS seismic / National Map imagery | Live point context / browser basemap | Reviewed [seismic service](https://earthquake.usgs.gov/ws/designmaps/asce7-22.html) and [imagery metadata](https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer); no applicable numeric daily allowance established. | Separate direct browser tile traffic from server source calls. Do not apply unrelated USGS Water or earthquake-event limits. |
| Treasury, HUD, HMDA, FHFA, LODES, CMS, NCES, other Census files | Mostly offline tables/files per the source registry | Not a fresh upstream call for each visitor or exported row | Protect pipeline cadence, host bandwidth, and data provenance. Preserve source-specific licenses. |

The source inventory is `pipeline/sources.ts`. Add operational metadata alongside that registry: confirmed limit, scope, verification date, official documentation, confidence, configured local budget, timeout, and concurrency. Unknown limits must remain visibly unknown to operators.

### Code findings that change the plan

- `lib/data/explore.ts` loads the bundled dataset; `/api/explore/[state]` returns statewide screening values. The browser then filters them. An export-button restriction cannot hide data already delivered to the browser.
- `ExploreWorkspace`, `Comparison`, and `PropertyChecker` generate CSVs locally through `downloadCsv`. Research JSON and browser printing are also local. There is currently no authoritative download counter.
- `/api/tract/[geoid]` and tract pages expose detailed records. They need the same access policy as list and export routes.
- `app/mcp/route.ts` exposes six tools without authentication. `nearby` can call multiple live providers, including Census QWI and BLS. `list_tracts` has a 50-row per-call cap, but repeated calls remain possible.
- `SiteSnapshot` automatically starts source requests when mounted. Expensive refreshes should instead be deliberate user actions, with cache-first public geography results.
- Live HTTP requests have timeouts/retries but no shared provider budget. Short retries after 429 responses need provider-aware backoff and `Retry-After` handling.
- `data/tracts.bin`, lookup tables, and public boundary files are Git-tracked. If the repository or downloadable artifacts are publicly accessible, those are another distribution channel. Visibility was not confirmed in this review.

## 2. Proposed access levels

These are launch product choices, not provider-imposed limits. Start conservatively and adjust from aggregate usage.

| Capability | Public visitor | Free research account |
|---|---|---|
| Research Hub, rule explanations, citations, legal documents | Available | Available |
| Map navigation and public zone status | Available with normal-use traffic protection | Available with higher normal-use allowance |
| Filters | State/county, eligibility/designation, rural, other program flags | Also numeric ranges and neighboring-area criteria |
| Results | Basic columns; 25 rows/page | Custom columns; up to 100 rows/page |
| Compare | 2 places | Up to 4 initially, matching the current file model |
| Address lookups | 10 per rolling 24 hours | 100 per rolling 24 hours |
| Property batch tool | Single-place lookup | Up to 25 addresses/batch; each consumes the same lookup allowance |
| Live site refreshes | 2 per rolling 24 hours | 10 per rolling 24 hours |
| Product-generated research downloads | Sign-in required | Limited CSV/JSON; other formats in subsequent phase |
| Advanced column presets | Preview descriptions | Available; stored locally initially |
| Hosted MCP | Small public cached-data responses; no anonymous live enrichment | Authenticated access only when the same budgets are enforced; no separate unlimited allowance |

Keep missing-data explanations, source dates, designation uncertainty, accessibility, and official-source links available to everyone. Fewer features must not produce misleading research.

Public allowances are approximate per visitor because cookies can be cleared and networks shared. Use sessions plus network-level abuse protection; do not advertise a reliable per-person limit without identity verification. Member and visitor activity must not become additive through logging out; retain coarse network/session controls.

### Initial research-download allowance

- 500 tract rows per export, at most 50 selected fields, and at most 10 MB uncompressed.
- 3 new data exports per rolling 24 hours; 10 per rolling 30 days.
- 1,000 exported rows per rolling 24 hours; 5,000 per rolling 30 days.
- One active export per account; small global worker/queue limits configured for the chosen host.
- Count rows again in a genuinely new export, even if they overlap an earlier file. Repeated downloads of the exact same prepared file within a short retry window do not consume another export/row allowance, but are still bandwidth-rate-limited.
- Display the earliest time capacity becomes available. Never truncate a file silently. Ask the user to narrow the scope or explicitly select a deterministic subset.
- Gate all product-generated research downloads, including comparison CSV, property CSV, research JSON, and generated briefs. A settings-only research JSON can have a separate low-cost allowance (for example 20/day), rather than consuming a data-export job. Count actual rows for tabular/property exports. Legal documents remain publicly readable/printable.

Browser Save, Print to PDF, screenshots, and copying visible public facts cannot be reliably prevented. This policy governs the export service we provide, not ownership of every visible byte.

## 3. Make exports useful for people's own models

Recommended path: **Explore → refine → review list → select columns → preview export → sign in if needed → download**.

Export remains visible for public visitors. Its first click explains the free account and exact limits, retaining their current geography and filters. Do not interrupt normal map use with repeated signup prompts.

The export panel should show the matched count, selected count, columns, dataset version, missing-value counts, and remaining allowance. Example: “243 tracts · 18 fields · 2 exports left today.” If a request exceeds 500 rows, offer narrower geography or explicit selection. Avoid investment-oriented labels such as “best opportunities.”

Deliver an analysis-ready package:

- `areas.csv`: one row per tract, stable field names, plain numeric values, explicit units, distinct eligibility/designation/rural fields.
- `data-dictionary.csv`: definitions, observation periods, geography, denominators, units, missing-value conventions, relevant margin-of-error information.
- `sources.csv`: publisher, source URL, attribution/license, observation vintage, retrieval/build dates.
- `manifest.json`: schema version, dataset version, generation time, selected columns, filters/sort, row count, integrity checksum.
- `README.txt`: import guidance, scope limitations, informational disclaimer, authoritative-source verification, and permitted reuse/attribution.

CSV must not turn missing values into zeros or round values into display strings. GEOIDs are 11-character identifiers; include Excel import guidance and a typed JSON alternative. XLSX can follow with explicitly typed text identifiers. Protect against spreadsheet formula injection without altering legitimate negative numeric values. Exclude map tiles, imagery, and exact searched addresses from default area exports.

Users retain their calculations. Do not ask them to upload their private models, allocations, or formulas. Reading a local research file should continue to avoid uploading its contents unless a specific later feature requires and explains that action.

## 4. Enforce access before delivering data

Build a single server-side capability policy used by website APIs, server-rendered pages, export routes, and hosted MCP tools. Neither a hidden button, a client flag, nor a signed-in React state is authorization.

Split the current statewide payload:

1. **Public map data:** minimal GEOID/status or rendered overlay data needed to draw the map; safe to cache publicly.
2. **List search:** server-evaluated filters, allowed columns, bounded pagination, canonical query, and dataset version. Reuse the existing filter/evidence engine so map counts, lists, and exports agree.
3. **Detailed data/export:** authenticated when member-only fields or a download are requested. Do not embed member-only values in public HTML, hydration payloads, map properties, or static files.

Audit every existing export path and alternate route, including legacy pages, direct JSON APIs, map layers, MCP, server component payloads, and deployment artifacts. Keep open boundary geometry separate from the richer compiled table. Public geometry alone is not a secret.

Member responses and download authorization must not be cached publicly. Separate public/member cache keys or use private/no-store responses for protected data; test that one account cannot retrieve another account's export. CORS and Origin checks supplement authorization; they do not stop scripts making direct HTTP requests.

### Export request lifecycle

1. Validate session, accepted terms version, allowed format/fields, query size, and geography. Validate CSRF/Origin for browser mutations.
2. Recompute authorized rows on the server using the pinned dataset version. The browser cannot supply trusted counts, entitlement, or values.
3. Atomically reserve export count, rows, and bounded worker capacity in persistent storage. All replicas must share the same counters. An in-process `Map` is insufficient.
4. Generate only from local published data. Bound memory, execution time, bytes, queue length, and request size. Preserve source versions and missing values.
5. Mark a successfully generated file against the allowance; release reservations on genuine generation failure. Network disconnects must not create repeated free generation. An idempotency key allows a short, authenticated retry for the same request.
6. Deliver directly or through an opaque, short-lived, account-bound download reference. Do not expose a permanent public artifact URL. Avoid credentials, addresses, or research criteria in logged URL parameters.

Use short-lived protected storage only for reproducible public-tract artifacts if needed; delete it promptly. Property exports containing addresses require memory-only generation/streaming with request/response logging disabled. No per-row provider lookup is allowed during either kind of export. Address lookups are budgeted separately when the user performs them.

## 5. Protect upstream services independently

Introduce a shared source gateway before any provider call, also used by pipeline jobs or given a separately reserved share of the same provider allowance.

- Cache public county/tract data by source, geography, source period, and relevant parameters. Start with roughly 24-hour LAUS/QCEW freshness checks and 7-day QWI checks; these are our cache policies, not publication schedules. Batch BLS series up to its documented limit.
- For point hazards, distinguish a cached canonical tract representative point from a user's exact address. Never replace an exact flood determination with a rounded-cell result. Preserve the existing prohibition on shared caching or logging exact searched coordinates/addresses.
- Collapse simultaneous requests for the same public geography into one upstream request. Avoid background refresh storms.
- Budget actual HTTP attempts, including retries and fallback endpoints, not just user clicks. One site refresh fans out to several requests.
- Honor 429 responses and `Retry-After`; apply capped backoff, per-source concurrency, and a circuit breaker. Return an honest unavailable/stale status rather than retrying on every page view.
- Proposed BLS v2 internal cap: 400 attempts in a conservative rolling 24-hour window and a low global rate (for example 1/second with concurrency 2), leaving headroom below the documented 500/day ceiling. Account for other projects using that registration; 400 is not a guaranteed available balance.
- Census: begin with a configurable conservative application budget and low concurrency; verify the applicable keyed policy before assigning a public numeric provider allowance. Do not claim the product quota is a Census rule.
- For unverified providers, require an operator-configured pilot cap and low concurrency before broad live access. A zero cap cleanly disables a source until reviewed.
- At a global source limit, continue serving available published/cached data and explain when fresh data can be retried. A member's remaining allowance does not override the global provider limit.

Never rotate keys, projects, accounts, or IP addresses to evade a provider limit. Census/BLS keys remain server-side; user signup does not give users the owner's credentials.

## 6. Signup with minimal information

The new request intentionally changes the earlier “authless” architecture. It requires a narrow documented exception for account/security records, while preserving no financial profiles and no address/query logging. The current claim “no user accounts” must be replaced before launch.

**Default proposal, pending the owner's answer:** a passkey account with a random account identifier, no real name, email, phone, address, or payment details. Store credential IDs/public keys and essential session/usage records. Browser/platform authentication keeps private keys and biometric verification out of this app. [WebAuthn standard](https://www.w3.org/TR/webauthn-3/)

Provide a second-passkey option and one-time recovery codes, stored hashed. Clearly explain that losing all credentials/recovery codes means losing access. Avoid mandatory device attestation or device fingerprinting. An established open-source implementation such as the MIT-licensed [SimpleWebAuthn](https://github.com/MasterKale/SimpleWebAuthn) is a candidate; dependency/license review remains an implementation gate.

If verified email is preferred, it is personal information and requires consented retention, deletion/recovery flows, and an email delivery arrangement that satisfies the free-only rule. Do not silently add a metered email provider or social-login profile collection.

Passkeys and emails do not establish one human per account. Signup creates a useful account boundary, but account farming is still possible. Combine it with source-wide hard caps and short-lived network/session abuse controls.

### Minimal retention proposal

| Record | Retention proposal |
|---|---|
| Account ID, credential public keys, recovery-code hashes, status | While active; delete through account deletion |
| Session tokens | Store hashes; bounded expiration, revocation, secure HttpOnly/SameSite cookies |
| Account quota events | Counts, operation type, rows/bytes, outcome, timestamp; purge after 35 days |
| Export idempotency references / public-data artifact | Minutes to at most 1 hour; authenticated access; no permanent download history |
| Abuse network identifiers | Rotating keyed HMACs with short expiration, initially 24 hours; no raw IP persistence by the app |
| Anonymous aggregate source counters | Daily totals, latency/error/cache rates, no query body or account research history |
| Addresses, financial details, exact coordinates, private models | No persistent storage or logging |

HMAC network identifiers and account records are pseudonymous security data, not a promise of zero personal data. Document them accurately, handle shared offices/VPNs fairly, and audit host/proxy logs. Deleting an account should delete its records; coarse short-lived network controls can still help protect the service without retaining a covert identity history.

## 7. Quiet abuse controls with clear user limits

Enforce controls on the server without cluttering ordinary workflows:

- Per-account, anonymous-session, endpoint, network, provider, and global resource limits.
- Separate bulk export, signup/recovery, live geocoding, live enrichment, and ordinary cached browsing budgets.
- Repeated identical-request suppression, bounded pagination, request/body limits, and global maximum generation concurrency.
- Short cooldowns for repeated signups, sequential bulk harvesting, and sustained parallel requests. Use multiple signals; avoid permanent bans based only on a shared IP.
- A consistent 429 response with `Retry-After`, a readable message, and preservation of filters/selections.
- If the quota datastore is unavailable, stop exports/new live requests rather than allowing unlimited work; keep safe cached browsing available.
- Protected operator controls for source pause, export pause, member suspension/reinstatement, budget adjustments, and aggregate status. Authenticate and audit operator changes without logging research inputs.

Keep detailed detection thresholds private, but disclose fair-use limits and the security-data categories collected. Do not add covert tracking, canvas fingerprinting, forced device IDs, disabled right-click, or deceptive error messages. These are not sound access controls. The resource-control approach follows [OWASP API resource-consumption guidance](https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/).

## 8. Intellectual property and legitimate reuse

The local repository carries an MIT license. It permits broad reuse of released software subject to its conditions; download gating does not retract those permissions. [MIT text](https://opensource.org/license/mit)

Most source data is federal public-domain material or openly licensed. Copyright in a compilation does not create ownership of underlying public facts, and open-source/data rights must remain intact. [U.S. Copyright Act, sections 103 and 105](https://copyright.gov/title17/92chap1.html)

Recommended protection priorities:

1. Protect credentials, infrastructure capacity, account security, and unreleased/private assets.
2. Preserve attribution, branding, source lineage, and terms governing reasonable hosted access.
3. Encourage users to use properly licensed exports in their own calculations, including commercial research.
4. Review repository visibility, licenses, generated artifacts, and any future proprietary modules deliberately with the owner. Do not change licensing or remove existing public releases as part of this plan.

A sufficiently motivated visitor can record publicly displayed information. Limits can discourage automated harvesting and control this hosted service; they cannot guarantee that public data or MIT-licensed code will not be copied. Avoid tampering with data, covert watermarks in facts, or claims that lawful reuse is theft.

## 9. Hosting and the no-cost requirement

Current docs mention Vercel, but the live production host, plan, and remaining quotas were not verified. On October 1, the owner allowed provider free plans with no payment method and service stopping at the limit without charges. This supersedes the earlier blanket exclusion of free tiers from providers with paid offerings; it does not select a host or database.

No hosted authentication, database, bot-check, email, or queue service is selected here. Free signup for our users does not make infrastructure unlimited or free to operate.

A compatible candidate is an existing owner-controlled server with open-source authentication code and a persistent database. SQLite can support a bounded single-server pilot; multiple app replicas require a shared transactional store rather than independent local databases. [SQLite deployment guidance](https://sqlite.org/whentouse.html) This still consumes machine capacity, electricity, bandwidth, and maintenance; it does not promise unlimited zero-cost hosting.

Before implementation, confirm the actual host/database provides appropriate persistent storage, HTTPS, backup provisions, permitted use, and a provider-enforced hard stop rather than billable overflow. No payment method, trial, automatic paid upgrade or billable overage is permitted. Check the exact plan and marketplace signup path. If no compliant hosting exists, keep this as a local prototype until the constraint is resolved explicitly.

## 10. Delivery sequence and acceptance gates

Apply the [neutral research requirements](NEUTRAL_RESEARCH_POLICY.md) throughout these phases. Discovery filters, member capabilities, exports, and MCP access must preserve descriptive place research, consistent treatment, and the boundaries against discriminatory housing targeting. In particular, replace the existing fixed-direction neighboring-area preferences before promoting them as an advanced member benefit. These requirements are a proposed design plan, not a legal compliance determination.

### Phase 1 — Protect live sources

Inventory routes and provider attempts; add source gateway, cache policy, concurrency limits, Retry-After handling, bounded request sizes, and operator pause controls. Make fresh enrichment explicit. Protect MCP alongside website APIs. This phase reduces the present exposure before signup launches.

### Phase 2 — Establish account and data boundaries

Confirm signup method/host; document the new account-data exception; build account deletion/recovery and persistent quotas. Split map/list/member payloads. Apply capability checks to all public and member routes. Update AGENTS/architecture/privacy/terms for the accepted design and preserve public legal access.

### Phase 3 — Build the export workflow

Implement column selection, preview, clear allowance display, dataset-version pinning, source package, atomic reservations, retry/idempotency, and secure delivery. Replace existing ungated product export paths. Add CSV/JSON first, XLSX and bounded GIS geometry export later if useful and license-safe.

### Phase 4 — Validate, then run a bounded pilot

Required tests:

- Anonymous direct calls cannot generate protected downloads; changing client state cannot grant access.
- Member-only fields are absent from public HTML/JSON/tile payloads and cannot leak through shared caches.
- Parallel jobs, multiple tabs, multiple replicas, retries, and process restarts cannot exceed quotas.
- A 500-row export makes zero upstream data-source requests.
- Expired/stolen/other-account download references fail; CSRF and unauthorized format/field requests fail.
- 429s, exhausted global budgets, provider failures, and quota-store outages degrade safely with understandable UI.
- Exact addresses/coordinates and keys do not reach logs, analytics, permanent files, or security-event payloads.
- CSV/JSON preserve GEOIDs, nulls, numbers, sources, vintages, and eligibility/designation distinctions.
- Signup, recovery, export, and limit messages work with keyboard navigation, screen readers, and narrow screens; abandoned signup preserves research.

Monitor a two-week pilot using aggregate measures: exports completed/failed, rows and bytes, source attempts, cache hit rate, 429s, signup abandonment, and support reports of unfair limits. Do not capture users' research criteria or uploaded private calculations for analytics. Increase limits only when provider and host headroom support them.

## Decisions to finalize

1. Passkey without email versus verified email only; neither requires payment or financial information.
2. The existing or intended production host and compliant persistent storage.
3. The proposed member/export limits and which numeric/neighbor filters become member features.
4. Whether hosted MCP should launch member access now or remain restricted to limited cached public tools until secure authentication is ready.
5. Repository visibility and expectations for future proprietary work, recognizing existing license rights.

The user subsequently authorized implementation of the plan. Local signup and minimal security records are implemented. Deployment, hosting selection, and any license change remain separate; no deployment was performed.
