"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { StateSummary } from "@/lib/data/stateViews";
import type { SearchPage } from "@/lib/access/search";
import { filterDescription, filtersActive, NO_FILTERS, parseFilters, type Filters } from "@/lib/explore/filter";
import { isPlaceResult, lookupPlace, pointFromHash, type PlaceResult } from "@/lib/client/place";
import { dateLabel, DISCLAIMER, RESEARCH_NOTICE, displayValue } from "@/lib/client/presentation";
import { useResearchState } from "./ResearchSession";
import PlaceSearch from "./PlaceSearch";
import MapApp, { type MapFocus } from "./MapApp";
import { FindAreas } from "./FindAreas";
import { ComparisonButton, ComparisonTray, ComparisonListActions } from "./ResearchActions";
import { RESEARCH_SCOPE_NOTICE } from "@/lib/oz/researchScope";
import TractQuickView from "./TractQuickView";
import MapArrivalScroll from "./MapArrivalScroll";
import { removeCriterion } from "@/lib/explore/evidence";
import { EvidenceTable } from "./ResearchEvidence";
import ExportResearch from "./ExportResearch";
import { useAccount } from "./AccountAccess";
import PrepareDataLink from "./PrepareDataLink";
import { type CityLocation } from "@/lib/geo/placeNames";

const subscribeWidth = (callback: () => void) => { const media = window.matchMedia("(max-width: 700px)"); media.addEventListener("change", callback); return () => media.removeEventListener("change", callback); };
export default function ExploreWorkspace({ states }: { states: StateSummary[] }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // Next commits a client navigation's URL after rendering the destination.
    // Read its fragment on the next frame, before any map effect can rewrite it.
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return ready ? <Workspace states={states} /> : <p className="page" role="status">Opening area explorer…</p>;
}

