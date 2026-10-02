# Tract indicators and the 2037 outlook

## Published experience

- Find areas → Eligibility changes supports “2018 overlap · not eligible for 2027” nationwide or within a selected geography. It requires known ineligibility and at least 50% population overlap, applies in addition to All/Any program criteria, and survives shared links, saved research, exports and MCP criteria. Missing status is excluded. The 2037 option is disabled with an explanation; API requests for it fail explicitly instead of returning unfiltered tracts or implying zero forecast matches.
- A historical-overlap tract that is not eligible for 2027 shows an explanation in the compact map popup.
- Detailed map reports and full tract pages show eligibility checks, historical changes, national cohort medians, county construction context, and model evidence without collapsed data sections.
- The existing authenticated/consent-controlled MCP `get_tract` tool returns the same analysis in structured content. Existing research-scope and rate limits still apply.
- 2037 selection probability is **null / insufficient evidence**, never zero, a state-cap percentage, or a historical model score. Eligibility is not government nomination/certification. Do not call an eligible tract “selected again” without a certified designation.
- A 2018-overlap tract that is ineligible for the 2027 round has not thereby had its existing designation revoked. Historical overlap is not exact legal designation of the current tract.

## Rebuild

Run `npm run research:indicators` after the standard data pipeline has produced `data/oz1/analysis.csv`, `pipeline/clean/xwalk_t10_t20.csv`, and the published tract payload/manifest. Python dependencies are pinned in `pipeline/research/requirements.txt`; numpy, pandas and scikit-learn are freely available open-source libraries. Their exact build versions, input SHA-256 digests and deterministic random seed are recorded in `data/research-indicators.json`. No model API, paid dependency, network request, or user data is used.

The existing source registry covers ACS, Census block crosswalk inputs and BLS CPI-U. No new external data source is introduced. County permits already use the registered Census BPS source. The runtime loads cached results; it never trains a model per user request. The artifact is outside `public/`. Single-tract responses expose only that tract's history and aggregate results, not the complete history table.

The runtime verifies artifact fingerprints against the deployed manifest and tract binary. A missing, malformed or stale artifact withholds ML results while preserving current published facts. Rebuild and restart the application after a data release; runtime caches are process-scoped like the tract data cache.

## Actual model experiment

Targets are population, housing-unit and inflation-adjusted median-household-income log changes from 2012–2016 ACS to 2020–2024 ACS. Eight allowlisted earlier characteristics include housing vacancy, ownership, median year built, population density, and earlier population/vacancy/income/rent changes. Family-income/poverty eligibility tests and future designation outcomes are not model targets or future inputs. No protected-class composition or personal information is used.

The analysis includes only mutually overlapping tracts with >=99% population AND housing correspondence and baseline population >=100 and housing units >=50. Missing features are imputed within each training fold for ridge regression; histogram gradient boosting handles missing features directly. Missing outcomes are excluded. No missing values become zero. No user-facing prediction is produced for an excluded tract.

Five state-held-out folds compare regularized linear regression and gradient boosting with no-change and training-median baselines. Feature importance is measured by permutation on up to 1,200 held-out rows per fold with three repeats. Hyperparameters and seed are fixed. The artifact stores fold membership, model errors and all importance results. Model selection uses the same folds as reported evaluation, so this is explicitly exploratory rather than a final independent performance claim.

The held-out states test geographic transfer within ONE outcome interval. They do not establish temporal transfer, causation, an OZ program effect, or a decadal selection probability. The crosswalk uses 2020 weights and existing revised sources, so this is not an as-published historical forecast. Correlated features, shared ACS endpoints, survey error, national shocks, and dependence across state borders limit interpretation. The UI labels timing **insufficient evidence** even when retrospective predictive error improves.

Group medians are a separate descriptive calculation across current 2020 tracts with >=50% 2018 population overlap, split by known 2027 eligibility. The group denominator differs from the stable-boundary model sample; both are explicitly labeled. Each metric displays its nonmissing sample size. County permit data remain county context and are excluded from temporal models because the available snapshot does not establish a time series.

## Gates before future timing or selection forecasts

1. Assemble repeated nonoverlapping outcome periods with comparable geography and actual release dates. Adjacent five-year ACS releases are not independent annual observations.
2. Test multiple earlier-to-later windows and held-out geographic areas, accounting for survey uncertainty, multiple testing and spatial dependence. Reserve independent final evaluation data after model selection.
3. Establish outcome-specific timing and publish stability/uncertainty. The shared timing gate requires positive held-out skill, at least three independent periods, release-vintage validation and comparable geography; this is a minimum gate, not sufficient scientific evidence on its own.
4. Train eligibility evolution separately from government selection. A selection model needs verified nomination and certification outcomes, eligible candidate sets, comparable rounds, out-of-time validation and calibration. Past selection under different rules cannot directly supply a 2037 probability.
5. Account for future rules, denominators and boundaries. A current-rule scenario must be labeled as a scenario and cannot be represented as probability of selection.

Official designation framework: https://www.irs.gov/pub/irs-drop/rp-26-14.pdf

Informational only, not investment, tax or legal advice.
