"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { PlaceResult } from "@/lib/client/place";
import { dateLabel, DISCLAIMER, displayValue } from "@/lib/client/presentation";
import { DEFAULT_MEASURES, selectedMeasures, sourceFor } from "@/lib/research/measures";
import { comparisonLimit } from "@/lib/research/comparisonLimits";
import { ComparisonButton, ComparisonListActions, PlaceReportLink } from "./ResearchActions";
import { BriefLink } from "./ResearchControls";
import { useResearchState } from "./ResearchSession";
import { useAccount } from "./AccountAccess";
import Badges from "./Badges";
import ExportResearch from "./ExportResearch";
import TractIndicators from "./TractIndicators";

export default function TractQuickView({ geoid, place, busy, error, onClose, onRetry }: {
  geoid: string; place: PlaceResult | null; busy: boolean; error: string; onClose: () => void; onRetry: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const pressedBackdrop = useRef(false);
  const [detailed, setDetailed] = useState(false);
  const { account } = useAccount();
  const [comparison] = useResearchState<string[]>("comparison", []);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal(); heading.current?.focus({ preventScroll: true });
    return () => node?.close();
  }, []);
  useEffect(() => { if (detailed) { dialog.current?.scrollTo?.(0, 0); heading.current?.focus({ preventScroll: true }); } }, [detailed]);
  const profile = place?.profile;
  function onBackdrop(event: { target: EventTarget; currentTarget: HTMLDialogElement; clientX: number; clientY: number }) {
    if (event.target !== event.currentTarget) return false;
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
  }
  // Native dialog owns backdrop events; preserve its dialog semantics and Escape support.
  // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
  return <dialog ref={dialog} className={`tract-quick-view${detailed ? "" : " tract-quick-view-compact"}`} aria-labelledby={title} onCancel={(event) => { event.preventDefault(); onClose(); }}
    onPointerDown={(event) => { pressedBackdrop.current = event.button === 0 && onBackdrop(event); }}
    onPointerCancel={() => { pressedBackdrop.current = false; }}
    onClick={(event) => {
      // Close only a click that starts and ends outside. Selecting text or
      // dragging from the report onto its backdrop must keep the report open.
      const dismiss = pressedBackdrop.current && onBackdrop(event);
      pressedBackdrop.current = false;
      if (dismiss) onClose();
    }}>
    <div className="tract-quick-close-bar"><button type="button" className="button secondary tract-quick-close" onClick={onClose} aria-label="Close tract details and return to map" title="Close tract details"><span aria-hidden="true">×</span></button></div>
    <header className="tract-quick-header"><div><p className="eyebrow">{detailed ? "Detailed tract report" : "Selected census tract"}</p><h2 id={title} ref={heading} tabIndex={-1}>Tract {geoid}</h2>{profile && <p>{profile.county}, {profile.state}</p>}</div></header>
    {!detailed ? <>
      <div className="tract-compact-actions" aria-label="Actions for this tract">
        <ComparisonButton geoid={geoid} />
        <button type="button" className="button" onClick={() => setDetailed(true)}>Detailed report</button>
      </div>
      <p className="hint" role="status">Comparison list: <strong>{comparison.length} / {comparisonLimit(account.member)}</strong> tracts{!account.member && " · A free account allows up to 25."}</p>
      {profile?.analysis && <TractIndicators analysis={profile.analysis} compact />}
      {busy && <p className="hint" role="status">Loading this tract’s published facts…</p>}
      {error && <p className="hint" role="status">Details are unavailable. Open Detailed report to retry.</p>}
    </> : busy ? <p role="status">Loading this tract’s published facts…</p> : error ? <div role="alert"><p>{error}</p><button type="button" className="button" onClick={onRetry}>Retry tract lookup</button></div> : profile && place && <>
      <Badges designation={profile.designation2027.status} rural={profile.rural.treasury} zone2018Share={profile.measures.oz2018_population_share?.value ?? null} />
      <p>{profile.designation2027.text}</p>
      <dl className="tract-quick-facts">{selectedMeasures(DEFAULT_MEASURES).map((measure) => {
        const source = sourceFor(profile, measure.column);
        return <div key={measure.column}><dt>{measure.label}</dt><dd>{displayValue(profile.measures[measure.column]?.value, measure.unit)}</dd><small>{source ? <a href={source.url} target="_blank" rel="noreferrer">{source.publisher} · {source.vintage}</a> : measure.period}</small></div>;
      })}</dl>
      <p className="hint">Figures describe the census tract, not an individual property. Missing values are unavailable, not zero. Dataset built {dateLabel(profile.publishedAt)}.</p>
      {profile.analysis && <TractIndicators analysis={profile.analysis} />}
      <section className="tract-next-actions" aria-label="Next steps for this tract"><h3>What would you like to do next?</h3><div className="answer-actions">
        <PlaceReportLink place={place} from={`/map${window.location.hash}`}>View full tract report</PlaceReportLink>
        <BriefLink geoids={[geoid]}>Export report / PDF</BriefLink>
        <ExportResearch input={{ geoids: [geoid], columns: DEFAULT_MEASURES }} label="Export tract data" />
        <ComparisonButton geoid={geoid} />
      </div><p className="hint">Report/PDF opens a printable brief for review. Downloads require a free account and use its export allowance.</p></section>
      <div className="tract-comparison-summary"><span role="status">Comparison list: <strong>{comparison.length} / {comparisonLimit(account.member)}</strong> tracts</span><button type="button" className="button secondary" onClick={onClose}>Back to map · select another tract</button></div>
    </>}
    <ComparisonListActions />
    <p className="note">{DISCLAIMER}</p>
  </dialog>;
}
