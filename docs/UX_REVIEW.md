# Opportunity Zone screening: UX review

Implementation and validation notes: [UX_IMPLEMENTATION.md](UX_IMPLEMENTATION.md).

Reviewed September 26, 2026 (America/New_York). Baseline: commit b4c6544, local working tree. This is a product and interaction review, not a legal validation of the published rules.

## Assessment

The product has useful ingredients: direct lookup, readable rule explanations, primary-source citations, contextual source dialogs, tract reports, a filterable map, batch screening, and printable output. The main opportunity is to connect these into a continuous research workflow. The current interface repeatedly asks users to choose another tool, re-enter context, or interpret raw data without enough help at the point of use.

The intended outcome should be: **I understand the status of this place, I know why it matches my stated criteria, and I can carry the evidence into my next research step.** Completion should mean a usable screening brief, not a recommendation or a personalized tax conclusion.

## Evidence and limits

Walked through the local application in the browser: home-page tract lookup, the sample Appling County report, report-to-guide navigation, the Local government guide branch, the map and its expanded filters, and a two-row batch check followed by report navigation and browser Back. Inspected desktop layout at 1440 × 900 and mobile layout at 390 × 844; the in-app browser's desktop screenshot capture showed artifacts, so precise desktop visual judgments are based on the DOM and styles as well as the capture. Mobile filter layout was directly visible.

Reviewed the associated UI, routing, filtering, source, and state-management code. No production performance benchmarks, real-user usability study, exhaustive accessibility audit, or independent verification of statutory claims was performed. Live-source failures observed here describe this local run, not guaranteed production behavior.

## Findings, in priority order

### 1. Preserve work and location context throughout the journey — P1

**Observed:** Check properties successfully returned a row for `13001950100` and a no-match row for `00000000000`. Opening the successful tract report and pressing Back returned to an empty form with no results. This makes the batch tool expensive to use for actual research.

**Code evidence:** `app/ui/PropertyChecker.tsx:81` stores inputs and rows only in the page component. Its report links navigate away at line 184. `app/ui/MapApp.tsx:132` saves view, selected tract, and basemap in the hash, but omits filters and the selected coloring layer. Home and report links to `/guide` supply no place context; the guide loads only its own saved answers.

**Change:** Maintain one ephemeral research state across internal navigation: chosen place, search scope, filters, selected layer, comparison selection, and batch results. Keep addresses and personal inputs in client memory under the current privacy rule; public geography/filter state can use a URL fragment. Use a persistent client provider or keep results mounted while opening details. Do not add persistent personal storage as an incidental UX fix. Give reports a specific “Back to your results” action.

**Acceptance:** Open a result, read a rule, return, and find the same inputs, result rows, filters, scroll position, and selection. Opening the guide from a report carries that place and visibly identifies it. A reload has explicitly defined behavior; private state is never silently serialized into query strings or sent to analytics.

### 2. Keep exact-address and tract-level evidence distinct — P1

**Code-confirmed:** A map address lookup creates a point marker, but “Full tract profile and sources” links only to `/tract/{geoid}` (`MapApp.tsx:565`). `SiteSnapshot` then uses a tract interior point. The home search already has a `reportHref` helper that can preserve a point in the hash. Batch screening also discards coordinates.

**Risk:** A user who searched a building can reasonably believe the next page's flood and environmental context describes that building. A small explanation below the report metrics does not sufficiently signal that the location changed.

**Change:** Carry the selected point consistently and show a prominent location-basis label: “Searched address” or “Representative point inside this tract.” Keep tract demographics, point-based hazards, county statistics, and ZIP-derived measures visibly distinct. Show the matched address and offer correction before continuing if geocoding returns alternatives.

**Related issue:** `Badges.tsx` and `FrontDoor.tsx` describe a tract with at least 50% population overlap as a “2018 zone,” while the batch table uses “Partly” below 99.9%. Standardize this as an overlap statement. A crosswalk percentage does not establish the historical status of every address in the current tract.

**Acceptance:** The same address has the same point basis through home, map, batch, report, and export. Partial historical overlap is labeled as partial everywhere. Unknown status cannot become “No” through formatting.

### 3. Make finding areas a primary workflow — P1

**Observed:** “Find areas” starts collapsed inside Map. It returns map outlines and a count, with no results list, comparison tray, or direct path to a screening brief. The map's own search accepts addresses rather than the address/tract/state choices available at the front door.

**Code evidence:** `FindAreas.tsx` exposes designation flags and five measures of neighboring tracts. It has no rural filter, even though rural status is a prominent part of the product. `MapApp.tsx` calculates matches over loaded state data; search scope is not an explicit user choice. Previously loaded states can remain in the match set as the map moves.

