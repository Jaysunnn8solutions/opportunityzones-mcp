# Accessibility implementation and verification

Technical target: WCAG 2.2 AA. Updated 2026-09-27. This is an engineering record, not an ADA certification or a claim of full WCAG conformance.

September 28 update: map selection now opens a native tract dialog with keyboard focus/return, comparisons support 25 tracts for accounts, and alternate research links sit below the map. ZIP data exports include a semantic offline `report.html` checked with axe; this is an accessible alternative, not verification of tagged PDFs. OAuth approval has a labeled unchecked acknowledgment, visible callback origin, explicit post-sign-in approval, and announced errors. MCP now exposes 19 tools with optional browser OAuth; the eight-tool and token-only descriptions below document the earlier stage. See `MCP_IMPLEMENTATION.md` for current capabilities. Real-device/screen-reader and final client testing remain outstanding.

## Website changes

- Keep the existing palette. Add contrasting form boundaries, textarea/region focus indicators, touch target sizing, wrapping text, reduced-motion overrides, and forced-color support.
- Measure the sticky informational notice and reserve scrolling space so focused controls and fragment destinations can appear below it. Remove sticky comparison and filter controls on small/short screens where they can obscure content.
- Put the Find areas title and property-list shortcut in the left sidebar. Align the map canvas with the top of that sidebar; overlay compact view, color, and basemap controls inside the map. Keep result counts below the map and preserve keyboard focus when switching views.
- Provide a direct map-to-text-results button; transfer focus into the newly visible results. Keep inactive map/list content hidden semantically as well as visually. The list uses the same state and filters.
- Announce selected tracts. Opening details from a result focuses its heading; closing restores focus to the invoking result where possible. Map clicks do not unexpectedly scroll away from the map.
- Give location search a persistent visible label and an associated live status region. Announce searching, ambiguity, failure, and successful tract identification. Preserve input focus during a lookup.
- Give separate desktop and mobile filter panels unique radio-group names.
- Keep native dialogs, Escape behavior, and Close controls. Retain keyboard-operable tabs and labeled comparison tables.
- Add `/accessibility`, linked from the floating notice and footer. Accessibility, legal information, and MCP setup instructions can be read before accepting entry terms. Research still requires acknowledgment.
- Keep the native cursor and use a diffuse decorative blue glow. Hide it for touch/coarse pointers, reduced motion, and forced colors.
- Entry now uses server-verified consent for website and MCP access; see `CONSENT_ENFORCEMENT.md`. The introductory entry control remains disabled until the checkbox is selected, and failure to record acceptance keeps research closed. The public MCP setup page provides an accessible, labeled acceptance form for a private bearer token.

## MCP access

Eight working hosted tools are advertised: `describe_research`, `lookup_geography`, `get_rules`, `compare_places`, `get_tract`, `list_tracts`, `compare_tract`, and `oz1_findings`.

- Geography lookup accepts state names and county-name fragments, avoiding dependence on a map or memorized FIPS identifiers. County output is capped at 25 with a refinement instruction.
- Measure definitions state units, dates, sources, missing-value conventions, and capability restrictions.
- Sourced rules expose the same saved statements and official quotations as the website. They do not apply rules to an individual's finances or claim to be a live legal update.
- Explicit comparisons preserve supplied tract order, cap public comparisons at two tracts and six measures, and represent missing tracts/values explicitly. They do not rank desirability, personal suitability, or investment merit.
- Lists, state comparisons, and historical report tables default to labeled linear text; callers may request a table. Historical conversion preserves published values and surrounding limitations.
- New tools also return structured values where useful. Text responses remain available; disclaimers and source information remain attached.
- Input schemas are bounded and strict; arbitrary instructions, measure names, and rule topics are rejected. No extra upstream API calls, model calls, personal profiles, or argument logging were added.
- Existing shared request limits and hosted restrictions remain. Live address/site tools that previously only returned unavailable errors are no longer advertised. Source functions remain available to existing website workflows.
- Website membership does not authenticate an external MCP client. Hosted MCP does not provide downloads or member-only numeric filtering.

MCP adds a text route to research. It does not make a client accessible, guarantee voice support, or establish website WCAG conformance. Users' chosen clients may have their own terms and costs. Hosted connections now require a separately accepted MCP bearer token; clients must support a private Authorization header directly or through a local bridge. OAuth-only connectors are not yet supported.

## Checks

- `tests/accessibility.test.ts`: axe-core checks of rendered entry, search, filters, accessibility information, and explorer controls; keyboard tests for research tabs; independent filter groups; map-to-list behavior; entry checkbox and disclaimer order.
- `tests/accessibility-contrast.test.ts`: core light/dark body, secondary text, links, and primary button contrast against their defined surfaces.
- `lib/tools/researchAccess.test.ts`: geography resolution, bounds, unsupported instructions, source links, missing data, explicit order, labeled output, and preserved historical table values.
- `scripts/test-client.ts`: connects to the actual running `/mcp` transport, discovers all eight tools, and calls each using public data.
- JSX accessibility lint, TypeScript, and the full regression suite.

The DOM audit uses jsdom. Visual contrast, reflow, focus appearance, map rendering, and native dialog behavior cannot be certified by that audit. Its color-contrast rule is deliberately disabled; token checks cover only known solid color pairs. This distinction must remain explicit in reports.

## Manual release gates still needed

1. NVDA/Firefox or Chrome, JAWS/Chrome, VoiceOver/Safari, and TalkBack/Chrome: complete entry, geographic search, filters, results, comparison, dialogs, account access, and exports.
2. Keyboard-only navigation: all routes, no traps, visible focus, focus return, and no obscured focused controls. Include filter dialog transitions, failed requests, and pagination.
3. Real browsers at 200% and 400% zoom; 320 CSS-pixel reflow; custom text spacing; portrait and landscape phones. Wide tables may use labeled horizontal scrolling.
4. Verify all actual rendered colors, hover/focus states, notices, badges, and map controls in light/dark and Windows forced colors. The map must never be the only way to obtain a fact.
5. Test reduced motion and pause/resume on real devices. Verify decorative animation is absent from the accessibility tree.
6. Test passkeys, recovery, allowance errors, and file downloads with assistive technology. Native OS/client prompts are not controlled by the site.
7. Confirm accessible exported-document alternatives. Browser-generated PDFs are not yet verified as tagged accessible PDFs.
8. Conduct usability sessions with disabled users and establish a private accessibility contact before public release. The current public GitHub issue route requires an account and is not a private channel.

Reference: https://www.w3.org/TR/WCAG22/ and https://www.w3.org/WAI/WCAG22/Understanding/ .
