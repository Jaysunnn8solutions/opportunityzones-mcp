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

**Free services only.** Every data source, API, basemap and tile service must be free to use with
no payment method on file: no paid tiers, no "free up to a quota, then billed" plans, no trials. A
free signup key is fine (Census, BLS, Foursquare Places Portal). If the only way to get something
costs money, leave it out and say so. Decided by the owner, 2026-09-26.

**Nothing personal is stored.** The app is authless and read-only. Gain amounts and searched
addresses stay in client state and the URL hash. Never log tool arguments or geocode queries.

**No runtime dependency on a sibling project.** The pipeline shares patterns with `census-mcp`'s
Census client by copying them, not by calling its deployment.
