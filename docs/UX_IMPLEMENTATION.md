# Research workflow update

Implemented against main at `b4c6544`, September 27, 2026. The original findings and acceptance criteria are in [UX_REVIEW.md](UX_REVIEW.md).

## Changes

- Three task-based entry points, compact primary navigation, and secondary resource links.
- One ephemeral browser session for searches, batch results, criteria, map settings, guide answers, and up to four comparison tracts. Personal inputs are not persisted; the previous guide storage key is removed.
- Shared search with explicit ambiguous-address selection, unavailable/no-match states, and cancellation on navigation.
- Exact point handoffs between lookup, map, guide, and report. Prominent location-basis labels and consistent historical population-overlap wording.
- State-scoped area discovery with rural and tract-measure filters, optional neighboring-tract filters, neutral sorting, paginated results, list/map views, criteria in the fragment, and CSV export.
- Comparison of published tract facts with source periods, unavailable values, report links, printing, and CSV export.
- Task-specific guide paths for place research, timing mechanics, and fund/project rules; optional role selection and section-based progress.
- Reports organize status, classifications, local facts, site context, and full source information. Sources and geography accompany the figures; live providers load independently with retry controls.
- Batch size validation, progress summary, stop, individual correction/retry, contextual return links, and exports containing location basis, coordinates, dates, and disclaimer.
- Mobile filter dialog with native focus management, list/map controls, keyboard-operable report tabs, and horizontally scrollable comparisons.
- The requested one-line eCFR heading update. The legal storage branch remains unmerged.

## Verification

- 517 tests pass across 58 files, including new coordinate-fragment, ambiguity, unavailable-data, rural/range-filter, guide-path, CSV, and independent-provider cases.
- Application/library ESLint checks pass; production Next build and its TypeScript check pass.
- Browser checks covered search → report → return, batch → report → return, state/rural/home-value filtering, two-place comparison, mobile filters, place-only guide navigation, report → guide with place attached, and a public city-hall address through guide/report/map.
- Checked the responsive layout in the in-app browser. Its larger desktop screenshot capture can be clipped; the 900px and mobile captures were usable.

## Limits

This validates implementation and observed workflows, not a measured usability improvement. Short sessions with intended users are still the best check on whether status and source context are understood correctly. Live public services can be unavailable; the interface preserves published facts and identifies unavailable supplemental readings. Existing dataset and legal rules were reused; no new data source was introduced.

Changes are local. No deployment or merge was performed. Pre-existing changes to `package-lock.json` and the `public-old/` backup were preserved.
