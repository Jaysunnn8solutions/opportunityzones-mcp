# Connected research workflow

Implemented locally September 27, 2026.

## Paths

- Entry agreement → Research Hub → location, criteria/map, rule question, or tract list.
- Map and text results → place report or explicit comparison → Prepare data.
- Tract list → validate and review exceptions → explicitly use matches → Prepare data.
- Rules → return to the preceding research route, keeping session selections.
- Export → free sign-in if needed → return to the same export dialog → preview → explicit download.
- Saved local recipe → reopen → inspect current facts / version → compare an earlier JSON export with a current export.
- Website → review public research prompt → copy to a connected MCP client; MCP profile/comparison results link back to the same public places and measures.

## Changes

- Shared in-memory recipe: geography, filters, sort, explicit export IDs, measures, format, project name, and private notes survive route changes. No automatic browser-storage write.
- Compact Your research summary: scope, criteria, measures, saved/unsaved state, explicit local save, and workspace actions. Collapses details and reflows on small screens.
- Hub has four task-based entrances and up to three recent device-local projects. No personas or geography recommendations.
- Research workspace separates My research, Prepare data, Match a list, Criteria preview, Verify sources, and Review changes. Query/correction tools are grouped under More tools.
- Contextual preparation links preserve explicitly chosen scope. Filtered-state exports and explicit lists remain distinct; filters do not silently remove IDs from an explicit list.
- Field sets change columns only. No criteria, location, or preference is inferred.
- Authenticated export preview returns at most three sample rows in the chosen order, from the same row builder as downloads. It preserves text identifiers, shows units and missing conventions, and does not charge a file/row download allowance. Existing request limits still apply.
- Sign-in resumes pending exports and requested comparison additions. Canceling sign-in cancels continuation. Authentication never automatically downloads a file.
- Local recipes record their dataset build version. Quick refresh reads up to the current public/member comparison limit. A larger historical comparison uses the existing limited export workflow, with explicit earlier and later files; it does not invent historical values.
- Freshness disclosures separate observation/source vintage, agency release date (unavailable if not recorded), and site build date.
- Chat handoffs allowlist public IDs, criteria, and columns; exclude project names, notes, searched addresses, coordinates, and credentials. User reviews and copies; the product never calls a model. Public MCP capability/usage limits remain unchanged.
- Consent return navigation preserves the browser URL fragment for supported research routes, so a comparison/shared recipe survives explicit acceptance. External redirects remain blocked.

## Boundaries

- Projects are device-local and saved only by explicit action. Clearing browser storage removes them. Opening a recipe reads current published data, not a frozen historical snapshot.
- The project build version is a reminder to review data, not proof that a particular value changed. Actual release differences require two exported JSON snapshots.
- Export previews/downloads still require an account with current terms. The original server-side limits, consent gate, and no-query-logging rules are unchanged.
- A selected 500-row subset must still be explicitly chosen in the export dialog; the local recipe records scope/order/fields, not a hidden recurring truncation.
- MCP comparison links preserve up to two user-selected IDs and six measures. Larger or member-only workflows stay on the website. Local/stdio links are relative unless OZ_ORIGIN is configured.

## Verification

- Regression tests cover route-remount state preservation, explicit-only local saving, normalized saved/dirty status, mocked sign-in/resumption/cancellation, chat allowlists, bounded export sample/file agreement, account gating, consent return links, and MCP comparison URLs.
- Full regression suite: 576 tests passed; an additional end-to-end component test passed for tract-list matching → explicit acceptance → Prepare data → route remount. That test also passed the automated WCAG A/AA structural audit (visual contrast excluded in jsdom).
- Production build, including TypeScript and page generation, succeeded. Modified application/tool files passed ESLint.
- The live browser remains at the unchecked agreement screen. No operator terms acceptance or real account credential was created for testing. Live signed-in browser flows and passkey prompts still need an operator smoke check.
