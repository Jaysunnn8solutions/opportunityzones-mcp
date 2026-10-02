"use client";

import Link from "next/link";
import { useRef } from "react";
import type { StateSummary } from "@/lib/data/stateViews";
import type { PlaceResult } from "@/lib/client/place";
import FrontDoor from "./FrontDoor";
import { useResearchState } from "./ResearchSession";

const tabs = [{ id: "location", label: "Location research" }, { id: "map", label: "Map search" }] as const;
export default function ResearchEntryTabs({ states }: { states: StateSummary[] }) {
  const [tab, setTab] = useResearchState<"location" | "map">("hub-search-tab", "location");
  const [state, setState] = useResearchState("hub-map-state", "");
  const [, setExploreState] = useResearchState("explore-state", "");
  const [, setMode] = useResearchState<"list" | "map" | "split">("explore-mode", "map");
  const [, setSelected] = useResearchState<PlaceResult | null>("explore-selected", null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const chosen = states.find((item) => item.fips === state);
  const hash = new URLSearchParams({ m: "map", v: (chosen?.view ?? [-96, 38.5, 3.6]).join(",") });
  if (chosen) hash.set("s", chosen.fips);
  return <section className="search-surface hub-search" id="location-research" aria-label="Start your location or map research">
    <div className="hub-search-tabs" role="tablist" aria-label="Research search method">{tabs.map((item, index) => <button type="button" role="tab" key={item.id} id={`hub-tab-${item.id}`} aria-controls={`hub-panel-${item.id}`} aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1} ref={(element) => { buttons.current[index] = element; }} onClick={() => setTab(item.id)} onKeyDown={(event) => {
      const next = event.key === "ArrowRight" || event.key === "ArrowLeft" ? 1 - index : event.key === "Home" ? 0 : event.key === "End" ? 1 : null;
      if (next == null) return;
      event.preventDefault(); setTab(tabs[next].id); buttons.current[next]?.focus();
    }}>{item.label}</button>)}</div>
    <div role="tabpanel" id="hub-panel-location" aria-labelledby="hub-tab-location" hidden={tab !== "location"} tabIndex={0}>
      <h2>What location are you researching?</h2><FrontDoor states={states} /><Link className="text-action" href="/check">Researching several properties? Review a list →</Link>
    </div>
    <div role="tabpanel" id="hub-panel-map" aria-labelledby="hub-tab-map" hidden={tab !== "map"} tabIndex={0}>
      <div className="hub-map-intro"><div><h2>Explore Opportunity Zones on the map</h2><p>Open a nationwide view or start with a state. Use map layers and filters to explore the published data.</p></div><svg viewBox="0 0 80 60" className="hub-map-icon" aria-hidden="true"><path d="m5 13 23-8 24 8 23-8v43l-23 8-24-8-23 8Z" fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" /><path d="M28 5v43M52 13v43" stroke="var(--accent)" strokeWidth="1.5" /><path d="M40 17c-6 0-10 4-10 10 0 8 10 16 10 16s10-8 10-16c0-6-4-10-10-10Z" fill="var(--paper)" stroke="var(--accent)" strokeWidth="2" /><circle cx="40" cy="27" r="3" fill="var(--accent)" /></svg></div>
      <div className="hub-map-controls"><label>Map starting area<select aria-label="Map starting area" value={state} onChange={(event) => setState(event.target.value)}><option value="">United States · nationwide view</option>{states.map((item) => <option key={item.fips} value={item.fips}>{item.name}</option>)}</select></label><Link className="button" href={`/map#${hash}`} onClick={() => { setExploreState(chosen?.fips ?? ""); setSelected(null); setMode("map"); }}>Open {chosen?.name ?? "U.S."} map →</Link></div>
      <p className="hint">The map distinguishes eligibility, certified designation, and historical overlap. Choose a state there to see matching tract counts.</p>
      <Link href={`/map#${new URLSearchParams({ ...Object.fromEntries(hash), m: "list" })}`} onClick={() => { setExploreState(chosen?.fips ?? ""); setSelected(null); setMode("list"); }}>Use text results for the same geography →</Link>
    </div>
  </section>;
}