**Change:** Start with an explicit state or region, then status and the user's criteria. Show a synchronized list and map. Each result should say exactly which criteria it meets, show the selected measures, and identify missing data. Add rural status and tract-level criteria where the existing data supports them. Put adjacent-tract measures in a clearly named optional group. Use neutral sorting by a chosen metric, with no default “best” or composite investment score.

**Acceptance:** A person can find areas without knowing a tract ID or manually navigating a national map. The list and map agree on the search scope and count. Zero results offer editable criteria; unavailable data is distinguished from a genuine mismatch. The user can compare a few places and export the selected facts and sources.

### 4. Organize entry points by task and simplify navigation — P2

**Observed:** Eight top-level navigation links compete with a home-page search, a three-part explainer, a persona selector, tool cards, program status, and a floating Claude button. Multiple routes offer similar starting points.

**Change:** Give the first screen three clear choices: **Check a place**, **Find areas**, and **Understand the rules**. Place batch checking within the place-checking route. Make role selection optional and contextual. Keep rules/sources and integrations readily available in secondary navigation. “Funds” should describe its actual output, such as “Fund research checklist”; its current name and “Find and review funds” entry can imply a directory the product does not provide.

**Visual direction:** Retain the restrained green identity and existing dark/light support. Use a compact header, a clear selected navigation state, one main action per screen, fewer outlined buttons, and a consistent input/feedback pattern. Reduce persistent page furniture so results have more room. Keep the required informational disclaimer visible and concise, with the relevant eligibility caveat next to the result.

**Acceptance:** A first-time visitor can identify the right route from the first screen without understanding product terminology. The main screening action remains reachable on a small phone without scrolling past promotional or integration content.

### 5. Make the guide adapt to the task, not just the examples — P2

**Observed:** Selecting “Local government” still leads to the required “Where would the money come from?” question. Entering from a tract report starts at the persona question without the tract attached.

**Code evidence:** `lib/guide/steps.ts` always requires persona and money choices. Money answers change the steps, while persona does not meaningfully change the route. The initial nine steps expand to thirteen for a capital-gain path and fourteen with a selected place. This moving denominator can make progress feel less predictable.

**Change:** Offer short task-specific modules: understand designation; research a place; learn generic timing mechanics; prepare questions. Use a stable section-based progress indicator and show the expected output before starting. Let a local official or location researcher go directly to geography and criteria. Keep examples optional. Label any date illustration by its explicit assumptions instead of giving it the visual authority of a confirmed personal deadline; highlight exceptions at the point they matter.

**Acceptance:** Local-government research can finish without supplying a money source. Existing place context is reused. Every required question changes the useful output. Users can tell what remains, skip irrelevant explanations, and end with a concise evidence/checklist summary.

### 6. Put status, meaning, freshness, and source together — P1 for status; P2 for general metrics

**Observed:** The report has a useful “What this means” section, but the headline status has no adjacent data-as-of date. Eight statistics appear with repeated “Higher than X%” language. Source vintages are far below in a long attribution list. Some headline measures are simply `n/a`.

**Change:** Lead with separate labeled facts: eligibility, certified designation, and rural classification. Pair the designation statement with the dataset's verification/publication information. Distinguish “not recorded in this dataset” from a claim about current nationwide publication. Put the source period and geographic basis on each metric or within an adjacent accessible disclosure. Use neutral comparisons and show only the metrics relevant to the selected criteria first; preserve all measures under a secondary view.

**Copy direction:** “Eligible for consideration; a certified designation is not recorded in this dataset.” Follow with the plain-language meaning and a source link. Do not imply that a fraction of a state's available slots is a tract's probability of designation. Avoid phrasing “top” or “stronger” as a generic quality judgment for places; name the measured direction, such as higher neighboring income or lower neighboring unemployment.

**Acceptance:** Without opening another page, a user can explain what is known, what remains pending, the geography the number describes, and how old the underlying information is. Exported results retain those distinctions and the informational disclaimer.

### 7. Give mobile an intentional research layout — P2

**Observed at 390 × 844:** The disclaimer and navigation take a substantial part of the first screen. With Find areas expanded, the map falls below the entire set of controls. The mobile CSS explicitly stacks the full panel above a `60vh` map (`globals.css:254`). Tiny adjacent layer/info buttons make the dense controls harder to use.

**Change:** Use a compact header, a List/Map switch, and a filter sheet with a visible result-count action. Keep the selected-place summary accessible without requiring a long scroll back through filters. Reserve sufficient touch targets; keep the most important status and actions in the natural reading order. Move the floating integration promotion out of task-focused screens.

**Acceptance:** At 390px and 320px widths, changing a filter and seeing the resulting places is a short interaction. Essential controls do not require hover. Keyboard users have a list alternative to clicking map polygons.

### 8. Make waiting, unavailable data, and recovery useful — P2

**Observed:** In the sample report, earthquake and traffic showed source timeouts; amenities showed “not configured on this server.” The latter exposes deployment detail to a user who cannot act on it. The error text “Source the source did not answer in time” is also awkward.

