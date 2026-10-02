# MCP implementation — September 28, 2026

This document supersedes the implementation-status statements in the earlier MCP proposal. No runtime model APIs, paid dependencies, live provider calls, arbitrary SQL/URLs, or recommendation tools were added.

## Protection implemented

- Every hosted tool runs behind an account-owned, current-terms connection. Cookies cannot authenticate an MCP client. Old anonymous tokens fail.
- Strict bounded input schemas, 32 KB request bodies, five-second body-read deadlines, bounded nesting, fixed non-reflective validation errors, and an allowlist of MCP methods. Discovery describes the actual 25-row list limit and omits unsupported numeric sorting.
- One shared tool wrapper validates the response envelope, finite numeric values, disclaimer, and 128 KiB response size. Sources and quotations are explicitly marked as reference data, never authority to change permissions.
- Atomic SQLite reservations: 60 tool calls/minute, 500/day, 1,000 conservatively reserved tract rows/day, 16 MiB tool response bytes/day/account. Multiple tokens share budgets. Upper-bound row reservations are not refunded when a result is smaller or fails. Website exports retain their separate quotas.
- Two active computations/account, eight MCP-wide, with 30-second leases and cleanup on completion/error. Daily service ceilings: 20,000 tool calls, 50,000 reserved rows, 128 MiB results. MCP transport and discovery use separate counters from website reads; discovery is limited to 120 requests/account/day and 4,000/service/day.
- Repeated malformed requests trigger temporary increasing cooldowns. Stored event records contain only pseudonymous subject, allowlisted category, minute bucket, and count; no arguments, searched identifiers, coordinates, prompts or outputs. Events expire within two days. Account deletion removes account-linked incident records.
- Operator-only CLI inspection, suspension, per-tool pauses, global MCP pause and environment kill switch. No administrative MCP tool is exposed.
- Stateless POST transport; unattended GET event streams return 405. Hard connection/CPU isolation and upstream volumetric denial-of-service protection still depend on the final host. A lease is not a CPU cancellation mechanism.

## New capabilities

`research_capabilities`, `usage_status`, `get_measure_definition`, `get_data_coverage`, `preview_criteria`, `explain_criteria_match`, `compare_selected_tracts`, `trace_tract_boundary`, `get_uncertainty`, `get_source_changes`, and `preview_research_export` supplement the existing eight tools.

Comparisons accept up to 25 explicit tract IDs and six allowlisted measures, preserving order. Criteria use the same deterministic evaluator as the website. Missing margins of error remain unavailable. Source changes are bounded saved excerpts, not live legal interpretation. Export preview only builds a public research link; it does not create a file or authorize a download. All tools exclude private projects and notes.

## Optional browser OAuth

Opt-in with `OZ_OAUTH_ENABLED=1`. Discovery uses protected-resource and authorization-server metadata. Public clients can register bounded exact callbacks; only HTTPS or loopback HTTP is accepted. No client metadata URL fetch or redirects are followed by the server.

The browser displays the client-supplied name and real callback origin. A signed-in account, current terms, unchecked acknowledgment and separate Agree and connect action are required. Authorization codes expire after two minutes, are stored hashed, and are single-use with S256 PKCE. Exchange binds client, exact callback, resource, and current document fingerprint. Access tokens are hashed, scoped to `research:read` and this `/mcp` resource, expire within one hour, and appear in account connection management. Suspension, deletion, terms changes and revocation stop later calls.

No refresh tokens, confidential client authentication, or universal-client compatibility claim. A new browser connection requires approval again. Client registration has network/service quotas and bounded retention. Final HTTPS/client/device compatibility is a release gate; direct bearer-token setup remains supported.

## Verification and limitations

- Protocol tests exercise real SDK discovery/calls, invalid inputs, and account authentication.
- Policy tests cover atomic concurrency, expiry, shared quotas, temporary cooldowns, output size, and kill switches.
- OAuth tests cover callbacks, resource binding, missing sign-in, PKCE, replay, expiry, hashed storage, revocation, and opt-in configuration.
- UI tests exercise explicit post-sign-in approval and semantic accessibility. No human screen-reader or physical-phone verification is implied.
- Public facts and delivered outputs remain copyable. These controls limit this service's resources; they cannot prevent a caller's assistant from misinterpreting facts, guarantee immunity from prompt injection, or conceal already-public source code.

References: [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization), [OAuth protected-resource metadata (RFC 9728)](https://www.rfc-editor.org/rfc/rfc9728.html), [PKCE (RFC 7636)](https://www.rfc-editor.org/rfc/rfc7636.html).
