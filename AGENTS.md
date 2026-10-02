<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project rules

**This is a screening tool, not an adviser.** Every number it emits describes a *place*, never a
recommended action. Do not add output that recommends an allocation, names a fund or deal, or
computes a user's tax outcome as advice. Statutory mechanics are shown generically, with
"informational, not investment/tax/legal advice" present in the UI, in MCP tool descriptions, and
in every tool response footer.

**Every data input must be license-clean for commercial use.** Public domain, or openly licensed
with commercial rights (CC0, CC-BY, PDDL, ODbL, CDLA-Permissive, ODC-BY). No listing-site data, no
Google imagery derivatives, no paid parcel feeds, nothing behind a ToS that forbids redistribution.
`pipeline/sources.ts` is the single registry of what is fetched and under what licence; add a source
there or not at all, and `npm test` fails if a source lacks a licence and attribution string.

**Free plans only, with no payment method and a hard stop at limits.** Every data source, API,
basemap, tile service, library and hosting dependency must be usable without payment. Free plans
of providers that also offer paid plans are allowed only when no payment method is required or
on file, and service stops at the free limit without charges or automatic upgrades. Specifically:
- No paid APIs of any kind, including LLM/AI model APIs (no Anthropic, OpenAI or similar calls from
  the app, the MCP server or the pipeline). People bring their own Claude to the MCP server; the
  product never calls a model itself. The revised hosting/cost policy does not authorize adding
  model API calls.
- No free trials, billable overages, automatic paid upgrades, or payment methods. A budget alert
  or application rate limit alone is not a provider-enforced billing safeguard.
- Verify the exact signup route and plan, including marketplace billing, free quotas, exhaustion
  behavior, retention/backups, and permitted use before provisioning. Never attach a payment
  method or upgrade automatically; stop and reassess if a service changes its terms.
- A free signup key to a free public service is fine (Census, BLS, the Foursquare Places Portal for
  the open OS Places data).
If a service cannot meet these conditions, leave it out and say so. Owner revision, 2026-10-01,
supersedes the 2026-09-26 blanket exclusion of free tiers from paid providers. No provider has
been selected or deployment authorized by this policy change alone.

**Minimal account data only.** Public browsing is authless. The owner authorized optional free
signup and limited downloads on 2026-09-27. Passkey credentials/public keys, hashed sessions and
recovery codes, accepted terms, usage counts, and short-lived abuse identifiers are the narrow
account/security exception. Never log tool arguments, geocode queries, or exact searched points.
No financial profiles, names, emails, payment details, or recommendation personalization.
Public-tract export artifacts may be retained privately for at most one hour for retries.

**User-saved research projects stay local.** The owner authorized device-local projects and
notes on 2026-09-27. Save only by explicit user action; provide removal. Never include project
names, notes, addresses, or exact points in shared specifications, account records, API snippets,
or server-generated research exports. Imported research files are parsed with bounds and
allowlists; only valid public tract identifiers are sent for matching.

**No runtime dependency on a sibling project.** The pipeline shares patterns with `census-mcp`'s
Census client by copying them, not by calling its deployment.
