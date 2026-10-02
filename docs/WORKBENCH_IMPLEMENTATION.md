# Research workbench

Implemented September 27, 2026. Entry: `/workbench`, linked from the Research Hub, main navigation, explorer, comparisons, and tract reports.

## Capabilities

| Capability | Implementation |
| --- | --- |
| 1. Local research projects | Explicit save/open/remove; 20 projects per device, names and notes remain in local storage. |
| 2. Inclusion evidence | Each applied criterion has an observed value and Meets / Does not meet / Unknown result. |
| 3. Filter impact preview | Draft state and criteria remain unapplied until chosen; counts partition the state into included, known failures, and unknowns. |
| 4. Explicit reference groups | User chooses tract, county, state, or their explicit selection. |
| 5. Research breadcrumbs | Hub → explore → compare → workbench with session selections preserved. |
| 6. Export recipes | Save scope, columns, ordering, and preferred format in a local project. |
| 7. Spreadsheet packages | CSV ZIP with text-GEOID instructions, typed JSON alternative, dictionary, attribution, and source dates. |
| 8. Tract-list matching | One-column CSV/text or paste; 11-digit validation, duplicates, missing records, explicit acceptance. |
| 9. Dictionary builder | Select measures and download definitions/source metadata without tract rows. |
| 10. Export receipt | Dataset version, criteria, columns, explicit limits, dates, and SHA-256 of row JSON. |
| 11. Download allowance planner | Preview current account and shared service limits before generation, without consuming an export. |
| 12. Boundary time machine | 2010/2020 relationship table with population, housing, land shares and cartographic overlays. |
| 13. Release comparison | Open two JSON exports locally; verify row checksums and classify value, coverage, scope, and definition changes. |
| 14. Coverage atlas | County/state cartographic shading and accessible count tiles, including missing observations. |
| 15. Source lineage | Field → units/definition → processing/geography → original source, vintage, license, attribution. |
| 16. Uncertainty view | Existing paired margin of error when published; no fabricated confidence or significance. |
| 17. Geography scale | Switch between tract, county, state, and selected-tract summaries. County permits remain a separate county statistic. |
| 18. Rules ledger | `/workbench/rules` compares saved source text with earlier Git captures and checks cited wording. |
| 19. Research completeness | Source, vintage, coverage, uncertainty, and separate designation/boundary verification checklist. |
| 20. Discrepancy desk | Structured factual correction draft; user can copy or open GitHub's public issue form. Nothing is sent automatically. |
| 21. Shareable specifications | Allowlisted URL fragment containing public IDs and criteria; excludes names, notes, addresses, coordinates, accounts. |
| 22. Developer query builder | Same-origin snippet and one bounded request using the current session; provider keys never exposed. |

## Data and interpretation

- No additional providers, keys, paid services, or model calls. Research queries read the published local dataset.
- Baselines are equally weighted summaries of available tract values. A median of tract household medians is **not** an official county/state household median. Missing observations remain missing, including absent IDs in explicit selections. Count sums require complete coverage.
- Existing `built_2020_or_later` and its margin of error are exposed together. Other measures without a published paired margin of error explicitly report its absence. No statistical-significance test is inferred.
- Current crosswalk: 126,222 tract relationships from registered Census block relationship, decennial count, and Connecticut identifier inputs. Generalized 2010 outlines are available for 52 states/territories from the existing Census cache. Missing shapes do not remove table records or imply unchanged boundaries.
- Boundary overlays have a common extent, show both vintages independently, and are not parcel determinations. The crosswalk's allocation assumptions remain visible.
- Release comparison requires two user-supplied exported snapshots. It does not invent historical observations. Receipt hashes verify internal consistency, not agency authenticity. Different export selections are not evidence that boundaries changed.
- Rules history is a comparison of local captures, not live monitoring or a determination of legal effect. Retrieval dates, prior commits, full text, and official links are visible. Missing earlier Git history is shown explicitly. The legal storage branch is not merged.

## Access and privacy

Public browsing remains anonymous. Public matching/comparison supports two tracts; a free account supports 500 matched IDs and 25 comparison tracts. Numeric/neighbor filters remain member-only. Shared specifications cannot elevate access.

Downloads continue through the existing authenticated, server-enforced export route: 500 rows/file; 3 exports and 1,000 rows/rolling 24 hours; 10 exports and 5,000 rows/rolling 30 days. Dictionary-only packages consume one export and zero rows. Exact prepared-file retries are private and retained at most one hour. Current allowance previews are not reservations.

Project names/notes are saved only after the user's explicit action, in that browser's local storage. Clearing site storage removes them. They are not sent to APIs or included in exported data/shared specifications. Imported release files stay in the browser. Tract matching sends only validated public identifiers, never invalid input or file names. No financial profiles, recommendation personalization, emails, payment details, or search-query logging were added.

The interface describes places and user-selected comparisons. It does not produce preferred-area rankings, desirability/compatibility scores, deals, allocations, or personal tax outcomes. Documentation completeness is not suitability or transaction readiness.

## Refresh commands

Run from the project root:

```text
npm run research:context
npm run research:boundaries
```

The first rebuilds crosswalk and source-history artifacts using existing clean tables, saved legal texts, and local Git history. `pipeline/publish.ts` also invokes it after publishing the main payload. After updating legal captures independently, rerun `research:context`; no remote fetch occurs. Full Git history improves ledger comparisons; shallow checkouts show unavailable history honestly.

The second republishes historical outlines from registered, already-downloaded Census archives. Missing caches do not trigger downloads or erase existing published snapshots. Deploy the generated `data/research-*.json` and `public/boundaries/tracts2010/` artifacts with the app. Server research data caches refresh when the server restarts after publication.

Production account storage still requires the host/origin setup documented in [ACCESS_IMPLEMENTATION.md](ACCESS_IMPLEMENTATION.md). These additions do not choose a deployment host or create a user credential.

## Verification

Automated checks cover privacy allowlists, import limits, dictionary-only exports, receipt-compatible release parsing, missing-value classification, descriptive summaries, coverage counts, same-origin protection, public/member restrictions, historical relationships, and map coordinate handling. Browser automation could not attach to Chrome or reach the local app through the in-app browser during this run; interactive visual and real passkey checks remain unverified.
