"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { accountAction, useAccount } from "./AccountAccess";
import SecurityHistory from "./SecurityHistory";
import DevicePreferences from "./DevicePreferences";
import { PROJECT_STORAGE } from "./useResearchRecipe";
import { TERMS_VERSION } from "@/lib/content/siteTerms";

const date = (value?: number | string | null) => value == null ? "Not recorded" : new Date(value).toLocaleString("en-US");
export function AccountNavigation() {
  const { account } = useAccount();
  return <nav className="account-sections" aria-label="Account sections">{account.member ? <><a href="#account-download-usage">Usage</a><a href="#account-security">Security</a><a href="#account-downloads">Downloads</a></> : <a href="#account-title">Sign in</a>}<a href="#mcp-consent-heading">Connected apps</a><a href="#account-preferences">Device preferences</a><a href="#account-privacy">Privacy</a></nav>;
}
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function AccountSecurityDetails() {
  const { account, refresh } = useAccount();
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  async function run(body: unknown) {
    setBusy(true); setMessage("");
    try { await accountAction(body); await refresh(); setMessage("Security settings updated."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Security change unavailable."); }
    finally { setBusy(false); }
  }
  return <>
    <ul className="account-checklist"><li>{(account.credentials?.count ?? 0) > 1 ? "Backup passkey available" : "Add a backup passkey to avoid losing access"}</li><li>{account.recovery?.remaining ? `${account.recovery.remaining} unused recovery codes available` : "Create recovery codes and keep them privately"}</li></ul>
    <p className="hint">Use device labels, such as “Laptop.” Do not include names or private research details. Earlier passkeys may have no recorded creation date.</p>
    <div className="account-items">{account.passkeys?.map((key, index) => <PasskeyRow key={`${key.id}:${key.label}`} item={key} index={index} busy={busy} canRemove={(account.credentials?.count ?? 0) > 1} run={run} />)}</div>
    <h4>Active website sessions</h4><p className="hint">Activity is recorded approximately every five minutes. No device fingerprint or location is collected.</p>
    <ul className="account-items">{account.sessions?.map((session, index) => <li key={session.id}><strong>{session.current ? "This website session" : `Website session ${index + 1}`}</strong><p>Started {date(session.created)} · Last active {date(session.lastUsed)} · Expires {date(session.expires)}</p><button type="button" className="button secondary" disabled={busy} onClick={() => void run({ action: "revoke-session", id: session.id })}>Sign out {session.current ? "this session" : `session ${index + 1}`}</button></li>)}</ul>
    <p role="status">{message}</p>
  </>;
}
function PasskeyRow({ item, index, busy, canRemove, run }: { item: { id: string; label?: string | null; created?: number | null; lastUsed?: number | null }; index: number; busy: boolean; canRemove: boolean; run: (body: unknown) => Promise<void> }) {
  const [label, setLabel] = useState(item.label || `Passkey ${index + 1}`);
  return <article><label>Passkey {index + 1} name<input value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} autoComplete="off" /></label><p className="hint">Added {date(item.created)} · Last sign-in {date(item.lastUsed)} · Credential ending {item.id.slice(-8)}</p><div className="answer-actions"><button type="button" className="button secondary" disabled={busy || !label.trim()} onClick={() => void run({ action: "rename-passkey", id: item.id, label })}>Save passkey name</button><button type="button" className="button secondary" disabled={busy || !canRemove} onClick={() => void run({ action: "remove-passkey", id: item.id })} aria-label={`Remove passkey ending ${item.id.slice(-8)}`}>Remove</button></div></article>;
}
export function McpUsage() {
  const { account } = useAccount();
  const labels: Record<string, string> = { "mcp-calls": "Tool calls", "mcp-rows": "Rows returned", "mcp-bytes": "Response bytes" };
  return account.mcpUsage && <section className="account-usage"><h3>Chat / MCP usage · rolling 24 hours</h3><div className="usage-meters">{account.mcpUsage.map((item) => <div key={item.name}><strong>{labels[item.name] ?? item.name}</strong><p>{item.used.toLocaleString("en-US")} / {item.limit.toLocaleString("en-US")} used · {item.remaining.toLocaleString("en-US")} remaining</p><meter min={0} max={item.limit} value={Math.min(item.used, item.limit)} aria-label={`${labels[item.name] ?? item.name} used`} /><small>{item.nextReleaseAt ? `Usage begins expiring ${date(item.nextReleaseAt)}` : "No usage in this window"}</small></div>)}</div><p className="hint">All connected chat apps share these limits. Recent use carried over from this browser may also count after account deletion or re-registration. Website export allowances are shown separately above.</p></section>;
}
export default function AccountCenter() {
  const { account, refresh } = useAccount();
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [clear, setClear] = useState("");
  useEffect(() => { const announce = (event: Event) => setMessage((event as CustomEvent<string>).detail); window.addEventListener("account-notice", announce); return () => window.removeEventListener("account-notice", announce); }, []);
  async function download(id: string, filename: string) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/account/download", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      if (!response.ok) throw new Error((await response.json()).error);
      saveBlob(await response.blob(), filename); setMessage("File downloaded again without using another export allowance."); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Download unavailable."); }
    finally { setBusy(false); }
  }
  async function records() {
    setBusy(true); setMessage("");
    try { const result = await accountAction({ action: "account-records" }); saveBlob(new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }), "my-account-records.json"); setMessage("Account records downloaded. No research export allowance was used."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Account records unavailable."); }
    finally { setBusy(false); }
  }
  return <>
    {account.member && <section id="account-downloads" className="lab-card"><h2>Recent downloads</h2><p>Prepared files are available for one hour. Retrying one of these files uses no additional export or row allowance.</p><button className="button secondary" onClick={() => void refresh()}>Refresh downloads</button>
      {account.downloads?.length ? <ul className="account-items">{account.downloads.map((file) => <li key={file.id}><strong>{file.filename}</strong><p>{file.rows.toLocaleString("en-US")} tract rows · {file.mime === "application/zip" ? "ZIP / CSV package" : "JSON"}<br />Created {date(file.at)} · Expires {date(file.at + 3_600_000)}</p><button type="button" className="button secondary" disabled={busy} onClick={() => void download(file.id, file.filename)}>Download again</button></li>)}</ul> : <p>No files available in the one-hour retry window. Older files have been removed; copies you downloaded remain on your device.</p>}
    </section>}
    <SecurityHistory />
    <DevicePreferences />
    <section id="account-privacy" className="lab-card"><h2>Privacy & account records</h2><p>Account storage contains access credentials, security metadata, acceptance records, and usage counts. Device preferences, saved projects, and notes stay in your browser. <Link href="/legal#privacy">Read the privacy notice</Link>.</p>
      {account.member && <><h3>Terms acceptance</h3><p>Current version: {TERMS_VERSION} · {account.termsCurrent ? "Accepted" : "Review required"}</p>{account.acceptances?.length ? <ul>{account.acceptances.map((item) => <li key={item.version}>{item.version} · Accepted {date(item.accepted)}</li>)}</ul> : <p className="hint">Earlier account acceptance timestamps were not recorded. Connection-specific acceptance records appear under Connected apps.</p>}<button type="button" className="button secondary" disabled={busy} onClick={() => void records()}>Download my account records</button><p className="hint">Requires passkey verification within the last ten minutes. The file excludes private tokens, recovery secrets, and research files.</p><Link href="#account-deletion" onClick={() => { const panel = document.getElementById("account-deletion"); if (panel instanceof HTMLDetailsElement) panel.open = true; }}>Delete my account →</Link></>}
      <h3>Clear research saved on this device</h3><p>Removes saved projects and notes from this browser and clears the current tab’s research selection. This does not delete your account, change allowances, or remove downloaded files. Other open tabs may still contain unsaved research.</p>
      <label className="scope-field">Type CLEAR to confirm<input value={clear} onChange={(e) => setClear(e.target.value)} autoComplete="off" /></label><button type="button" className="button secondary" disabled={clear !== "CLEAR"} onClick={() => { try { localStorage.removeItem(PROJECT_STORAGE); window.dispatchEvent(new Event("research-projects-changed")); window.dispatchEvent(new Event("research-clear")); setClear(""); setMessage("Saved research removed from this browser; current selections cleared."); } catch { setMessage("Browser storage could not be cleared. Use the browser’s site-data settings."); } }}>Clear device research</button>
    </section><p role="status" className="account-notice">{message}</p>
  </>;
}
