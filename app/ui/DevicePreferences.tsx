"use client";
import { useState, useSyncExternalStore } from "react";
import { DEFAULT_MEASURES, MEASURES, type MeasureKey } from "@/lib/research/measures";
export const PREFERENCE_STORAGE = "oz-preferences-v1";
export type Preferences = { theme: "system" | "light" | "dark"; textSize: "standard" | "large"; reducedMotion: boolean; format: "zip" | "json"; orientation: "columns" | "rows"; columns: MeasureKey[] };
export const DEFAULT_PREFERENCES: Preferences = { theme: "system", textSize: "standard", reducedMotion: false, format: "zip", orientation: "columns", columns: DEFAULT_MEASURES };
let cachedRaw: string | null = null, cached = DEFAULT_PREFERENCES;
export function readPreferences(): Preferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const raw = localStorage.getItem(PREFERENCE_STORAGE);
    if (raw === cachedRaw) return cached;
    cachedRaw = raw;
    if (!raw || raw.length > 4096) return cached = DEFAULT_PREFERENCES;
    const p = JSON.parse(raw);
    const columns = MEASURES.filter((m) => Array.isArray(p?.columns) && p.columns.includes(m.column)).map((m) => m.column);
    return cached = { theme: ["light", "dark"].includes(p?.theme) ? p.theme : "system", textSize: p?.textSize === "large" ? "large" : "standard", reducedMotion: p?.reducedMotion === true, format: p?.format === "json" ? "json" : "zip", orientation: p?.orientation === "rows" ? "rows" : "columns", columns: columns.length ? columns : DEFAULT_MEASURES };
  } catch { return cached = DEFAULT_PREFERENCES; }
}
function subscribe(callback: () => void) {
  window.addEventListener("oz-preferences-changed", callback); window.addEventListener("storage", callback);
  return () => { window.removeEventListener("oz-preferences-changed", callback); window.removeEventListener("storage", callback); };
}
export function usePreferences() { return useSyncExternalStore(subscribe, readPreferences, () => DEFAULT_PREFERENCES); }
export function applyPreferences() {
  const p = readPreferences(), root = document.documentElement;
  root.dataset.theme = p.theme; root.dataset.textSize = p.textSize; root.dataset.reducedMotion = String(p.reducedMotion);
}
export default function DevicePreferences() {
  const current = usePreferences();
  return <PreferencesForm key={JSON.stringify(current)} initial={current} />;
}
function PreferencesForm({ initial }: { initial: Preferences }) {
  const [draft, setDraft] = useState(initial), [message, setMessage] = useState("");
  function save(reset = false) {
    try {
      if (reset) localStorage.removeItem(PREFERENCE_STORAGE); else localStorage.setItem(PREFERENCE_STORAGE, JSON.stringify(draft));
      applyPreferences(); window.dispatchEvent(new Event("oz-preferences-changed"));
      // The saved form remounts when preferences change; announce outside that subtree.
      window.dispatchEvent(new CustomEvent("account-notice", { detail: reset ? "Device preferences reset." : "Preferences saved on this device." }));
    } catch { setMessage("Your browser could not save preferences. Allow local storage and try again."); }
  }
  return <section id="account-preferences" className="lab-card"><h2>Preferences on this device</h2><p>Saved only when you choose. Export defaults apply to new selections; explicit saved research settings take precedence.</p>
    <div className="lab-grid">
      <label>Theme<select value={draft.theme} onChange={(e) => setDraft({ ...draft, theme: e.target.value as Preferences["theme"] })}><option value="system">Use device setting</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
      <label>Reading text<select value={draft.textSize} onChange={(e) => setDraft({ ...draft, textSize: e.target.value as Preferences["textSize"] })}><option value="standard">Standard</option><option value="large">Larger</option></select></label>
      <label>Default export format<select value={draft.format} onChange={(e) => setDraft({ ...draft, format: e.target.value as Preferences["format"] })}><option value="zip">CSV package (.zip)</option><option value="json">JSON</option></select></label>
      <label>Comparison layout<select value={draft.orientation} onChange={(e) => setDraft({ ...draft, orientation: e.target.value as Preferences["orientation"] })}><option value="columns">Side by side</option><option value="rows">Tracts as rows</option></select></label>
    </div>
    <label className="consent-checkbox"><input type="checkbox" checked={draft.reducedMotion} onChange={(e) => setDraft({ ...draft, reducedMotion: e.target.checked })} />Reduce decorative motion (your device’s reduced-motion setting also applies)</label>
    <fieldset><legend>Default research fields</legend><div className="measure-choices">{MEASURES.map((m) => <label key={m.column}><input type="checkbox" checked={draft.columns.includes(m.column)} disabled={draft.columns.length === 1 && draft.columns.includes(m.column)} onChange={(e) => setDraft({ ...draft, columns: e.target.checked ? [...draft.columns, m.column] : draft.columns.filter((key) => key !== m.column) })} />{m.label}</label>)}</div></fieldset>
    <div className="answer-actions"><button type="button" className="button" onClick={() => save()}>Save device preferences</button><button type="button" className="button secondary" onClick={() => save(true)}>Reset preferences</button></div><p role="status">{message}</p>
  </section>;
}
