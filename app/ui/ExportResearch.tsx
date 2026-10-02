"use client";
import { useId, useRef, useState } from "react";
import type { ExportInput } from "@/lib/access/exports";
import { MEASURES } from "@/lib/research/measures";
import { useAccount } from "./AccountAccess";
import Link from "next/link";
import { parseFilters } from "@/lib/explore/filter";
import FieldSets from "./FieldSets";
import { useResearchRecipe } from "./useResearchRecipe";

type ExportProps = { input: ExportInput; label?: string; disabled?: boolean; print?: boolean };
export default function ExportResearch(props: ExportProps) {
  return <ExportDialog key={JSON.stringify(props.input)} {...props} />;
}
function ExportDialog({ input, label = "Export research", disabled = false, print = false }: ExportProps) {
  const { account, resumeAfterSignIn, refresh } = useAccount();
  const recipe = useResearchRecipe();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [columns, setColumns] = useState<string[]>(input.columns ?? ["population", "median_household_income", "median_home_value"]);
  const [format, setFormat] = useState<"zip" | "json">(input.format ?? "zip");
  const [subset, setSubset] = useState(false);
  const [preview, setPreview] = useState<{ total: number; selected: number; version: string; missing: Record<string, number>; fields: number; sample?: { columns: Array<{ name: string; unit: string }>; rows: Record<string, unknown>[] }; allowance?: { available: boolean; message: string; resetsAt: string | null } } | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const retry = useRef<{ key: string; id: string } | null>(null);
  const settingsOnly = !!input.research;
  const requestInput = { ...input, columns, format, ...(subset ? { limit: 500 } : {}) };
  const requestKey = JSON.stringify(requestInput);
  const [previewKey, setPreviewKey] = useState("");
  const validPreview = previewKey === requestKey && !!preview;
  const usage = account.usage ?? [];
  const used = (action: string, days: number) => usage.filter((entry) => entry.action === action && entry.at > (account.asOf ?? 0) - days * 86_400_000).reduce((sum, entry) => sum + entry.amount, 0);
  async function prepare() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/exports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preview: true, input: requestInput }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error);
      setPreview(body); setPreviewKey(requestKey); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Preview unavailable."); }
    finally { setBusy(false); }
  }
  async function download() {
    if (!validPreview || !preview) return;
    setBusy(true); setMessage("");
    const pinned = { ...requestInput, version: preview.version };
    const key = JSON.stringify(pinned);
    if (retry.current?.key !== key) retry.current = { key, id: crypto.randomUUID() };
    try {
      const response = await fetch("/api/exports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: retry.current.id, input: pinned }) });
      if (!response.ok) { const result = await response.json(); throw new Error(`${result.error}${response.status === 429 && result.retryAfter ? ` Available after ${new Date(Date.now() + result.retryAfter * 1000).toLocaleString("en-US")}.` : ""}`); }
      const blob = await response.blob();
      if (print) { dialog.current?.close(); window.print(); }
      else {
        const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = settingsOnly ? "place-research.json" : input.dictionaryOnly ? `research-dictionary.${format}` : format === "json" ? "area-research.json" : "area-research.zip"; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        setMessage("Your research file is ready. Retrying this same file within one hour does not consume another export allowance.");
        setDownloaded(true);
      }
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Download unavailable. You can retry without changing your selections."); }
    finally { setBusy(false); }
  }
  return <><button type="button" className="button secondary" disabled={disabled} onClick={() => { setMessage(""); dialog.current?.showModal(); }}>{label}</button><dialog ref={dialog} className="export-dialog" aria-labelledby={titleId}><header><h2 id={titleId}>{settingsOnly ? "Save research selections" : print ? "Prepare research brief" : "Export your research"}</h2><button type="button" className="button secondary" onClick={() => dialog.current?.close()}>Close</button></header>
    <p>Use published facts in your own research. Source notes, data dates, definitions, and limitations accompany data downloads. Exact searched addresses and coordinates are excluded.</p>
    {!settingsOnly && !input.dictionaryOnly && <p className="hint">The ZIP package includes report.html: an offline report with headings, labeled tables, and source links for keyboard and screen-reader use. Browser-generated PDFs have not been verified as tagged accessible PDFs.</p>}
    <p className="hint">Free account limits: 500 rows per file; 3 exports / 1,000 rows per rolling 24 hours; 10 exports / 5,000 rows per rolling 30 days. Dictionary downloads consume one export and zero rows. Settings-only research files have a separate limit of 20 per day.</p>
    {!account.member || !account.termsCurrent ? <><p>Sign in to download. You will return to this export with your fields and selections preserved. Nothing downloads automatically.</p><button type="button" className="button" onClick={() => { dialog.current?.close(); resumeAfterSignIn(() => dialog.current?.showModal()); }}>Free account / sign in</button></> : <>
    {!settingsOnly && <p className="hint">Remaining allowance: {Math.max(0, 3 - used("exports", 1))} exports / {Math.max(0, 1000 - used("export-rows", 1))} rows in 24 hours; {Math.max(0, 10 - used("exports", 30))} exports / {Math.max(0, 5000 - used("export-rows", 30))} rows in 30 days. Shared service capacity also applies.</p>}
    {!settingsOnly && <><FieldSets onChange={setColumns} /><fieldset className="export-columns"><legend>Published measures</legend>{MEASURES.map((m) => <label key={m.column}><input type="checkbox" checked={columns.includes(m.column)} onChange={(event) => setColumns((current) => event.target.checked ? [...current, m.column] : current.filter((key) => key !== m.column))} />{m.label}</label>)}</fieldset><label className="scope-field">File format<select value={format} onChange={(e) => setFormat(e.target.value as "zip" | "json")}><option value="zip">CSV package with sources (.zip)</option><option value="json">Typed data and sources (.json)</option></select></label>{!input.dictionaryOnly && !input.geoids?.length && <label className="export-subset"><input type="checkbox" checked={subset} onChange={(e) => setSubset(e.target.checked)} />Explicitly select the first 500 matches in the current sort order (or all, if fewer).</label>}</>}
    <div className="answer-actions"><button type="button" className="button secondary" disabled={busy || (!settingsOnly && !columns.length)} onClick={() => void prepare()}>Preview export</button><button type="button" className="button" disabled={busy || !validPreview || (!preview?.selected && !input.dictionaryOnly) || (!settingsOnly && preview.selected > 500)} onClick={() => void download()}>{print ? "Print brief / save PDF" : "Download"}</button></div>
    {validPreview && preview && <div className="export-preview" role="status"><strong>{input.dictionaryOnly ? `Dictionary only · ${preview.fields} fields · no tract rows` : `${preview.selected.toLocaleString("en-US")} selected of ${preview.total.toLocaleString("en-US")} tracts${!settingsOnly ? ` · ${preview.fields} fields` : ""}`}</strong><p>Dataset version: {preview.version}</p>{preview.allowance && <p>{preview.allowance.message}{preview.allowance.resetsAt && ` Next capacity may be available ${new Date(preview.allowance.resetsAt).toLocaleString("en-US")}.`} Allowances are checked again at download time; exact prepared-file retries have a separate one-hour window.</p>}{!settingsOnly && preview.selected > 500 && <p>Narrow your criteria or explicitly select a subset before downloading.</p>}{Object.entries(preview.missing).some(([, count]) => count > 0) && <section><h3>Missing values</h3><ul>{Object.entries(preview.missing).map(([column, count]) => <li key={column}>{MEASURES.find((m) => m.column === column)?.label}: {count} unavailable</li>)}</ul></section>}</div>}
    {validPreview && preview.sample && <section className="export-sample"><h3>Sample rows & file structure</h3><p className="hint">First {preview.sample.rows.length} rows in your chosen order. Preview uses no download allowance. GEOIDs remain text with leading zeros; missing values export as empty CSV cells or JSON null. Shares use fractions (0.1 = 10%).</p><div className="table-wrap" role="region" aria-label="Export sample, scroll horizontally" tabIndex={0}><table className="rules"><caption>Raw values as they will appear in the file</caption><thead><tr>{preview.sample.columns.map((c) => <th scope="col" key={c.name}>{c.name}<small>{c.unit}</small></th>)}</tr></thead><tbody>{preview.sample.rows.map((row, index) => <tr key={index}>{preview.sample!.columns.map((c) => <td key={c.name}>{row[c.name] == null ? "Unavailable" : String(row[c.name])}</td>)}</tr>)}</tbody></table></div></section>}
    </>}{busy && <p role="status">Preparing published data…</p>}{message && <p role="status">{message}</p>}{downloaded && !settingsOnly && <Link href="/workbench#tab=prepare" onClick={() => { recipe.setIds(input.geoids ?? []); if (input.state) recipe.setState(input.state); recipe.setFilters(parseFilters(JSON.stringify(input.filters ?? {}))); if (input.sort) recipe.setSort(input.sort); recipe.setKeys(columns as typeof recipe.keys); recipe.setFormat(format); window.dispatchEvent(new CustomEvent("research-workspace-tab", { detail: "prepare" })); dialog.current?.close(); }}>Save or refine these export settings →</Link>}<p className="hint">Informational only, not investment, tax or legal advice. Higher or lower values do not establish suitability.</p>
  </dialog></>;
}
