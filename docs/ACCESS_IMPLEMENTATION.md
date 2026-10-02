# Implemented research access

Local implementation, September 27, 2026. This records actual behavior and supersedes proposal details in ACCESS_AND_EXPORT_PLAN.md. No production deployment or provider-key changes were made.

## User experience

- Research Hub has less opening whitespace and a smaller heading so pathway cards appear sooner, with additional adjustments for shorter desktop windows.
- Find areas opens on the map. Address search is in the left search panel; the state prompt is compact. Selected-place details follow the map rather than moving it down.
- State and county selection, status filters, a paged list, comparisons, criteria evidence, and source context connect the research workflow.
- Numeric filters and neighboring-area bands are explicit choices. Higher and lower bands are offered symmetrically; neither is labeled better. Legacy shared filters retain their original meaning.
- Facts and ordering depend on explicit criteria and published data, not account identity or personal characteristics. Missing values remain unknown. Tract estimates are not property appraisals; eligibility is distinct from designation.
- No recommendation scores, resident compatibility, housing audiences, individual tax outcomes, or investment personas are introduced. Informational and independent-service notices remain present; exports carry limitations and source attribution.

## Public and free account access

| Capability | Public | Free passkey account |
|---|---|---|
| Map, rules, sources, legal pages, single-tract published reports | Available | Available |
| Geography and status filters | Available | Available |
| Numeric ranges and neighboring-area filters | Sign-in explanation | Available |
| Results per page | 25, basic columns | 100, published numeric columns |
| Comparison | 2 places | 25 places |
| Address lookups | 10 per daily rotating network bucket | 100 per rolling 24 hours |
| Address batch size | 1 | 25, each lookup charged |
| User-requested live site context | 2 per daily rotating network bucket | 10 per rolling 24 hours |
| Product-generated downloads | Sign in | Limited as below |

Public allowances are approximate network allowances, not verified per-person entitlements. Shared offices/VPNs may share capacity. A common network ceiling also covers signed-in activity: 300 address checks and 50 site checks/day. Public read traffic is limited to 300 requests/minute; member read traffic to 1,200, with a shared network ceiling of 6,000. Authentication and download endpoints have additional burst limits. Without a trusted proxy header, all traffic shares a conservative network bucket. Signing out does not clear it. Creating multiple accounts cannot bypass provider-wide ceilings.

### Accounts

Passkeys use SimpleWebAuthn (MIT) and require device verification. No name, email, phone, or payment details are requested. Challenges expire in five minutes and are consumed once. Session tokens are hashed in storage and delivered in HttpOnly, SameSite=Strict cookies, Secure on HTTPS, expiring after seven days. Passkey verification rotates the current session.

Users can add up to five passkeys, create six one-time recovery codes, and delete their account after recent authentication. Recovery codes are stored hashed; recovery revokes existing sessions. Keep a second passkey or codes; there is no email recovery. Recovery does not automatically remove existing passkeys. Use account deletion if all existing credentials must be retired.

Use **localhost**, not a numeric IP address, for browser passkey development. Use a stable HTTPS domain in production; changing the domain changes the passkey relying party. A real device/browser registration remains a release check; synthetic ES256 registration and signed login are covered by integration tests.

## Downloads

- Up to **500 tract rows** and 10 MB per file; fields come from an explicit allowlist.
- **3 exports / 1,000 rows per rolling 24 hours**; **10 exports / 5,000 rows per rolling 30 days**.
- Settings-only research JSON: separate 20/day allowance.
- Shared ceiling: 100 generated files/day. Bounded synchronous generation is serialized through a SQLite transaction; there is no background queue.
- Preview shows selected/matched counts, field count, version, missing values, and remaining account allowances. Oversize results require narrower criteria or an explicit first-500 subset in the current deterministic sort order.
- Every data export is recomputed from the published local dataset. No per-row Census or hazard lookups.
- ZIP includes areas.csv, data-dictionary.csv, sources.csv, manifest.json, README.txt, and a standalone semantic report.html for tract exports. JSON includes corresponding typed data/context. GEOIDs are strings; CSV instructions explain leading zeros. Negative numbers remain numeric and formula-like text is escaped. Browser PDF printing is not a verified tagged-PDF workflow.
- Quotas and stored output commit atomically after successful generation. Retries with the same account/request ID and content reuse the prepared file for one hour without another export charge. Other accounts cannot retrieve it. Retries still have bandwidth request limits.
- Exact searched addresses and coordinates are excluded. Selected public tracts and criteria exist in prepared files for up to one hour, as disclosed in the Privacy Notice.

Browser printing, screenshots, copying public facts, and direct reuse under source/software licenses cannot be reliably restricted. The controls protect the hosted export service and upstream capacity, not exclusive ownership of public data. Single-tract public reports still expose useful published facts. No claim of preventing all scraping is made.

## Provider protection

`pipeline/sources.ts` records source budgets and documentation. Published provider limits and internal operating caps are distinct. The implementation cannot inspect actual provider account usage or activity by other applications using the same key.