function Workspace({ states }: { states: StateSummary[] }) {
  const { account, open: openAccount } = useAccount();
  const [initial] = useState(() => new URLSearchParams(window.location.hash.slice(1)));
  const [state, setState] = useResearchState("explore-state", initial.get("s") ?? initial.get("t")?.slice(0, 2) ?? "");
  const [filters, setFilters] = useResearchState<Filters>("explore-filters", () => parseFilters(initial.get("f")));
  const [query, setQuery] = useResearchState("explore-query", "");
  const [sort, setSort] = useResearchState("explore-sort", "geoid");
  const [page, setPage] = useResearchState("explore-page", 0);
  const [selected, setSelected] = useResearchState<PlaceResult | null>("explore-selected", null);
  const [activePlace] = useResearchState<PlaceResult | null>("active-place", null);
  const [sourcePlace] = useState(activePlace);
  const [mode, setMode] = useResearchState<"list" | "map" | "split">("explore-mode", "map");
  const [retry, setRetry] = useState(0);
  const requestKey = JSON.stringify({ state, retry, filters, sort, page, member: account.member });
  const [response, setResponse] = useState<{ key: string; data: SearchPage | null; error: string } | null>(null);
  const data = response?.key === requestKey ? response.data : null;
  const error = response?.key === requestKey ? response.error : "";
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterDialog = useRef<HTMLDialogElement>(null);
  const narrow = useSyncExternalStore(subscribeWidth, () => window.matchMedia("(max-width: 700px)").matches, () => false);
  const displayMode = narrow && mode === "split" ? "list" : mode;
  const [selectionBusy, setSelectionBusy] = useState(false);
  const [selectionError, setSelectionError] = useState("");
  const [city, setCity] = useState<CityLocation | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(() => selected ? { geoid: selected.profile.geoid, point: selected.point ?? selected.profile.center ?? null, exact: !!selected.point } : null);
  const activeRequest = useRef(0);
  const chosenState = states.find((item) => item.fips === state);
  const loading = states.length > 0 && response?.key !== requestKey;
  const view = useMemo<[number, number, number] | null>(() => city?.view ?? chosenState?.view ?? null, [city, chosenState]);
  const [popupTract, setPopupTract] = useState<string | null>(null);
  const selectionTrigger = useRef<HTMLElement | null>(null);
  const textResults = useRef<HTMLDivElement>(null);
  const focusResults = useRef(false);
  const focusView = useRef(false);
  useEffect(() => { if (displayMode === "list" && focusResults.current) { focusResults.current = false; textResults.current?.focus(); } }, [displayMode]);
  useEffect(() => {
    if (!focusView.current) return;
    focusView.current = false;
    const buttons = document.querySelectorAll<HTMLButtonElement>(`.explorer-results button[data-view="${displayMode}"]`);
    const button = [...buttons].find((button) => !button.closest("[hidden]"));
    const collapsed = button?.closest("details:not([open])");
    if (collapsed) collapsed.querySelector("summary")?.focus();
    else button?.focus();
  }, [displayMode]);
  useEffect(() => { if (!narrow) filterDialog.current?.close(); }, [narrow]);

  useEffect(() => {
    const explicitState = initial.get("s") ?? initial.get("t")?.slice(0, 2);
    if (explicitState && states.some((item) => item.fips === explicitState)) setState(explicitState);
    if (initial.has("f")) setFilters(parseFilters(initial.get("f")));
    const requestedMode = initial.get("m");
    if (requestedMode === "list" || requestedMode === "map" || requestedMode === "split") setMode(requestedMode);
  }, [initial, states, setState, setFilters, setMode]);

  useEffect(() => {
    if (!states.length) return;
    const controller = new AbortController();
    const timer = setTimeout(() => { void fetch(`/api/explore/${chosenState?.fips ?? "all"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filters, sort, page }), signal: controller.signal }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Area data could not be loaded.");
      if (!controller.signal.aborted) setResponse({ key: requestKey, data: result, error: "" });
    }).catch((error) => { if (!controller.signal.aborted) setResponse({ key: requestKey, data: null, error: error instanceof Error ? error.message : "The area data could not be loaded. Your criteria are still here." }); }); }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [chosenState, states.length, requestKey, filters, sort, page]);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    if (state) hash.set("s", state); else hash.delete("s");
    hash.set("f", JSON.stringify(filters));
    hash.set("m", mode);
    window.history.replaceState(window.history.state, "", `#${hash}`);
  }, [state, filters, mode]);

  const pick = useCallback(async (geoid: string, exact?: [number, number] | null) => {
    if (document.activeElement instanceof HTMLElement && !document.activeElement.closest(".tract-quick-view")) selectionTrigger.current = document.activeElement;
    setPopupTract(geoid);
    const id = ++activeRequest.current;
    setSelectionBusy(true); setSelectionError("");
    const result = await lookupPlace(geoid);
    if (id !== activeRequest.current) return;
    setSelectionBusy(false);
    if (!isPlaceResult(result)) { if (result === "out-of-scope") { setPopupTract(null); setSelectionError(RESEARCH_SCOPE_NOTICE); setSelected(null); setFocus(null); const hash = new URLSearchParams(window.location.hash.slice(1)); hash.delete("t"); window.history.replaceState(window.history.state, "", `#${hash}`); } else setSelectionError("That place could not be loaded. Select it again to retry."); return; }
    const matched = exact && sourcePlace?.profile.geoid === geoid && sourcePlace.point?.every((value, index) => Math.abs(value - exact[index]) < 0.00001) ? sourcePlace.matched : null;
    const place = { ...result, point: exact ?? null, matched };
    const hash = new URLSearchParams(window.location.hash.slice(1));
    hash.set("t", geoid);
    if (exact) hash.set("at", `${exact[1]},${exact[0]}`); else hash.delete("at");
    window.history.replaceState(window.history.state, "", `#${hash}`);
    setSelected(place);
    setFocus({ geoid, point: exact ?? result.profile.center ?? null, exact: !!exact });
    // Keep the map selection while the quick-view dialog explains the next steps.
  }, [setSelected, sourcePlace]);

  useEffect(() => {
    const geoid = initial.get("t");
    // Restore the URL's selected tract through the same asynchronous lookup used by clicks.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (geoid && /^\d{11}$/.test(geoid)) void pick(geoid, pointFromHash(window.location.hash));
    // This is a request sequence counter, not a DOM node; invalidate the latest request on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { activeRequest.current++; };
  }, [initial, pick]);

  const matched = useMemo(() => data ? new Set(data.matches) : null, [data]);
  // Pending/error results must not briefly show every tract as a match.
  const matches = useMemo(() => chosenState || filtersActive(filters) ? data?.matches ?? [] : null, [chosenState, filters, data]);
  const sorted = data?.rows ?? [];
  const pageCount = data?.pages ?? 0;
  const currentPage = data?.page ?? 0;
  const visible = sorted;
  const criteria = filterDescription(filters);
  const diagnostics = data?.diagnostics ?? [];
  function clearSelection() { setPopupTract(null); activeRequest.current++; setSelectionBusy(false); setSelected(null); setFocus(null); const trigger = selectionTrigger.current; requestAnimationFrame(() => { if (trigger?.isConnected) trigger.focus(); }); selectionTrigger.current = null; const hash = new URLSearchParams(window.location.hash.slice(1)); hash.delete("t"); hash.delete("at"); window.history.replaceState(window.history.state, "", `#${hash}`); }
  function showDetails(geoid: string, trigger: HTMLButtonElement) { selectionTrigger.current = trigger; if (selected?.profile.geoid === geoid) { setSelectionError(""); setPopupTract(geoid); } else void pick(geoid); }
  function changeState(value: string) { clearSelection(); setCity(null); setFilters((current) => ({ ...current, county: "" })); setState(value); setPage(0); const hash = new URLSearchParams(window.location.hash.slice(1)); hash.delete("v"); window.history.replaceState(window.history.state, "", `#${hash}`); }
  function acceptCity(result: CityLocation) {
    changeState(result.geoid.slice(0, 2)); setCity(result); setMode("map"); setSelectionError("");
    const hash = new URLSearchParams(window.location.hash.slice(1)); hash.set("v", result.view.join(","));
    window.history.replaceState(window.history.state, "", `#${hash}`);
  }
  function acceptPlace(result: PlaceResult) {
    selectionTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setCity(null); setPopupTract(result.profile.geoid);
    activeRequest.current++; setSelectionBusy(false); setSelectionError("");
    setFilters((current) => current.county && !result.profile.geoid.startsWith(current.county) ? { ...current, county: "" } : current);
    setState(result.profile.geoid.slice(0, 2)); setSelected(result); setPage(0);
    setFocus({ geoid: result.profile.geoid, point: result.point ?? result.profile.center ?? null, exact: !!result.point });
    const hash = new URLSearchParams(window.location.hash.slice(1)); hash.set("t", result.profile.geoid);
    if (result.point) hash.set("at", `${result.point[1]},${result.point[0]}`); else hash.delete("at");
    window.history.replaceState(window.history.state, "", `#${hash}`);
  }
  const geographyControls = <><details className="explorer-location" open={!narrow}><summary>Search a location</summary><PlaceSearch value={query} onChange={setQuery} onResult={acceptPlace} onCityResult={acceptCity} label="Address, city, state, or tract number" placeholder="Atlanta, GA · Georgia · address · tract" beforeSearch={(input) => { const q = input.trim().toLowerCase().replace(/\.$/, ""); const found = states.find((item) => item.name.toLowerCase() === q || item.usps.toLowerCase() === q); if (!found) return false; changeState(found.fips); setMode("map"); return true; }} />{city && <p className="hint">Map centered near {city.name}, {city.usps}. Results and filters cover {chosenState?.name ?? "the selected state"}, not the city boundary. <a href="https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.2024.html" target="_blank" rel="noreferrer">Census Gazetteer, 2024 ↗</a></p>}</details>
        <label className="scope-field">Search within<select aria-label="Search state" value={state} onChange={(event) => changeState(event.target.value)}><option value="">Nationwide · all states and territories</option>{states.map((item) => <option key={item.fips} value={item.fips}>{item.name}</option>)}</select></label>
        {chosenState && <label className="scope-field county-field">County<select value={filters.county ?? ""} onChange={(event) => { setFilters({ ...filters, county: event.target.value }); setPage(0); }}><option value="">All counties</option>{(data?.counties ?? response?.data?.counties ?? []).filter((county) => county.fips.startsWith(chosenState.fips)).map((county) => <option key={county.fips} value={county.fips}>{county.name}</option>)}</select></label>}</>;
  const viewControls = <><div className="view-switch" role="group" aria-label="Results view">{(["map", "list", "split"] as const).map((option) => <button key={option} type="button" data-view={option} aria-pressed={displayMode === option} aria-controls="area-results-content" className={option === "split" ? "desktop-only" : ""} onClick={() => { if (option !== displayMode) { focusView.current = true; setMode(option); } }}>{option === "split" ? "List + map" : option === "list" ? "List" : "Map"}</button>)}</div><button type="button" className="button secondary mobile-filters" aria-haspopup="dialog" aria-expanded={filtersOpen} onClick={() => { filterDialog.current?.showModal(); setFiltersOpen(true); }}>Filters</button></>;
  return <main className="explorer">
    <MapArrivalScroll />
    <div className="explorer-layout">
      <aside aria-label="Area search and filters" tabIndex={0} className={`explorer-filters ${filtersOpen ? "filters-open" : ""}`}>
        <header className="explorer-heading"><div><h1>Find areas</h1><p>Explore published place data.</p></div></header>
        <div className="filter-sheet"><FindAreas filters={filters} onChange={(next) => { setFilters(next); setPage(0); }} matches={matched?.size ?? null} busy={loading} scopeLabel={chosenState ? `in ${chosenState.name}` : "nationwide"}>{geographyControls}<p className="hint"><Link href="/workbench#tab=criteria">Preview filter impact before applying →</Link></p></FindAreas><button type="button" className="button mobile-filter-done" onClick={() => setFiltersOpen(false)}>Show {matched?.size.toLocaleString("en-US") ?? ""} results</button></div>
      </aside>
      <section className={`explorer-results results-${displayMode}`} aria-label="Area results" tabIndex={0}>
        {displayMode === "list" && <div className="results-toolbar">{viewControls}</div>}
        {error && <p className="error" role="alert">{error} {!account.member && <button className="link" onClick={openAccount}>Free account / sign in</button>} <button className="link" onClick={() => { setFilters(NO_FILTERS); setSort("geoid"); setPage(0); }}>Reset filters and sort</button> <button className="link" onClick={() => setRetry(retry + 1)}>Retry</button></p>}
        <div id="area-results-content" className={`results-workspace view-${displayMode}`}>
          <div className="result-list" ref={textResults} role="region" aria-label="Text results" tabIndex={-1} hidden={displayMode === "map"}>
            {!chosenState && <p className="explorer-start-hint">Showing nationwide results. Choose a state to narrow your search. Map interaction is not required.</p>}
            {!!matched?.size && <div className="results-sort"><label>Sort by<select disabled={!account.member} value={sort} onChange={(event) => { setSort(event.target.value); setPage(0); }}><option value="geoid">Tract number</option><option value="median_home_value:asc">Home value: low to high</option><option value="median_home_value:desc">Home value: high to low</option><option value="median_household_income:asc">Income: low to high</option><option value="median_household_income:desc">Income: high to low</option><option value="population:desc">Population: high to low</option></select></label><ExportResearch input={{ state: chosenState?.fips ?? "all", filters, sort }} label="Export matches" /></div>}
            {data && sorted.length === 0 && <div className="empty-state"><h2>No tracts match these criteria.</h2><p>Broaden a range or remove a filter. Tracts missing a required measure are excluded; missing values are never treated as zero.</p><ul className="criteria-diagnostics">{diagnostics.map((item) => <li key={item.id}><strong>{item.label}</strong><p>{item.excluded.toLocaleString("en-US")} do not meet this criterion; {item.unknown.toLocaleString("en-US")} have unknown evidence. Removing it would leave {item.without.toLocaleString("en-US")} matches.</p><button type="button" className="link" onClick={() => { setFilters(removeCriterion(filters, item.id)); setPage(0); }}>Remove this criterion</button></li>)}</ul><p className="hint">Counts overlap; one tract can fail more than one criterion.</p></div>}
            {visible.map(([geoid, bits]) => { const facts = data?.tracts?.[geoid]; return <article className="area-result" key={geoid}><div><button type="button" className="result-title" onClick={(event) => showDetails(geoid, event.currentTarget)}>{facts?.county ?? chosenState?.name} <span>Tract {geoid}</span></button><div className="result-status">{bits & 64 ? "Designated 2027 zone" : bits & 128 ? "Eligible · designation pending" : bits & 1 ? "Eligible · not designated" : "See report for eligibility"}{facts?.rural === true && " · Rural"}</div></div>{account.member && <dl className="result-numbers"><div><dt>Median home value</dt><dd>{displayValue(facts?.values.median_home_value, "usd")}</dd></div><div><dt>Household income</dt><dd>{displayValue(facts?.values.median_household_income, "usd")}</dd></div></dl>}<details><summary>Why it matches</summary><EvidenceTable evidence={data?.evidence[geoid] ?? []} /><p className="hint">Tract measures: Census 2020–2024 ACS. Neighbor figures are population-weighted averages of adjacent tracts. Program flags use the published Treasury, HUD, and CDFI files; see the report for source dates.</p></details><div className="answer-actions"><button type="button" className="button secondary" onClick={(event) => showDetails(geoid, event.currentTarget)} aria-label={`View details for tract ${geoid}`}>View details</button><ComparisonButton geoid={geoid} /></div></article>; })}
            {pageCount > 1 && <nav className="pagination" aria-label="Results pages"><button type="button" className="button secondary" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>Previous</button><span>Page {currentPage + 1} of {pageCount}</span><button type="button" className="button secondary" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Next</button></nav>}
          </div>
          <div className="result-map" hidden={displayMode === "list"}>
            <MapApp view={view} focus={focus} matches={matches} onSelect={pick} viewControls={viewControls} />
        <nav className="map-action-links" aria-label="Map results and other research methods"><ComparisonListActions /><Link href="/workbench#tab=list">Match a tract list</Link><Link href="/check">Check a list of properties</Link><Link href="/use-with-claude">Research through chat</Link></nav>

          </div>
        </div>
        {displayMode === "list" && <nav className="map-action-links" aria-label="Other research methods"><ComparisonListActions /><Link href="/workbench#tab=list">Match a tract list</Link><Link href="/check">Check a list of properties</Link><Link href="/use-with-claude">Research through chat</Link></nav>}
        <div className="results-summary"><div role="status" aria-live="polite" aria-atomic="true"><strong>{loading ? "Loading places…" : matched ? `${matched.size.toLocaleString("en-US")} matching tracts` : "Nationwide view"}</strong><span>{chosenState ? ` in ${chosenState.name}` : " nationwide"}</span></div>{data && <ExportResearch input={{ state: chosenState?.fips ?? "all", filters, sort }} label="Export matches" />}</div>
        <p className="criteria-summary">{filtersActive(filters) ? criteria : chosenState ? `All tracts in ${chosenState.name}` : "All published tracts nationwide"}</p>
        <p className="map-alternative">The List view uses the same filters without requiring the map. Filter nationwide, or choose a state to narrow your search. <Link href="/accessibility">Accessibility help</Link></p>
        {!popupTract && selectionError && <p role="status" className="hint">{selectionError}</p>}
        {popupTract && <TractQuickView key={popupTract} geoid={popupTract} place={selected?.profile.geoid === popupTract ? selected : null} busy={selectionBusy} error={selectionError} onClose={clearSelection} onRetry={() => void pick(popupTract)} />}
        <p className="note">{data && <>Dataset built {dateLabel(data.generated)} · ACS measures cover 2020–2024. </>}{RESEARCH_NOTICE} {DISCLAIMER}</p>
        <ComparisonTray />
        {chosenState && <section className="next-research"><h2>Use your results</h2><p>Open a tract to inspect the facts, compare your selections, or prepare the matching data for your own analysis.</p><PrepareDataLink geoids={[]} /><Link className="text-action" href="/workbench#tab=data">Inspect sources and coverage →</Link></section>}
        <dialog ref={filterDialog} className="mobile-filter-dialog" aria-label="Filter places" onClose={() => setFiltersOpen(false)}><header><h2>Filter places</h2><button type="button" className="button secondary" onClick={() => filterDialog.current?.close()}>Close</button></header><FindAreas filters={filters} onChange={(next) => { setFilters(next); setPage(0); }} matches={matched?.size ?? null} busy={loading} scopeLabel={chosenState ? `in ${chosenState.name}` : "nationwide"}>{geographyControls}</FindAreas><button type="button" className="button filter-apply" onClick={() => filterDialog.current?.close()}>Show {matched?.size.toLocaleString("en-US") ?? ""} results</button></dialog>
      </section>
    </div>
  </main>;
}
