# MCP protection and capability plan

Status: researched proposal, September 27, 2026. This document does not claim the proposed controls are implemented.

Implementation update, September 28: see [MCP_IMPLEMENTATION.md](MCP_IMPLEMENTATION.md) for the implemented protections, 19 tools, optional OAuth, tests and remaining deployment limits. The current-code findings and suggested pilot values below describe the earlier proposal, not the present service.

## Current code findings

Reviewed `app/mcp/route.ts`, `lib/tools/*`, `lib/access/http.ts`, `lib/access/store.ts`, and the installed `mcp-handler` wrapper.

- The hosted route is anonymous and read-only, with a 32,000-byte request cap, JSON batch rejection, validation of supplied Origin headers, and persistent request accounting.
- Hosted address lookup and live enrichment are disabled. No hosted MCP tool needs provider credentials or model calls.
- Four working research tools are exposed: `get_tract`, `list_tracts`, `compare_tract`, and `oz1_findings`. Two disabled capabilities are still advertised as tools that return an unavailable message.
- Public `list_tracts` is capped at 25 rows and rejects numeric sorting, but discovery still exposes the underlying 50-row schema and sort fields. Metadata should describe the effective hosted capability.
- Tool schemas are strict objects, but `list_tracts.state` accepts an unrestricted string, which is echoed into its invalid-state error. Narrow its format/length and remove raw-input reflection, including SDK validation messages.
- Tool results are primarily Markdown/text without an output schema. Source excerpts and publisher strings need an explicit untrusted-data boundary.
- MCP uses the website's generic `read` bucket and is always charged as anonymous. It has no member authorization flow or separate row/byte accounting. A missing trusted proxy IP configuration puts everyone in a shared network bucket.
- No MCP-specific concurrency leases, tool cost budgets, incident tripwires, or kill switch were found in the route. Provider controls elsewhere do not provide these protections for local CPU/egress.
- Production limits depend on persistent SQLite storage on one confirmed host. Multiple independent replicas would not share the same quota ledger. Public MCP also depends on this ledger and therefore fails closed if production storage is absent.

## Security boundary

The product serves fixed, deterministic operations over approved published data. It does not run an LLM. Prompts cannot grant permissions: the server determines tools, fields, scope, row limits, and access independently of model instructions.

The server cannot see or control all instructions in a caller's assistant and cannot guarantee the assistant will never turn facts into advice. It can avoid creating recommendation features, restrict its own outputs, document permitted use, and respond to measurable misuse. Structured JSON and disclaimers help clients interpret facts, but neither is an injection-proof security boundary.

### 1. Request and execution controls

- One common policy wrapper for every tool: strict bounded schema, authorization, atomic budget reservation, bounded execution, output validation, provenance, then minimal event counters.
- Allowlist method/tool/field names; bound strings, arrays, nesting, numeric magnitude, and response size. Reject unknown arguments. Fixed errors must not repeat adversarial text.
- Retain transport-compatible JSON-RPC errors and stable machine-readable error categories. Report limits and retry times so clients can stop loops.
- Validate Host and any supplied Origin against the configured deployment. Origin is a browser defense, not authentication; native clients may legitimately omit it.
- Use TLS in production. Trust client-IP forwarding only behind an explicitly configured proxy that strips incoming spoofed headers.
- Bound request-body read time and connection lifetime at the host/proxy. Disable unsolicited GET event streams if the supported protocol mode does not need them; otherwise cap stream lifetime and concurrent streams.
- Use shared, expiring concurrency leases. Apply separate ceilings for MCP and website traffic so an MCP surge cannot consume every browser allowance.
- Bound CPU work by indexed scopes, caching, and input caps. A JavaScript Promise timeout cannot interrupt synchronous computation; use an isolated worker when hard cancellation is necessary.
- Run the data service with read-only published files and no provider credentials or arbitrary egress wherever deployment isolation permits. Write access belongs only to the narrow quota/security store. No model-directed URL fetch, shell, SQL, filesystem path, upload ingestion, or tool installation.

### 2. Access and extraction controls

Retain limited anonymous fact access. Require a free account for broader comparisons, numeric criteria, and export preparation. Downloads continue through explicit website confirmation and the shared export allowance.