**Code evidence:** `siteSnapshot` waits for all six providers before returning the tile set. `SiteSnapshot` offers no retry action. Map search has no pending/disabled submit state and no catch for a rejected network request. The shared lookup helper can throw, while home/guide handlers use `finally` without a corresponding catch. This differs from the batch tool's explicit exception handling.

**Change:** Show published status immediately and let supplemental context arrive independently where practical. Distinguish loading, temporarily unavailable, not covered, and not offered here. Give actionable retry/correction controls. Explain unavailable data without suggesting a zero value or an absence of risk. Use consistent inline errors and live announcements. Make multiple geocoder matches a choice instead of silently accepting the first.

**Acceptance:** A slow provider cannot block basic screening. A failed request leads to a visible recovery action. Repeated clicks cannot create conflicting searches. Partial results remain useful and clearly labeled.

### 9. Make batch output a research handoff — P2

**Observed:** A table and CSV exist, but there is no summary of matched/unmatched/pending rows, per-row correction or retry, or cancellation. More than 25 lines checks only the first 25 after a warning.

**Change:** Show an input count and validate the limit before starting. Add an explicit progress summary, a way to stop, and edit/retry for failed rows without rerunning successful ones. End with factual counts and unresolved matches. Keep an exportable screening brief with the chosen criteria, exact geography, status, dates, sources, and limitations. Do not label screened locations as qualified investments.

**Acceptance:** Users can resolve one bad row without losing the rest. Downloaded output remains intelligible outside the app and preserves missing/pending states. No full addresses or sensitive inputs are placed in server logs or persistent storage.

### 10. Align privacy language with actual behavior — P1

**Code-confirmed:** The footer says “Nothing you search is stored.” The guide writes `placeInput`, selected place, answers, and sale date into `sessionStorage` (`GuidedCheck.tsx:156`). Its page introduction explains tab storage, but also says answers are never sent to a server, whereas an entered address is submitted for geocoding.

**Change:** Resolve the implementation against the existing “Nothing personal is stored” rule. Prefer client memory for personal inputs, with public navigation state in the hash. Then use one precise explanation everywhere: what stays in the browser, which lookup receives the address, what is retained, and how the user clears it. Do not add a retention mechanism just to make navigation more convenient.

**Acceptance:** Product copy and technical behavior agree. A useful continuity solution does not require collecting personal financial details or storing searched addresses persistently.

## Target journeys

| Starting intent | Shortest useful path | Useful end product |
| --- | --- | --- |
| I have an address | Search → confirm match → status and meaning → optional context | Place screening brief with exact geographic basis |
| I want areas meeting criteria | Choose scope → set criteria → list/map → compare selected places | Factual comparison with matching criteria and sources |
| I need to understand the rules | Choose topic → concise explanation → relevant example/source → optional questions | Saved or printable general-information checklist |
| I have multiple properties | Paste → validate → screen → resolve unmatched rows → export | Complete property screening table with unresolved items explicit |

The primary place report should use progressive disclosure: **answer first**, **why and what is unknown second**, **relevant local facts third**, **full rules and source detail on demand**. The current source dialog is a strong foundation for this.

## Recommended delivery order

1. **Trust and continuity:** fix lost batch results, point loss, inconsistent overlap labels, and privacy mismatches; attach status freshness and geographic basis to results. These are concrete problems in the current experience.
2. **One complete discovery journey:** promote Find areas, add explicit geographic scope and a synchronized results list, preserve criteria on return, and support a small factual comparison and export. This most directly fulfills the stated product goal.
3. **Task-based entry and guide:** simplify the home/navigation structure and branch the guide by the user's actual job. Apply the visual system to this complete journey.
4. **Mobile and recovery:** introduce List/Map and filter-sheet behavior, accessible search feedback, partial-source handling, and row-level batch recovery. Test these during each earlier phase rather than deferring all mobile work until the end.

No new paid service, model call, login, analytics collection, fund ranking, or allocation recommendation is needed for these improvements. Existing data should be reused before considering any new input; any new source still requires registry/license review under AGENTS.md.

## Validation before calling the redesign successful

Use short, observed sessions with people representing different tasks. Ask them to check an address, distinguish eligibility from designation, find areas using two stated criteria, explain the age/geography of a displayed number, open and return from a report, and export a useful summary. Record task completion, wrong interpretations, unnecessary steps, and lost work. Treat improvements as hypotheses until these tasks get easier.

Engineering checks should cover the specific failures above: navigation state survival; identical point propagation across entry routes; partial-overlap labels; unknown versus false; filters/list/map agreement; geocoder ambiguity; failed and slow services; keyboard operation; and 320/390/1440px layouts. Avoid optimizing for raw engagement or an invented overall UX score.
