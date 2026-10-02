# Opportunity Zone data access scope

Owner instruction, September 28, 2026: map popups and individual tract data are restricted to eligible or designated Opportunity Zone tracts.

## Rule

A published 2020 tract qualifies if any of these are true:

- Treasury 2027 eligibility equals 1.
- Certified 2027 designation equals 1.
- The existing map's historical 2018-zone classification applies: at least 50% population overlap with 2018 zones.

The historical rule is a crosswalk classification, not a claim that a 2020 tract or every address in it was legally designated in 2018. This threshold is unchanged from the map. Unknown values, rural classification alone, HUD QCT/DDA, or NMTC status alone do not grant access.

## Enforcement

- Map selection checks published status flags before opening a popup. Unknown/not-yet-loaded status fails closed. Background tract outlines and status coloring remain visible.
- Direct tract JSON, detailed report pages, member list values and evidence, export previews/files, and individual MCP tract tools enforce the same scope server-side. Explicit exports containing an excluded tract are rejected rather than silently altered. Old export retry fingerprints are invalidated.
- Batch matching distinguishes absent identifiers from existing but excluded tracts. Address lookup can identify a place, but no tract profile is returned outside this scope.
- Live site context requires a qualifying tract. An exact point must be verified inside that tract's published polygon before any provider call. Missing/simplified boundaries may prevent verification; users can request the canonical tract context instead.
- Historical boundary responses include only relationships to qualifying current tracts.
- Geographic coverage, general rules, source definitions, historical published summaries, and aggregate benchmark context remain available. Within-state neighboring-area percentile benchmarks retain their original statewide population; restricting downloadable rows does not change their definitions.
- These controls govern this service's new responses. They do not recall previously downloaded files or cached local projects, or restrict access to underlying public sources/repository data under their licenses.

## Comparison navigation

The compact tract popup retains Add to comparison and Detailed report. Once at least one tract is selected, View Comparison List and Clear comparison list appear together in both popup views and beneath the map. Clearing updates the shared device-session list and comparison tray. Existing limits remain 25 tracts with a free account and two for public previews. The map's List view remains available through its view controls for map-free research.

## Checks

Tests cover status combinations, missing status, direct profile denial, mixed-selection export rejection, MCP denial, list/evidence exclusions, boundary/baseline denial, exact-point mismatch, and shared comparison navigation/clearing. No research queries or searched GEOIDs are logged.