Authenticated remote MCP requires a standards-compatible authorization flow connected to the existing passkey account. Use narrowly scoped, short-lived, revocable tokens issued for this MCP resource, with issuer/audience/expiry/scope validation on every call. Never forward website cookies or provider tokens to MCP clients. Account-linking metadata/token hashes would need a documented narrow extension to the existing account-data policy; no email, financial profile, or paid identity service is needed.

Account quotas, network budgets, and service-wide limits must work together. Passkeys do not prove one account per human. Rotating accounts or networks must not reset the service-wide capacity ceiling. IP-only punishment is unsuitable for shared offices and carrier networks.

Suggested pilot ceilings, to tune after bounded local load tests:

| Budget | Anonymous | Free connected account |
| --- | --- | --- |
| Research tool calls/minute | 20 | 60 |
| Research tool calls/rolling day | 100 | 500 |
| Simultaneous computations | 1/network bucket | 2/account, plus network ceiling |
| Tract rows/list call | 25 | 100 |
| Detail rows delivered/day | 100 | 1,000 across MCP data calls and downloads |
| Tool-result payload | 128 KiB maximum | 128 KiB maximum |
| Live provider calls | 0 | 0 initially |

These are proposed service budgets, not provider limits or guaranteed capacity. Add a global daily byte/work budget, a small reserved website capacity, and bounded metadata/discovery traffic. Counters apply to resource consumption regardless of benign or malicious intent. Cache hits reduce CPU but still consume egress/row allowances.

### 3. Prompt injection and content integrity

- Define reviewed tool descriptions and schemas in code; record their build hashes and require review of changes. Do not load descriptions from user content.
- Return schema-validated structured facts with units, geography, observation period, source, missingness, limitations, and disclaimer. Keep human-readable summaries generated from fixed templates.
- Treat legal excerpts, dataset strings, and imported source content as untrusted quoted material. They cannot change tool policy, add tools, select destinations, or request secrets.
- Quarantine unexpected schema changes, control characters, unexplained publisher/URL changes, or suspicious instruction-like additions during source refresh. Preserve the prior validated publication and require review. Detection is a secondary signal, not proof of malicious intent.
- Expose only registry-approved source links. Never fetch arbitrary URLs supplied by the model. Do not relay third-party instructions about calling other tools.
- Pin dependencies through the lockfile, review upgrades, and test for known vulnerabilities and unexpected tool metadata changes. No paid scanner or runtime model moderation dependency.

### 4. Tripwires and response

| Signal | Response |
| --- | --- |
| Repeated invalid schemas or unknown tool calls | Fixed errors, progressive cooldown, bounded event counter |
| Sustained row/byte volume above allowance | Stop at quota, show retry time, offer the bounded export workflow |
| Excessive concurrency or retry loops | Reject new work before computation; release expired leases |
| Invalid/expired/wrong-audience tokens | Reject; count failures; allow revocation of the affected connection |
| Invalid publication/schema/hash | Quarantine new artifact and retain the last validated snapshot |
| Compute/byte pressure across clients | Pause heavier tools, retain bounded status/metadata responses and reserved website capacity |
| Repeated confirmed abuse | Revoke the connection/account's MCP access with an operator review path |

An isolated malformed request is not grounds for a permanent ban. Account for normal initialization, agent retries, accessibility tooling, and shared networks. Document ordinary quotas; do not disclose detailed detection thresholds in errors.

Record only allowlisted tool name, event code, time bucket, duration, row/byte counts, and short-lived pseudonymous abuse identifiers. Do not log prompts, arguments, queried GEOIDs, addresses, exact points, outputs, cookies, tokens, or source keys. Set short retention for incident counters; keep ordinary usage totals only as long as their quota windows require. Audit hosting/proxy logs as well as application code. No covert device fingerprinting or external telemetry.

Add an operator-only local status/revocation command and per-tool/global kill switches. No remotely exposed administrative MCP tools or automatic external messaging.

## Tools to add

Build these as bounded adapters over the existing workbench/research functions, sharing validation and authorization across both interfaces.