Runtime attempts use shared SQLite counters, at most two concurrent leases/source, a 30-attempt/minute ceiling, provider Retry-After cooldowns, and daily budgets. Retries count. Known provider ceilings are capped at 80%; sources without a verified daily limit default to disabled in production until the operator explicitly sets a conservative budget. Foursquare remains unavailable until the free catalog integration and constraints are verified.

Public county data is cached by geography (LAUS/QCEW 24 hours, QWI seven days); canonical tract site readings cache successful responses for 24 hours. Exact site coordinates and addresses are not cache keys. Source checks are user-triggered. Site cards show when readings were checked. An unavailable value is never treated as zero or absence of risk.

Census and BLS requests through the pipeline HTTP client use the same gateway when run against the same database. Separate CI machines or other projects using these keys do **not** share these counters automatically: coordinate schedules/reserved budgets or provide a single shared gateway before concurrent production use. Do not evade provider limits by rotating keys or accounts.

## Production setup — required before enabling the service

This implementation targets **one persistent host**, with all Node processes sharing the same local SQLite disk. Node 22.13+ is required; Node 24 is recommended. It is not suitable for independently scaled serverless instances or network-mounted SQLite. No paid service was added, and the actual host has not been selected or approved.

Configure the following through the host environment (see .env.example):

- `OZ_ORIGIN`: exact public HTTPS origin.
- `OZ_STORAGE_PATH`: absolute private persistent SQLite file path outside public/static files.
- `OZ_SINGLE_HOST=1`: explicit confirmation of the shared single-host architecture.
- `OZ_TRUSTED_IP_HEADER`: only a header that the trusted reverse proxy **overwrites**, stripping client-supplied values. Otherwise leave unset for conservative shared limits.
- `OZ_SOURCE_<SOURCEID_UPPERCASE>_DAILY`: verified operating budget per source, e.g. `OZ_SOURCE_CENSUSGEOCODER_DAILY`. A key is not evidence of unlimited usage.
- `OZ_SIGNUP_PAUSED=1`, `OZ_EXPORTS_PAUSED=1`, `OZ_LIVE_PAUSED=1`: operator stop switches.

Use restrictive filesystem permissions, TLS, request-size/time limits, bounded disk/backups, and log redaction at the host/proxy. Do not log request bodies, credentials, geocode queries, exact coordinates, or full upstream URLs. Keep backups private and set separate retention/deletion rules. Hosting must satisfy the owner's free-only, no-payment-method requirement. Deployment remains blocked on a suitable host and its operational configuration; environment-dependent API features fail closed when storage/origin is missing.

Operator commands (with the same storage environment as the server):

```sh
npx tsx scripts/access-admin.ts status
npx tsx scripts/access-admin.ts suspend ACCOUNT_ID
npx tsx scripts/access-admin.ts restore ACCOUNT_ID
```

Status reports counts, provider attempts, and prepared artifact size, not research queries. Suspension revokes sessions. There is no public admin endpoint.

### Retention

Account credentials and hashed recovery tokens remain until deletion. Sessions/challenges expire as above. Read/auth/download counters older than an hour, rotating network records older than two days, remaining usage records older than 35 days, and prepared exports older than one hour are pruned during service use. Expired records are not valid merely because physical cleanup has not run yet. Public geography cache records expire separately. Account deletion removes associated credentials, sessions, challenges, recovery codes, usage, prepared files, and account status records. Shared network counters remain briefly.

## Hosted MCP

Hosted MCP requires a free account-owned connection with explicit, versioned acceptance. It provides 19 bounded cached-data tools, with account/service quotas, output validation, concurrency leases, temporary abuse cooldowns, and operator pause controls. Browser cookies do not authenticate an external MCP client. Manual bearer connections remain available; optional OAuth authorization-code setup with PKCE is implemented but disabled until configured and verified with the intended clients. Live address/site requests and downloads remain website workflows. See [MCP_IMPLEMENTATION.md](MCP_IMPLEMENTATION.md) for the current tool list and controls.

## Verification and release checks

Automated checks cover filter symmetry/legacy links, missing data/ties, deterministic search, public payload bounds, forged sessions and foreign origins, real synthetic passkey registration/signed login and replay rejection, recovery/session revocation, current terms/recent authentication, account deletion, persistent quota reopen, atomic failed reservations, export attribution/numeric types, retry ownership, provider concurrency/cooldown, and cache privacy/expiry. Unit tests use an isolated SQLite database and mocked upstream requests.

Completed checks: 60 test files / 536 tests passed; targeted ESLint passed; production build and its TypeScript check passed; git diff whitespace check passed. Node emitted experimental SQLite/Web Crypto warnings, but the checks completed successfully.

Remaining release checks: real passkey UX on the chosen domain/devices; final responsive visual review after the user accepts the current terms (the in-app browser connection failed during the final check despite a local HTTP 200); operator legal identity/contact fields and legal review; host suitability, HTTPS, proxy trust, backups/log retention, shared key budgets, and load capacity. This implementation does not certify legal compliance or promise immunity from discriminatory reuse by someone else.
