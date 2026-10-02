import Link from "next/link";
import { notFound } from "next/navigation";
import { SOURCES, type SourceId } from "@/pipeline/sources";
import { getTract, loadTractData, type Measure } from "@/lib/data/tracts";
import { statePositions } from "@/lib/data/compare";
import { dateLabel, DISCLAIMER, overlapLabel } from "@/lib/client/presentation";
import Badges from "../../ui/Badges";
import SiteSnapshot from "../../ui/SiteSnapshot";
import ReportContext from "../../ui/ReportContext";
import ReportSections from "../../ui/ReportSections";
import { Cite } from "../../ui/Cite";
import { researchSources } from "@/lib/data/researchSources";
import PlaceNarrative from "../../ui/PlaceNarrative";
import DataFreshness from "../../ui/DataFreshness";
import { canResearchTract } from "@/lib/data/researchScope";
import { RESEARCH_SCOPE_NOTICE } from "@/lib/oz/researchScope";
import { tractIndicators } from "@/lib/data/indicators";
import TractIndicators from "../../ui/TractIndicators";

const KEY_TILES: Array<[string, string]> = [["population", "Population"], ["median_household_income", "Median household income"], ["median_home_value", "Median home value"], ["median_gross_rent", "Median gross rent"], ["poverty_rate", "Poverty rate"], ["unemployment_rate", "Unemployment rate"], ["jobs_2023", "Jobs located here"], ["share_built_before_1980", "Housing built before 1980"]];
const GROUPS: Array<[string, string[]]> = [
  ["2027 eligibility inputs", ["poverty_rate", "median_family_income", "area_median_family_income", "mfi_ratio"]],
  ["People and housing (2020–2024 ACS)", ["population", "housing_units", "median_household_income", "median_home_value", "median_gross_rent", "vacancy_rate", "owner_occupied_share", "bachelors_or_higher_share", "unemployment_rate"]],
  ["Housing stock", ["built_2020_or_later", "built_2020_or_later_moe", "share_built_2010_or_later", "share_built_before_1980"]],
  ["Jobs and credit", ["jobs_2023", "jobs_2017", "mortgage_applications", "mortgage_originations", "home_purchase_originations", "mortgage_denial_rate", "originated_dollars"]],
  ["Site context", ["npl_sites", "brownfield_sites", "colleges", "hospitals", "safmr_2br_land_weighted", "safmr_land_covered", "miles_to_interstate"]],
];
function formatValue(m?: Measure): string {
  if (m?.value == null) return "Not available";
  const value = m.value;
  if (m.unit === "share") return `${(value * 100).toFixed(1)}%`;
  if (m.unit === "USD") return `$${Math.round(value).toLocaleString("en-US")}`;
  if (m.unit === "count") return Math.round(value).toLocaleString("en-US");
  if (m.unit === "miles") return `${value.toFixed(2)} mi`;
  if (m.unit === "ratio") return value.toFixed(3);
  return String(value);
}
export default async function TractPage({ params }: { params: Promise<{ geoid: string }> }) {
  const { geoid } = await params;
  const t = getTract(geoid);
  if (!t) notFound();
  if (!canResearchTract(geoid)) return <main className="page prose"><h1>Tract outside research scope</h1><p>{RESEARCH_SCOPE_NOTICE}</p><Link href="/map">Return to the map</Link><p className="note">{DISCLAIMER}</p></main>;
  const { manifest } = loadTractData();
  const m = t.measures;
  const positions = statePositions(t.geoid, KEY_TILES.map(([name]) => name));
  const sourceIds = new Set(GROUPS.flatMap(([, names]) => names.map((name) => m[name]?.source)).filter(Boolean));
  for (const id of ["oz2Eligible", "oz2Designated", "urbanAreas2020", "oz1Designated", "hudQct", "hudDda", "nmtcLic", "censusBps"]) sourceIds.add(id);
  const pending = t.designation2027.status === "pending";
  const overview = <section><h2>People, housing, and work</h2><p className="section-intro">Published facts about this census tract. Open a comparison for the state context behind a number.</p><div className="tiles">{KEY_TILES.map(([name, label]) => {
    const measure = m[name]; const position = positions[name]; const source = SOURCES[measure?.source as SourceId];
    return <div className="tile" key={name}><span className="tile-label">{label}</span><strong>{formatValue(measure)}</strong><span className="tile-detail">{name === "jobs_2023" ? "2023 LODES" : "2020–2024 ACS"} · census tract</span><details className="metric-source"><summary>Source & comparison</summary>{source && <p><a href={source.homepage} target="_blank" rel="noopener noreferrer">{source.publisher}</a></p>}<p>{position.percentile == null ? "A state comparison is not available for this measure." : `Percentile position: ${Math.round(position.percentile * 100)} of 100 among ${position.peers.toLocaleString("en-US")} eligible tracts with data in ${t.state} (ties share a position).`}</p></details></div>;
  })}</div><p className="note">Missing figures are unavailable, not zero. Median home value is an estimate for the tract, not a valuation of a particular property.</p></section>;
  const sources = <>
    <section><h2>All published measures</h2>{GROUPS.map(([title, names]) => <details className="measure-group" key={title}><summary>{title}</summary><div className="table-wrap"><table className="rules"><thead><tr><th scope="col">Measure</th><th scope="col">Value</th><th scope="col">Source and scope</th></tr></thead><tbody>{names.map((name) => { const measure = m[name]; if (!measure) return null; const source = SOURCES[measure.source as SourceId]; return <tr key={name}><th scope="row">{measure.description}</th><td className="value">{formatValue(measure)}</td><td>{source && <><a href={source.homepage} target="_blank" rel="noopener noreferrer">{source.publisher}</a><small>{source.vintage} · {source.geography}</small></>}</td></tr>; })}</tbody></table></div></details>)}</section>
    <section><h2>County building permits</h2><p className="hint">County-level data; this does not describe only the selected tract.</p><p>{t.countyPermits ? `${t.countyPermits.year}: ${t.countyPermits.units.toLocaleString("en-US")} housing units permitted in ${t.county}, including ${t.countyPermits.units5plus.toLocaleString("en-US")} in buildings with 5+ units.` : "Not available for this county."}</p></section>
    <section><h2>Sources and dates</h2><p>Dataset built {dateLabel(manifest.generated)}. Source periods differ; a build date does not make every measure current.</p><ul className="source-list">{[...sourceIds].map((id) => { const source = SOURCES[id as SourceId]; return source ? <li key={id}><a href={source.homepage} target="_blank" rel="noopener noreferrer">{source.name}</a><p>{source.attribution}</p><small>{source.vintage} · {source.geography}</small></li> : null; })}</ul></section>
  </>;
  return <main className="page report">
    <header className="report-head"><p className="eyebrow">Place report · Census tract {geoid}</p><h1>{t.county}, {t.state}</h1>{t.cbsa && <p className="hint">{t.cbsa}</p>}<Badges designation={t.designation2027.status} rural={t.rural.treasury} zone2018Share={m.oz2018_population_share?.value ?? null} /></header>
    <ReportContext profile={{ ...t, publishedAt: manifest.generated }} /><nav className="answer-actions no-print" aria-label="Research this tract"><Link className="button secondary" href={`/workbench#tab=data&geoid=${geoid}`}>Baselines, sources & uncertainty</Link><Link className="button secondary" href={`/workbench#tab=history&geoid=${geoid}`}>Boundary & release history</Link><Link className="button secondary" href={`/workbench#tab=corrections&geoid=${geoid}`}>Flag a data discrepancy</Link></nav>
    <section className={`status-summary ${pending ? "status-pending" : ""}`} aria-labelledby="status-title"><p className="eyebrow">2027 designation</p><h2 id="status-title">{pending ? "Eligible for consideration. Designation pending." : t.designation2027.status === "designated" ? "A designated 2027 zone." : t.designation2027.status === "not-designated" ? "Eligible, but not designated." : t.designation2027.status === "not-eligible" ? "Not on the 2027 eligible list." : "Status is not available."}</h2><p>{pending ? "A certified designation for this tract is not recorded in the published dataset. Eligibility alone does not establish designation." : t.designation2027.text}</p><p className="hint">Dataset built {dateLabel(manifest.generated)} · Treasury eligibility file: {SOURCES.oz2Eligible.vintage}</p><details><summary>What this status means</summary><p>{t.designation2027.text}</p><p>Eligibility and designation are separate stages. <Cite rules={["designatedNotEligible"]} /></p></details></section>
    <div className="report-classifications"><div><h2>Rural classification</h2><p>{t.rural.treasury == null ? "Unknown in this dataset." : t.rural.explanation}</p><details><summary>Rules behind this classification</summary><Cite rules={["ruralImprovement", "ruralFund"]} /></details></div><div><h2>Historical overlap</h2><p>{overlapLabel(m.oz2018_population_share?.value)}</p><p className="hint">Population overlap between tract vintages. This does not establish an exact address&apos;s historical zone status.</p></div></div>
    <PlaceNarrative profile={{ ...t, publishedAt: manifest.generated, sources: researchSources() }} />
    <TractIndicators analysis={tractIndicators(t)} />
    <DataFreshness version={manifest.generated} sources={[...sourceIds].flatMap((id) => { const s = SOURCES[id as SourceId]; return s ? [{ name: s.name, vintage: s.vintage, url: s.homepage }] : []; })} />
    <ReportSections overview={overview} context={<section><h2>Site context</h2><SiteSnapshot geoid={geoid} /></section>} sources={sources} />
    <p className="note">{DISCLAIMER} This report describes a place; it does not recommend it.</p>
  </main>;
}
