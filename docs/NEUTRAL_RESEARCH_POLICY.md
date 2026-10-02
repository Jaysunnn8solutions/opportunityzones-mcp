# Neutral place research: product plan

Status: neutral filter directions, descriptive comparisons, public-data export context, and access boundaries implemented locally September 27, 2026. See [ACCESS_IMPLEMENTATION.md](ACCESS_IMPLEMENTATION.md). These product safeguards do not establish legal compliance.

## Objective

Help users inspect published place data, understand statutory criteria, compare areas, and export properly licensed facts for their own research. The product should not decide who belongs in a neighborhood, recommend a housing or investment transaction, or facilitate discriminatory housing targeting.

## Legal context checked

Federal housing steering rules address restricting housing choices because of protected characteristics, including characteristics of neighborhood residents. They cover conduct as well as statements. See [24 CFR 100.70, official 2025 codification](https://www.govinfo.gov/content/pkg/CFR-2025-title24-vol1/pdf/CFR-2025-title24-vol1-sec100-70.pdf).

HUD's April 24, 2026 guidance says factual school and crime information can be shared consistently without discriminatory intent; factual neighborhood information is not categorically prohibited. See [HUD's announcement](https://www.hud.gov/news/hud-no-26-028) and [the signed letter](https://www.hud.gov/sites/default/files/hudclips/documents/AS-Trainor%27s-DCL-on-Neighborhood-Crime-Data-and-School-Quality.pdf).

These sources do not establish a safe harbor for this application, resolve every fair-housing theory, or cover every state/local rule. User-selected filters and informational disclaimers do not excuse discriminatory functionality. A qualified attorney should review the actual discovery, comparison, export, and MCP workflows before public release. Review investment/solicitation boundaries separately if the business later adds referrals, compensation, listings, or transactions.

## Original findings before implementation

- Find Areas begins with no selected filters; the workspace uses a tract identifier as its default sort. Preserve these neutral defaults.
- Comparisons describe selected areas and numerical differences without selecting a winner. Preserve this behavior.
- The neighboring-area filter model in `lib/explore/measures.ts` uses `higherIsStronger`. Higher neighboring income, home values, education attainment, and newer housing are the preferred directions; unemployment uses the lower direction. These are optional filters, but the available direction is built into the product.
- `lib/explore/filter.ts` offers only `top50`, `top25`, and `top10` tiers. Changing labels alone would leave the directional behavior intact.
- `app/ui/FindAreas.tsx` exposes the built-in direction as “Higher values first” or “Lower values first.” `lib/explore/evidence.ts` explains the thresholds. Preserve the explanations while making direction user-selected.
- The inspected research/filter modules contain no direct protected-class discovery controls. This is a scoped review, not a complete audit of all routes, future data, external clients, or downstream uses.

The neighboring-area design is a neutrality concern to fix, not a finding that the current application commits unlawful steering.

## Product requirements

### 1. Explicit criteria and neutral defaults

Replace fixed-direction neighboring-area tiers with optional minimum/maximum ranges or symmetric percentile bands. Users choose direction; the application does not describe higher income or education as inherently stronger or more desirable. No preselected socioeconomic preference or composite neighborhood desirability score.

Show active filters, explicit sort order, comparison geography, and why each tract matches. Distinguish statutory designation from a calculated screen. Do not equate program eligibility with suitability for a person or transaction.

Keep income, poverty, housing, employment, rural status, and other legitimate place measures where relevant. Income and poverty measures used in statutory definitions must remain accurately represented. Sensitivity is a reason to examine purpose and presentation, not to erase necessary facts.

### 2. Consistent service

The same explicit query, data version, and access level should return the same results and ordering regardless of account identity or inferred personal characteristics. Account records should support authentication and quotas, not neighborhood recommendations.

Do not infer protected characteristics from names, searched addresses, identity providers, browsing behavior, or other signals. Do not silently personalize geographic coverage. Public/member capabilities may differ under the access plan, but shared facts must agree and capability rules must be applied consistently.

### 3. Boundaries for housing targeting

Do not build controls that match people to neighborhoods by race, ethnicity, religion, national origin, disability, familial status, or other legally protected characteristics. Do not offer demographic exclusion lists, resident compatibility scores, tenant/applicant ratings, or housing advertising audiences.

Aggregate demographic research can have legitimate purposes. Any future sensitive demographic dataset requires a documented purpose and a review of its UI, API, export, and likely uses before release; do not automatically add it to discovery filters. Do not disguise protected-class targeting behind proxy variables. Neutral controls alone do not justify knowingly facilitating a discriminatory workflow.

Objective accessibility information is distinct from excluding people with disabilities. Review such features for inclusive access rather than imposing a blanket ban on useful accessibility facts.

### 4. Descriptive comparisons and language

Use specific labels such as “Median gross rent,” “Population change,” and “Matches your selected filters.” Avoid “best neighborhoods,” “ideal residents,” “perfect for families,” “people like you,” or “recommended investment.” These are product boundaries, not a claim that every phrase is independently unlawful in every context.

Tables should show each selected area on the same basis, without a winner badge. Chart colors should encode a named quantity or program status; they should not suggest that residents have greater or lesser worth. Show data vintage, geography, uncertainty, and missingness. A missing measure is unknown, not a negative neighborhood assessment.

Future crime or school data would require license, methodology, coverage, and presentation review. Do not combine them into an unexplained safety or desirability score. The current plan does not add those datasets.

### 5. Useful exports with context

Continue supporting users' own lawful analysis. Exports should include source attribution, vintage, geography, definitions, nulls, and program-status distinctions. Add a manifest of the user's selected filters, sort, and dataset version to the delivered file/package. This does not require a retained server-side research history.

Do not export a product-generated investment recommendation, resident compatibility score, or discriminatory targeting audience. Terms should prohibit unlawful discriminatory housing uses while preserving lawful research and source-license rights. Terms cannot fix discriminatory product behavior or guarantee downstream compliance.

Apply field allowlists and the same discovery boundaries to browser routes, direct API calls, and MCP tools. The external model a user connects to MCP may generate its own interpretations; tool descriptions and factual responses can reduce confusion but cannot guarantee that model's behavior.

### 6. Maintain the informational business model

Keep actions focused on researching, comparing, inspecting sources, and exporting. The plan excludes transaction prompts, selected fund/deal promotions, paid geographic placement, and referral commissions. Reassess the legal/business model before introducing those features.

Proposed concise results notice:

> Results reflect your selected criteria and published area-level data. They do not assess suitability for any person or recommend buying, renting, or investing. Informational only; not investment, tax, or legal advice.

Keep the full terms and existing official-source/nonaffiliation notices accessible. Avoid presenting acceptance of a disclaimer as a waiver of all legal duties.

## Delivery order

1. Replace fixed neighboring-area preferences and update their URL parsing, evidence, and tests together. Do not silently reinterpret old shared filters; preserve their explicit meaning through migration or explain that a saved filter needs review.
2. Review labels, map legends, comparisons, narratives, and calls to action against these requirements.
3. Apply the same boundaries to the planned account/export capabilities, direct APIs, and MCP responses.
4. Review representative workflows with counsel, including state/local scope and any housing-related downstream use cases.

## Acceptance checks

- Neutral defaults remain neutral on first load, reset, and shared links.
- Users can choose either numeric direction; no hidden preference remains in matching or sorting.
- Equivalent criteria and data return equivalent facts/order across accounts; quotas do not change factual content.
- The UI explains missing-data exclusions and preserves unknowns in comparisons and exports.
- No protected-class housing matching or exclusion control can be activated through URL parameters, direct APIs, export columns, or MCP arguments.
- Comparison summaries report differences without choosing a winner or predicting suitability.
- Export manifests reproduce applied criteria and distinguish measured facts from statutory calculations.
- Tests check behavior as well as forbidden phrases; a disclaimer or wording test alone is insufficient.

Revisit this review when adding a dataset, recommendation feature, ad system, referral arrangement, or new business model. Keep a product change record without logging individual users' addresses or research histories.
