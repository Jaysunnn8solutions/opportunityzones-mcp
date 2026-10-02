"use client";
import { comparisonLimit, MAX_COMPARISON_TRACTS } from "@/lib/research/comparisonLimits";

import Link from "next/link";
import { useState } from "react";
import { mapHref, reportHref, type PlaceResult } from "@/lib/client/place";
import { useAccount } from "./AccountAccess";
import { useResearchState } from "./ResearchSession";

export function ComparisonButton({ geoid }: { geoid: string }) {
  const { account, resumeAfterSignIn } = useAccount();
  const maximum = comparisonLimit(account.member);
  const [selected, setSelected] = useResearchState<string[]>("comparison", []);
  const [message, setMessage] = useState("");
  const included = selected.includes(geoid);
  return <span className="compare-control"><button type="button" className="button secondary" aria-pressed={included} onClick={() => {
    if (!included && selected.length >= maximum) { setMessage(`Compare up to ${maximum} places. Remove one to add another.`); if (!account.member && selected.length < MAX_COMPARISON_TRACTS) resumeAfterSignIn(() => { setSelected((current) => current.includes(geoid) || current.length >= MAX_COMPARISON_TRACTS ? current : [...current, geoid]); setMessage("Signed in. Your requested tract is in the comparison."); }); return; }
    setMessage(""); setSelected((current) => current.includes(geoid) ? current.filter((id) => id !== geoid) : current.length < maximum ? [...current, geoid] : current);
  }}>{included ? "Added to comparison ✓" : "Add to comparison"}</button>{message && <span role="status" className="hint">{message} <Link href="/compare">Open comparison</Link></span>}</span>;
}

export function ComparisonTray() {
  const { account } = useAccount();
  const [selected] = useResearchState<string[]>("comparison", []);
  if (!selected.length) return null;
  return <div className="comparison-tray" role="status"><span><strong>{selected.length}</strong> {selected.length === 1 ? "place" : "places"} selected · up to {comparisonLimit(account.member)}</span><Link className="button" href="/compare">Compare places →</Link></div>;
}

export function ComparisonListActions() {
  const [selected, setSelected] = useResearchState<string[]>("comparison", []);
  const [cleared, setCleared] = useState("");
  return <span className="comparison-list-actions">
    {selected.length > 0 && <><Link href="/compare">View Comparison List</Link><button type="button" className="link" onClick={(event) => {
      const target = event.currentTarget.closest("dialog")?.querySelector<HTMLElement>("h2") ?? event.currentTarget.closest("nav");
      setSelected([]); setCleared("Comparison list cleared.");
      if (target) { if (!target.hasAttribute("tabindex")) target.tabIndex = -1; target.focus(); }
    }}>Clear comparison list</button></>}
    <span className="visually-hidden" role="status">{selected.length ? "" : cleared}</span>
  </span>;
}

export function RulesGuideLink() {
  return <Link className="button secondary" href="/guide">Understand the rules</Link>;
}

export function PlaceReportLink({ place, from, children = "Open place report" }: { place: PlaceResult; from: string; children?: React.ReactNode }) {
  const [, setOrigin] = useResearchState("report-origin", "/");
  const [, setPlace] = useResearchState<PlaceResult | null>("active-place", null);
  return <Link className="button" href={reportHref(place.profile.geoid, place.point)} onClick={() => { setOrigin(from); setPlace(place); }}>{children}</Link>;
}

export function PlaceMapLink({ place }: { place: PlaceResult }) {
  const [, setActivePlace] = useResearchState<PlaceResult | null>("active-place", null);
  return <Link className="button secondary" href={mapHref(place.profile.geoid, place.point)} onClick={() => setActivePlace(place)}>View on map</Link>;
}
