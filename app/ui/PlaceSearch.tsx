"use client";

import { useEffect, useId, useRef, useState } from "react";
import { isPlaceResult, lookupPlace, type PlaceCandidate, type PlaceResult } from "@/lib/client/place";
import type { CityLocation } from "@/lib/geo/placeNames";
import { RESEARCH_SCOPE_NOTICE } from "@/lib/oz/researchScope";

export default function PlaceSearch({ value, onChange, onResult, onCityResult, beforeSearch, resultAction = "Choose address", label = "Address or census tract", placeholder = "Street address with city and state, or tract number" }: {
  value: string; onChange: (value: string) => void; onResult: (result: PlaceResult) => void;
  beforeSearch?: (value: string) => boolean; label?: string; placeholder?: string;
  onCityResult?: (city: CityLocation) => void;
  resultAction?: "Choose address" | "View on map";
}) {
  const [busy, setBusy] = useState(false);
  const id = useId();
  const [message, setMessage] = useState("");
  const [candidates, setCandidates] = useState<PlaceCandidate[]>([]);
  const [cities, setCities] = useState<CityLocation[]>([]);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function search(candidate?: PlaceCandidate) {
    request.current?.abort();
    setCandidates([]);
    setCities([]);
    setMessage("");
    setBusy(false);
    if (!candidate && beforeSearch?.(value)) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    if (onCityResult && !candidate && !/^\d{11}$/.test(value.replace(/\s/g, ""))) {
      try {
        const response = await fetch("/api/places", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: value }), signal: controller.signal });
        if (controller.signal.aborted) return;
        if (!response.ok) { setBusy(false); setMessage(response.status === 429 ? "The lookup allowance has been reached. Try again after it resets." : "Place search is unavailable. Try again shortly."); return; }
        const result = await response.json() as { matches: CityLocation[]; more: boolean };
        if (controller.signal.aborted) return;
        if (result.matches.length) {
          setBusy(false); setCities(result.matches);
          setMessage(result.more ? "Several places match. Add a state to narrow these choices." : "Choose a city or town to view its surrounding tracts on the map.");
          return;
        }
        if (!/\d/.test(value)) { setBusy(false); setMessage("No city or town matched. Try the city and state, such as Atlanta, GA, or enter a full street address. City coverage includes the 50 states, DC, and Puerto Rico."); return; }
      } catch {
        if (controller.signal.aborted) return;
        setBusy(false); setMessage("Place search is unavailable. Try again shortly."); return;
      }
    }
    const result = await lookupPlace(value, candidate, controller.signal);
    if (controller.signal.aborted) return;
    setBusy(false);
    if (isPlaceResult(result)) { setMessage(`Found tract ${result.profile.geoid}, ${result.profile.county ?? "county unavailable"}, ${result.profile.state ?? "state unavailable"}. ${resultAction === "View on map" ? "Opening map…" : "Results are below the search."}`); onResult(result); }
    else if (typeof result === "object") { setCandidates(result.candidates); setMessage("More than one address matched. Choose the correct location."); }
    else setMessage(result === "out-of-scope" ? RESEARCH_SCOPE_NOTICE : result === "limited" ? "The lookup allowance has been reached. Your search is preserved. Try again after the allowance resets, or use a published tract number. Free accounts have higher address allowances." : result === "no-match" ? "No match. Check the street, city, state and ZIP, or use an 11-digit tract number." : "The lookup is unavailable. Try again, or use a tract number.");
  }
  return <div className="place-search">
    <label className="place-search-label" htmlFor={`${id}-query`}>{label}</label>
    <form className="front-search" role="search" aria-label={label} aria-busy={busy} onSubmit={(event) => { event.preventDefault(); if (!busy) void search(); }}>
      <input id={`${id}-query`} aria-describedby={`${id}-message`} placeholder={placeholder} value={value} maxLength={200} onChange={(event) => { onChange(event.target.value); setCandidates([]); setCities([]); setMessage(""); }} autoComplete="off" readOnly={busy} />
      <button className="button" disabled={busy || value.trim().length < 2}>{busy ? "Searching…" : "Search"}</button>
    </form>
    <div id={`${id}-message`} role="status" aria-live="polite" aria-atomic="true">{busy ? <p className="hint">Searching published geography…</p> : message && <p className="hint">{message}</p>}</div>
    {(candidates.length > 0 || cities.length > 0) && <section className="place-matches" aria-labelledby={`${id}-matches`}>
      <div className="place-matches-heading"><h3 id={`${id}-matches`}>{cities.length ? "City and town matches" : "Address matches"}</h3><span>{candidates.length + cities.length} {candidates.length + cities.length === 1 ? "result" : "results"}</span></div>
      {candidates.length > 0 && <ul className="match-options">{candidates.map((candidate) => <li key={`${candidate.geoid}-${candidate.lon}-${candidate.lat}`}><button type="button" className="button secondary place-match" onClick={() => void search(candidate)}><span className="place-match-label">{candidate.label ?? candidate.geoid}</span><span className="place-match-action">{resultAction} <span aria-hidden="true">→</span></span></button></li>)}</ul>}
      {cities.length > 0 && <ul className="match-options" aria-label="Matching cities and towns">{cities.map((city) => <li key={city.geoid}><button type="button" className="button secondary place-match" onClick={() => { setCities([]); setMessage(`Selected ${city.name}, ${city.usps}. City lookup centers the map; tract status is shown individually.`); onCityResult?.(city); }}><span className="place-match-label">{city.name}, {city.usps}</span><span className="place-match-action">View on map <span aria-hidden="true">→</span></span></button></li>)}</ul>}
    </section>}
  </div>;
}
