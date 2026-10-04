"use client";
import { comparisonIds, comparisonLimit } from "@/lib/research/comparisonLimits";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { isPlaceResult, lookupPlace, type PlaceResult } from "@/lib/client/place";
import { dateLabel, DISCLAIMER, displayValue } from "@/lib/client/presentation";
import { filterDescription, filtersActive, NO_FILTERS, type Filters } from "@/lib/explore/filter";
import { FOCUSES, placeNarrative, selectedMeasures, sourceFor, type Focus, type MeasureKey } from "@/lib/research/measures";
import { STATE_FIPS } from "@/lib/geo/states";
import { useResearchState } from "./ResearchSession";
import { PlaceReportLink } from "./ResearchActions";
import { BriefLink, ResearchControls } from "./ResearchControls";
import ResearchEvidence from "./ResearchEvidence";
import ExportResearch from "./ExportResearch";
import { useAccount } from "./AccountAccess";
import Badges from "./Badges";
import ComparisonRows from "./ComparisonRows";
import ComparisonOverview from "./ComparisonOverview";
import { readPreferences } from "./DevicePreferences";

export default function Comparison({ brief = false }: { brief?: boolean }) {
  const [ready, setReady] = useState(false);
  useEffect(() => { const frame = requestAnimationFrame(() => setReady(true)); return () => cancelAnimationFrame(frame); }, []);
  return ready ? <ResearchWorkspace brief={brief} /> : <p role="status">Opening your research…</p>;
}
function ResearchWorkspace({ brief }: { brief: boolean }) {
  const { account, open: openAccount } = useAccount();
  const maximum = comparisonLimit(account.member);
  const [initial] = useState(() => new URLSearchParams(window.location.hash.slice(1)));
  const [initialSelection] = useState(() => {
    try { return { ids: comparisonIds(initial.get("tracts") ?? ""), error: "" }; }
    catch (error) { return { ids: [] as string[], error: error instanceof Error ? error.message : "Invalid comparison selection." }; }
  });
  const [selected, setSelected] = useResearchState<string[]>(brief ? "brief-tracts" : "comparison", initialSelection.ids);
  const [focus] = useResearchState<Focus>("research-focus", "overview");
  const [keys, setKeys] = useResearchState<MeasureKey[]>("comparison-measures", () => readPreferences().columns);
  const [filters] = useResearchState<Filters>("explore-filters", NO_FILTERS);
  const [scope] = useResearchState("explore-state", "");
  const [places, setPlaces] = useState<Record<string, PlaceResult | null>>({});
  const [retry, setRetry] = useState(0);
  const permitted = selected.slice(0, maximum);
  const requestKey = `${permitted.join(",")}:${retry}`;
  const [loadedKey, setLoadedKey] = useState("");
  const loading = requestKey !== loadedKey;
  const message = initialSelection.error;
  const [rowsView, setRowsView] = useState(() => readPreferences().orientation === "rows" || (brief && selected.length > 4));
  const measures = selectedMeasures(keys);
  const profiles = selected.flatMap((id) => places[id] ? [places[id]!.profile] : []);
  const scopeLabel = profiles.find((p) => p.geoid.startsWith(scope))?.state ?? Object.entries(STATE_FIPS).find(([, fips]) => fips === scope)?.[0] ?? "Selected state";
  const complete = !loading && profiles.length === selected.length;
  const criteria = filtersActive(filters) ? filterDescription(filters) : "No screening criteria selected";
  const criteriaKey = JSON.stringify({ scope, filters });
  const [evidenceState, setEvidenceState] = useState<Record<string, string>>({});
  const evidenceResolved = useCallback((geoid: string, resolved: boolean) => {
    const value = `${criteriaKey}:${resolved}`;
    setEvidenceState((current) => current[geoid] === value ? current : { ...current, [geoid]: value });
  }, [criteriaKey]);
  const evidenceComplete = !filtersActive(filters) || selected.every((id) => evidenceState[id] === `${criteriaKey}:true`);
  useEffect(() => {
    window.history.replaceState(window.history.state, "", selected.length ? `#${new URLSearchParams({ tracts: selected.join(","), measures: keys.join(",") })}` : window.location.pathname);
  }, [selected, keys]);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all(selected.slice(0, maximum).map(async (id) => { const result = await lookupPlace(id, undefined, controller.signal); return [id, isPlaceResult(result) ? result : null] as const; }))
      .then((results) => { if (!controller.signal.aborted) { setPlaces(Object.fromEntries(results)); setLoadedKey(requestKey); } });
    return () => controller.abort();
  }, [selected, requestKey, maximum]);
  useEffect(() => {
    const params = initial;
    if (initialSelection.ids.length) setSelected(initialSelection.ids);
    const measures = (params.get("measures") ?? "").split(",").filter((key) => selectedMeasures([key]).length);
    if (measures.length) setKeys([...new Set(measures)] as MeasureKey[]);
  }, [initial, initialSelection, setKeys, setSelected]);
  return <>
    <nav className="answer-actions no-print" aria-label="Comparison navigation"><Link href="/map">← Add tracts from the map</Link><Link href="/workbench#tab=projects">Saved projects & file imports →</Link></nav>
    {selected.length > maximum && <p role="status">Your saved selection has {selected.length} places. Public comparisons show two; <button className="link" onClick={openAccount}>sign in free</button> to compare up to 25, or remove extra places.</p>}
    {message && <p role="status">{message}</p>}
    {!selected.length ? <div className="empty-state"><h2>Your comparison is empty</h2><p>Select tracts on the map and choose Add to comparison. Your selected data will appear here side by side.</p><Link className="button" href="/map">Find areas →</Link></div> : <>
      <section className="comparison-selection no-print" aria-label="Selected tracts"><div className="comparison-selection-heading"><h2>{selected.length} / {maximum} selected tracts</h2><button type="button" className="link" onClick={() => setSelected([])}>Clear comparison list</button></div><div className="selection-chips">{selected.map((id) => <button type="button" key={id} className="button secondary" onClick={() => setSelected((current) => current.filter((item) => item !== id))} aria-label={`Remove selected tract ${id}`}>{id} ×</button>)}</div></section>
      <div className="answer-actions no-print"><ExportResearch input={{ geoids: selected, columns: keys, filters, state: scope || undefined }} label="Export comparison · CSV / JSON" disabled={!complete} />{brief ? <ExportResearch input={{ geoids: selected, columns: keys, filters }} print disabled={!complete || !evidenceComplete} label="Print brief or save PDF" /> : <BriefLink geoids={selected}>Printable report / PDF</BriefLink>}</div>
      {!brief && <p className="hint">Downloads include sources and data dates. A free account is required to export. <button type="button" className="link" onClick={() => { const section = document.getElementById("comparison-measures"); section?.focus(); section?.scrollIntoView({ block: "start" }); }}>Choose displayed measures ↓</button></p>}
      {loading && <p role="status">Loading published facts…</p>}
      {!loading && selected.some((id) => places[id] === null) && <p role="alert" className="error">Some places could not be loaded. <button type="button" className="link" onClick={() => setRetry(retry + 1)}>Retry unavailable data</button></p>}
      {brief && <section className="research-question"><p className="eyebrow">Research question</p><h2>{FOCUSES[focus].question}</h2><p><strong>Criteria:</strong> {criteria}{scope ? ` · Search within ${scopeLabel}` : " · Nationwide criteria"}</p></section>}
      {brief && complete && <section><h2>Place summaries</h2><div className="story-grid">{profiles.map((p) => <article className="research-topic" key={p.geoid}><p className="eyebrow">Tract {p.geoid}</p><h3>{p.county}, {p.state}</h3><p>{placeNarrative(p, focus).status}</p><p>Rural classification: {p.rural.treasury == null ? "unknown" : p.rural.treasury ? "rural" : "not rural"}.</p><p className="hint">Dataset built {dateLabel(p.publishedAt)}</p><PlaceReportLink place={places[p.geoid]!} from="/brief">Full place report</PlaceReportLink></article>)}</div></section>}
      <div className="answer-actions no-print" role="group" aria-label="Table orientation"><button type="button" className="button secondary" aria-pressed={!rowsView} onClick={() => setRowsView(false)}>Side by side</button><button type="button" className="button secondary" aria-pressed={rowsView} onClick={() => setRowsView(true)}>Tracts as rows</button></div><p className="hint comparison-scroll-hint">{rowsView ? "Each row is one tract, in your selection order. Scroll across for additional measures." : "Scroll across the table to see every place."}</p><div className="comparison-table-wrap" role="region" aria-label="Comparison table, scroll horizontally" tabIndex={0}>{rowsView ? <ComparisonRows ids={permitted} places={places} keys={keys} brief={brief} onRemove={(id) => setSelected((current) => current.filter((item) => item !== id))} /> : <table className="comparison-table"><caption>Selected facts · census tract geography</caption><thead><tr><th scope="col">Published measure</th>{permitted.map((id) => <th key={id} scope="col"><span className="eyebrow">Tract {id}</span><strong>{places[id]?.profile.county ?? (loading ? "Loading place…" : "Data unavailable")}</strong><span>{places[id]?.profile.state}</span><button type="button" className="link no-print" aria-label={`Remove tract ${id}`} onClick={() => setSelected((current) => current.filter((item) => item !== id))}>Remove</button></th>)}</tr></thead><tbody>
        <tr><th scope="row">Zone status</th>{permitted.map((id) => <td key={id}>{places[id] ? <Badges designation={places[id]!.profile.designation2027.status} rural={places[id]!.profile.rural.treasury} zone2018Share={places[id]!.profile.measures.oz2018_population_share?.value ?? null} /> : loading ? "Loading…" : "Unavailable"}</td>)}</tr>
        {measures.map((m) => <tr key={m.column}><th scope="row">{m.label}<small>{m.period} · census tract</small></th>{permitted.map((id) => { const source = places[id] && sourceFor(places[id]!.profile, m.column); return <td key={id}>{displayValue(places[id]?.profile.measures[m.column]?.value, m.unit)}<small>{source ? <a href={source.url} target="_blank" rel="noopener noreferrer">{source.publisher} · {source.vintage}</a> : "Source metadata unavailable"}</small></td>; })}</tr>)}
        <tr><th scope="row">Dataset built</th>{permitted.map((id) => <td key={id}>{dateLabel(places[id]?.profile.publishedAt)}</td>)}</tr>
        <tr className="no-print"><th scope="row">Evidence</th>{permitted.map((id) => <td key={id}>{places[id] && <PlaceReportLink place={places[id]!} from={brief ? "/brief" : "/compare"}>Full report</PlaceReportLink>}</td>)}</tr>
      </tbody></table>}</div>
      {complete && <ComparisonOverview profiles={profiles} keys={keys} />}
      <section id="comparison-measures" className="no-print" tabIndex={-1}><h2>Displayed measures</h2><ResearchControls customize /></section>
      {complete && filtersActive(filters) && <section><h2>Criteria evidence</h2><p>{criteria}{scope ? ` · Search within ${scopeLabel}` : " · Nationwide criteria"}</p>{permitted.map((id) => <article className="brief-evidence" key={id}><h3>Tract {id}</h3><ResearchEvidence geoid={id} onResolved={brief ? evidenceResolved : undefined} /></article>)}</section>}
      {brief && <section className="brief-questions"><h2>Questions this screening leaves open</h2><ul><li>Has a newer certified designation or source release been published?</li><li>Does the exact property fall within the relevant tract boundary and zone vintage?</li><li>What do local zoning, infrastructure, building condition, and site records establish?</li><li>Which fund, business, or property requirements would need separate verification?</li></ul><p>Site hazards and live address-level lookups are not included in this tract brief. Open the place report to research those sources.</p></section>}
      {brief && complete && <section><h2>Sources and data dates</h2>{Array.from(new Map(profiles.flatMap((p) => Object.entries(p.sources ?? {}))).entries()).filter(([id]) => profiles.some((p) => measures.some((m) => p.measures[m.column]?.source === id)) || ["oz2Eligible", "oz2Designated", "urbanAreas2020", "oz1Designated", "hudQct", "hudDda", "nmtcLic"].includes(id)).map(([id, s]) => <p className="brief-source" key={id}><a href={s.url}>{s.name}</a> · {s.publisher}<br /><small>{s.vintage} · {s.geography}</small><span className="print-source-url">{s.url}</span></p>)}</section>}
      <p className="note">Missing values mean unavailable data, not zero. Median home value describes the tract and is not a valuation of a specific property. {DISCLAIMER}</p>

    </>}
  </>;
}
