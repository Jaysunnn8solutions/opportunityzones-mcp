import type { TractAnalysis } from "@/lib/analysis/indicators";

const census = "https://www.census.gov/data/developers/data-sets/acs-5year.html";
const treasury = "https://home.treasury.gov/policy-issues/tax-policy/data-transparency/qualified-opportunity-zones";
function value(n: number | null, unit: string) {
  if (n == null) return "Unavailable";
  return unit === "share" ? `${(n * 100).toFixed(1)}%` : unit === "USD" ? `$${Math.round(n).toLocaleString("en-US")}` : Math.round(n).toLocaleString("en-US");
}
function change(n: number | null) {
  return n == null ? "Unavailable" : `${n > 0 ? "+" : ""}${(n * 100).toFixed(1)}%`;
}
const HISTORY: Record<string, string> = {
  out_dlog_pop: "Population change",
  out_dlog_housing_units: "Housing-unit change",
  out_dlog_hh_income: "Real household-income change",
};

export default function TractIndicators({ analysis, compact = false }: { analysis: TractAnalysis; compact?: boolean }) {
  const a = analysis;
  if (compact) {
    if (a.historicalGroup !== "ineligible") return null;
    return <section className="tract-indicator-summary" aria-label="Historical zone analysis">
      <h3>2018 overlap · not eligible for 2027</h3>
      <p>{a.eligibility.reason}</p>
      <p className="hint">This is an eligibility comparison, not a finding that a prior designation has been revoked.</p>
      <p className="hint">Compare this tract with {a.cohort.ineligibleCount.toLocaleString("en-US")} historical-overlap tracts that are not eligible and {a.cohort.eligibleCount.toLocaleString("en-US")} that are eligible. Open Detailed report for the data and model evidence.</p>
    </section>;
  }
  return <section className="tract-indicators" aria-label="Historical patterns and 2037 outlook">
    <header><p className="eyebrow">Facts · Context · Discovery</p><h2>Historical patterns &amp; 2037 outlook</h2><p>Observed place characteristics, eligibility checks, and experimental statistical analysis. No investment ranking or recommended action.</p></header>
    <section className="indicator-outlook" aria-label="2037 selection outlook">
      <h3>2037 selection outlook</h3><p><strong>Likelihood: insufficient evidence to estimate.</strong></p>
      <p>{a.outlook.reason}</p>
      <p className="hint">2037 is the next ten-year cycle after 2027 under the current framework. Eligibility and government selection are separate stages; being eligible today does not establish selection in either cycle. <a href="https://www.irs.gov/pub/irs-drop/rp-26-14.pdf" target="_blank" rel="noreferrer">IRS designation procedures ↗</a></p>
    </section>
    <section aria-label="Eligibility evidence">
      <h3>{a.historicalGroup === "ineligible" ? "Why this historical-overlap tract is not eligible for 2027" : "Current eligibility evidence"}</h3>
      <p>{a.eligibility.reason}</p>
      <ul className="indicator-checks">{a.eligibility.checks.map((check) => <li key={check.label}><strong>{check.label} · {check.met == null ? "Cannot verify" : check.met ? "Meets threshold" : "Does not meet threshold"}</strong><span>{check.detail}</span></li>)}</ul>
      <p className="hint">Median family income determines this check; median household income below is a different measure. <a href={treasury} target="_blank" rel="noreferrer">Treasury’s official eligibility data ↗</a></p>
      {a.historicalGroup !== "outside-cohort" && <p className="hint">Historical overlap means at least 50% of this 2020 tract’s population overlaps 2018 zones. It is not an exact match of tract boundaries or a finding that an existing designation was revoked.</p>}
    </section>
    <section aria-label="Observed tract changes">
      <h3>What changed in this area?</h3>
      {a.history ? <><p className="hint">2012–2016 ACS compared with 2020–2024 ACS. Historical tract {a.history.geoid2010}; at least 99% population and housing overlap in both directions. These are changes between five-year estimates, not annual observations.</p>
        <dl className="indicator-trends">{Object.entries(HISTORY).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{change(a.history?.changes[key] ?? null)}</dd></div>)}</dl>
        <p className="hint">Income change uses national CPI-U inflation adjustment. Survey uncertainty can be substantial; the displayed changes are not significance tests.</p></>
        : <p>Comparable history is unavailable for this tract. Boundary changes, missing estimates, or a small historical baseline can prevent a reliable comparison.</p>}
      <p className="hint"><a href={census} target="_blank" rel="noreferrer">Census ACS ↗</a> · <a href="https://www.bls.gov/cpi/" target="_blank" rel="noreferrer">BLS CPI-U ↗</a></p>
    </section>
    <section aria-label="Historical cohort comparison">
      <h3>How do the historical-zone groups differ?</h3>
      <p>National comparison of current tracts with at least 50% population overlap with 2018 zones: <strong>{a.cohort.ineligibleCount.toLocaleString("en-US")}</strong> not eligible for 2027 and <strong>{a.cohort.eligibleCount.toLocaleString("en-US")}</strong> eligible for 2027.</p>
      {a.historicalGroup === "outside-cohort" && <p className="hint">This tract is outside that historical cohort. Its values are shown for context only.</p>}
      <div className="table-wrap" role="region" aria-label="Historical cohort data; scroll horizontally on small screens" tabIndex={0}><table className="rules"><caption>Group medians; n is the number of tracts with a published value.</caption><thead><tr><th scope="col">Measure</th><th scope="col">This tract</th><th scope="col">Not eligible for 2027</th><th scope="col">Eligible for 2027</th></tr></thead><tbody>{a.cohort.metrics.map((m) => <tr key={m.key}><th scope="row">{m.label}<small>{m.period}</small></th><td>{value(m.value, m.unit)}</td><td>{value(m.ineligibleMedian, m.unit)}<small>n = {m.ineligibleN.toLocaleString("en-US")}</small></td><td>{value(m.eligibleMedian, m.unit)}<small>n = {m.eligibleN.toLocaleString("en-US")}</small></td></tr>)}</tbody></table></div>
      <p className="hint">Descriptive differences are not causes of eligibility changes. National medians do not adjust for state, urban/rural mix, or other confounders. Missing values are excluded, never counted as zero. <a href={census} target="_blank" rel="noreferrer">Census ACS source ↗</a></p>
    </section>
    <section aria-label="Housing and construction activity">
      <h3>Housing and construction activity</h3>
      {a.construction ? <><p><strong>{a.construction.units.toLocaleString("en-US")} housing units authorized in {a.construction.year}</strong> across this tract’s county, including {a.construction.units5plus.toLocaleString("en-US")} units in buildings with five or more units.</p><p>Change from prior year: <strong>{change(a.construction.change)}</strong>.</p></> : <p>County permit data are unavailable.</p>}
      <p className="hint">County context, not construction within this tract. Permits are authorizations, not actual starts or completions. The available permit snapshot is not used to assign leading or lagging labels. <a href="https://www.census.gov/construction/bps/" target="_blank" rel="noreferrer">Census Building Permits Survey ↗</a></p>
    </section>
    <section aria-label="Experimental indicator models">
      <h3>What tended to precede later changes?</h3>
      <p><strong>Timing labels: insufficient evidence.</strong> The models test earlier characteristics against later population, housing, and real-income changes. Available observations do not establish a repeatable lead time or distinguish concurrent from lagging relationships.</p>
      {a.modelStatus !== "available" ? <p role="status">{a.modelStatus === "stale" ? "Model results were built for an older data release and are withheld until rebuilt." : "Historical model results are unavailable for this release."}</p> : a.models.map((model) => <article className="indicator-model" key={model.outcome}>
        <h4>{model.outcome}</h4>
        {model.status !== "exploratory" ? <p>Not enough comparable observations to fit and evaluate this model.</p> : <>
          <p>{model.selectedModel === "boosting" ? "Gradient boosting" : "Regularized linear regression"} had the lower error among the two candidate models across five state-held-out folds. Sample: {model.rows.toLocaleString("en-US")} tract histories in {model.states} states/territories.</p>
          <p>{model.skill == null ? "Baseline comparison unavailable." : model.skill > 0 ? `Average error was ${(model.skill * 100).toFixed(1)}% lower than the better simple baseline (no change or the training median).` : `The model did not improve on the better simple baseline; error was ${(Math.abs(model.skill) * 100).toFixed(1)}% higher.`} This evaluates historical changes, not 2037 selection.</p>
          <p className="hint">Predictors with the largest measured importance in held-out states:</p>
          <ul>{model.indicators.slice(0, 3).map((indicator) => <li key={indicator.key}>{indicator.label}<small>Removing its information by permutation increased error in {indicator.positiveFolds} of 5 folds. Timing: insufficient evidence.</small></li>)}</ul>
          <p className="hint">Importance is a model-wide association, not a tract-specific explanation or a causal effect. Correlated measures can share or obscure importance.</p>
        </>}
      </article>)}
      <h4>How to read these results</h4><ul className="hint">{a.limitations.map((limit) => <li key={limit}>{limit}</li>)}</ul>
    </section>
    <p className="note">Dataset: {a.datasetVersion}. Informational only, not investment, tax or legal advice.</p>
  </section>;
}
