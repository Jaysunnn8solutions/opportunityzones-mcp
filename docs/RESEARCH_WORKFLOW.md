# Research experience update — September 27, 2026

## Product changes

- Find areas filters work nationwide without a selected state. A state or county narrows that scope; neighboring percentile bands remain relative to each tract's state. Basic status and tract-value searches skip adjacency loading and use the local published dataset.
- Selecting a map or list tract opens a keyboard-accessible facts dialog with source dates, report/PDF and data export paths, and comparison controls. Free accounts can compare 25 tracts; public previews remain at two. Larger comparisons use one tract per row. Alternate research links sit beneath the map.
- Place reports offer a two-minute narrative, research focus, linked published facts, and unresolved questions.
- Find areas uses one evidence evaluator for both matches and explanations. Results show the requirement, actual value, and Meets / Does not meet / Unknown. Missing neighbor columns no longer silently bypass a criterion.
- Empty results explain exclusions, missing values, and how many matches removing each criterion would produce. Filters change only through a user action.
- Comparisons offer 11 published measures and three research topics: overview, housing, and people/work. Numeric differences are descriptive ranges, with missing-data and mismatched-vintage handling.
- `/brief` assembles the research question, criteria, selected places, comparison, evidence, unresolved questions, and source metadata. Print styles support browser printing and saving as PDF.
- Public JSON research files save one to 25 tract IDs, research focus, measures, criteria, and state scope. Reopening refreshes facts from the current dataset. Files are parsed locally, size limited, versioned, and allowlisted; addresses, personal inputs, and embedded facts are excluded. Viewing comparisons remains limited to two tracts for public visitors and 25 for free accounts.
- The guide now organizes general information by research topic. Persona pages redirect to `/guide`; the old role and personal-money wizard, state parser, and persona content are removed.
- Authored product language and displayed metadata use American English. Original legal quotations remain verbatim.

## Data and boundaries

Uses existing published data; no new external services or model calls. Source metadata comes from the built dataset, with links from the source registry. Site hazard and exact-address lookups remain in the place report and are explicitly excluded from the tract brief.

All outputs describe places. No personalized tax outcome, investment ranking, allocation, fund recommendation, or return prediction is added.

## Verification

- 513 tests passed, including new evidence/filter agreement, pending designation, missing data, comparison vintage/precision, and research-file privacy/validation cases.
- Production build and TypeScript completed successfully; UI/helper lint passed.
- Browser verified: tract lookup, housing focus, Georgia rural/home-value filtering, criterion evidence, adding a second tract, comparison context, assembled brief, place-to-rules handoff, retired persona redirect, and the general guide at a 390px mobile width without horizontal overflow.
- The brief waits for criteria evidence before enabling its print action.
- Browser automation timed out while checking a file download. JSON serialization/parsing is covered by automated tests; native save/print dialogs require a normal-browser smoke check.

Changes are local and uncommitted.