| Tool | Useful result | Constraint |
| --- | --- | --- |
| `research_capabilities` | Available tools, source versions, supported limits and formats | Reports effective access; bounded discovery; no internal topology or secrets |
| `usage_status` | Remaining calls, rows, bytes, cooldown and reset times | Only current caller's allowance |
| `get_measure_definition` | Units, denominator, geography, vintage, license and source lineage | Allowlisted field IDs |
| `get_data_coverage` | Available/missing counts for a specified measure and scope | Approved aggregate scopes; no quality/desirability score |
| `preview_criteria` | Match, known-failure, and unknown counts before a list request | Explicit structured criteria; member-only advanced fields |
| `explain_criteria_match` | Criterion-by-criterion evidence for an explicit tract | No automatically chosen criteria or suitability conclusion |
| `compare_selected_tracts` | Side-by-side values with explicit county/state/selection reference | User-supplied IDs, bounded count, no winner or composite score |
| `trace_tract_boundary` | 2010/2020 relationship shares and boundary caveats | Existing crosswalk, explicit vintage |
| `get_uncertainty` | Published paired margin of error, missingness, caveats | No fabricated confidence or significance |
| `get_rule_source` | Fixed rule/source section, saved date, official URL | No personal fact pattern or tax-outcome calculation |
| `get_source_changes` | Differences between approved captured source releases | Captured versions only; no claim of legal effect |
| `preview_research_export` | Row count, missingness, columns, allowance and website handoff | No autonomous download, no extra quota channel; user reviews export on site |

Keep local notes and personal projects out of MCP. Do not add open-ended `recommend`, `best_area`, `optimize_return`, resident matching, protected-characteristic targeting, arbitrary web research, arbitrary calculations, or investment/tax suitability tools. Income/poverty metrics needed to explain statutory geography remain available as sourced place facts; their availability is not approval for discriminatory targeting.

## Intellectual property and deployment limits

Anything delivered to a client can be copied. Rate limits constrain hosted extraction and resource abuse; they do not make public data, browser assets, or publicly available repository code secret. Preserve source license/attribution obligations and encourage legitimate bounded analysis. Never poison facts, invent values, or silently change data as an anti-scraping measure. Use truthful versioned receipts and a canonical publisher page for verification; checksums alone do not authenticate an origin.

Future genuinely private implementation details must stay outside public repositories and public bundles. Restrictions on this hosted endpoint cannot bind someone running already-published code on their own machine. A free single-host deployment cannot promise immunity to volumetric denial of service. Host-level connection controls and fail-closed capacity limits are necessary; no billable infrastructure or automatic paid scaling is proposed.

## Implementation sequence and acceptance gates

1. Harden existing tools: remove reflective errors, align discovery with actual access, validate outputs, separate MCP counters, row/byte budgets, concurrency leases, fixed errors and kill switches.
2. Add privacy-preserving event counters and operator inspection. Verify multi-process quota atomicity, restart persistence, lease expiry, blocked-request behavior, and web/MCP capacity separation.
3. Add metadata, coverage, criteria explanations and boundary tools using existing local data. Extend protocol integration tests through the real MCP route, not just direct handlers.
4. Add passkey-backed remote authorization only after selecting and testing supported client flows; verify PKCE, exact redirect matching, audience/scope, expiry and revocation. Keep exports behind the website confirmation boundary.
5. Add richer comparisons and export previews with shared quotas. Test neutral output and approved-field restrictions before publishing each capability.

Adversarial fixtures should cover fake administrator claims, injected state/source text, Unicode/control characters, oversized/deep JSON, invalid tool names, forged pagination, modified schemas, wrong-origin/host requests, spoofed forwarded headers, bad tokens, floods/retries/abandoned streams, worker cancellation, missing sources, and privacy-safe logs. Tests should also cover ordinary clients and shared-network users to limit false positives. Run only bounded local tests; no live-provider load testing.

## Primary references

- [MCP Security Best Practices, 2026-07-28](https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices): audience validation, token passthrough, authorization and SSRF threats.
- [MCP Streamable HTTP transport, 2025-11-25 compatibility specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports): Origin validation, request/response and optional GET-stream behavior.
- [OWASP MCP Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/MCP_Security_Cheat_Sheet.html): schema validation, least privilege, isolation, resource controls and tool integrity. Its broad full-parameter logging suggestion is deliberately not adopted because this project's privacy rules prohibit argument logging.
- [OWASP MCP Tool Poisoning](https://community.owasp.org/attacks/MCP_Tool_Poisoning): untrusted tool output and server-side enforcement.
- [OWASP Logging Vocabulary](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Vocabulary_Cheat_Sheet.html): bounded security events and avoiding full prompts/tool inputs in relevant MCP incident telemetry.
