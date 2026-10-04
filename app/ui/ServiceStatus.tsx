"use client";
import { useEffect, useState } from "react";
type Status = { checked: number; database: string; services: Record<string, string> };
export default function ServiceStatus() {
  const [status, setStatus] = useState<Status | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(true);
  async function refresh() {
    setBusy(true); setError("");
    try { const response = await fetch("/api/status"); if (!response.ok) throw new Error(); setStatus(await response.json()); }
    catch { setError("Status could not be loaded. Your selections are unchanged. Try again when your connection returns."); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/status", { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error();
      const value = await response.json(); if (!controller.signal.aborted) setStatus(value);
    }).catch(() => { if (!controller.signal.aborted) setError("Status could not be loaded. Try again when your connection returns."); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, []);
  return <section className="lab-card"><h2>Research services</h2><p>Local service checks; upstream agencies and map tile availability are not continuously monitored. Accepting requests does not guarantee available allowance.</p><button className="button secondary" disabled={busy} onClick={() => void refresh()}>{busy ? "Checking…" : "Refresh status"}</button><p role="status">{error}</p>{status && <><p>Checked {new Date(status.checked).toLocaleString("en-US")} · Database {status.database}</p><dl className="service-status-grid">{Object.entries(status.services).map(([name, value]) => <div key={name}><dt>{name === "mcp" ? "Chat / MCP" : name === "signup" ? "New accounts" : "New exports"}</dt><dd>{value}</dd></div>)}</dl></>}</section>;
}
