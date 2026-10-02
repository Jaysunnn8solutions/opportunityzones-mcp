"use client";
import { useRef, useState } from "react";

export default function ReportSections({ overview, context, sources }: { overview: React.ReactNode; context: React.ReactNode; sources: React.ReactNode }) {
  const [tab, setTab] = useState("overview");
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const panels = [{ id: "overview", label: "Local facts", content: overview }, { id: "context", label: "Site context", content: context }, { id: "sources", label: "Measures & sources", content: sources }];
  return <div className="report-sections"><div className="report-tabs" role="tablist" aria-label="Place report sections">{panels.map((panel, index) => <button key={panel.id} ref={(element) => { buttons.current[index] = element; }} type="button" role="tab" tabIndex={tab === panel.id ? 0 : -1} id={`report-tab-${panel.id}`} aria-controls={`report-panel-${panel.id}`} aria-selected={tab === panel.id} onClick={() => setTab(panel.id)} onKeyDown={(event) => {
    const next = event.key === "ArrowRight" ? (index + 1) % panels.length : event.key === "ArrowLeft" ? (index + panels.length - 1) % panels.length : event.key === "Home" ? 0 : event.key === "End" ? panels.length - 1 : null;
    if (next == null) return;
    event.preventDefault(); setTab(panels[next].id); buttons.current[next]?.focus();
  }}>{panel.label}</button>)}</div>{panels.map((panel) => <div key={panel.id} id={`report-panel-${panel.id}`} role="tabpanel" tabIndex={0} aria-labelledby={`report-tab-${panel.id}`} hidden={tab !== panel.id}>{panel.content}</div>)}</div>;
}
