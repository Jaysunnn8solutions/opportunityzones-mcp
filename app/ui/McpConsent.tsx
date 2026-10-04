"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { TERMS_VERSION } from "@/lib/content/siteTerms";
import type { McpConnectionSummary } from "@/lib/access/consent";
import { useAccount } from "./AccountAccess";

const date = (value: number) => new Date(value).toLocaleString("en-US");
export default function McpConsent() {
  const { account, refresh, resumeAfterSignIn } = useAccount();
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("My chat app");
  const [replace, setReplace] = useState<string>();
  const [credential, setCredential] = useState<{ id: string; token: string; expires: number; owner?: string } | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [listing, setListing] = useState<{ owner?: string; connections: McpConnectionSummary[] } | null>(null);
  const [message, setMessage] = useState("");
  const [endpoint, setEndpoint] = useState("/mcp");
  useEffect(() => { const frame = requestAnimationFrame(() => setEndpoint(`${window.location.origin}/mcp`)); return () => cancelAnimationFrame(frame); }, []);
  const checkbox = useRef<HTMLInputElement>(null);
  const submit = useRef<HTMLButtonElement>(null);
  const connections = account.member && listing && listing.owner === account.id ? listing.connections : [];
  const visibleCredential = account.member && credential?.owner === account.id ? credential : null;
  const load = useCallback(async (signal?: AbortSignal) => {
    if (!account.member) return;
    const response = await fetch("/api/mcp-connections", { signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Connections could not be loaded.");
    if (!signal?.aborted) setListing({ owner: account.id, connections: data.connections });
  }, [account.member, account.id]);
  useEffect(() => {
    const controller = new AbortController();
    const frame = requestAnimationFrame(() => {
      if (!account.member) { setCredential(null); setRevealed(false); setReplace(undefined); }
      void load(controller.signal).catch((error) => { if (!controller.signal.aborted) setMessage(error.message); });
    });
    return () => { cancelAnimationFrame(frame); controller.abort(); };
  }, [load, account.member]);
  async function action(body: unknown) {
    const response = await fetch("/api/mcp-connections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) { if (response.status === 401) void refresh(); throw new Error(data.error ?? "Connection action unavailable."); }
    return data;
  }
  function signIn() {
    resumeAfterSignIn(() => { setMessage("Signed in. Review your selection, then accept the terms and create your connection."); submit.current?.focus(); });
  }
  async function issue() {
    if (!accepted || busy) return;
    if (!account.member || !account.termsCurrent) { signIn(); return; }
    setBusy(true); setMessage("");
    try {
      const result = await action({ action: "create", label, replace, accepted: true, version: TERMS_VERSION });
      setCredential({ ...result, owner: account.id }); setRevealed(false); setReplace(undefined); setAccepted(false);
      setMessage("Acceptance recorded. Save this token privately now; it cannot be retrieved later. You can revoke or replace it from Connected apps.");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not create the connection."); }
    finally { setBusy(false); }
  }
  async function revoke(id?: string) {
    setBusy(true); setMessage("");
    try {
      await action(id ? { action: "revoke", id } : { action: "revoke-all" });
      if (!id || credential?.id === id) setCredential(null);
      if (!id || replace === id) { setReplace(undefined); setAccepted(false); }
      setMessage(id ? "Connection revoked. Its token can no longer authorize requests." : "All MCP connections revoked.");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not revoke access. Try again."); }
    finally { setBusy(false); }
  }
  return <section className="mcp-consent" aria-labelledby="mcp-consent-heading">
    <h2 id="mcp-consent-heading">Connected apps / MCP</h2>
    <div className="connection-guide"><h3>Connect your chat app</h3><ol><li>Create a named connection below and save the token privately.</li><li>In your chat app’s MCP settings, choose a remote HTTP server and use this address: <code>{endpoint}</code> <button type="button" className="link" onClick={async () => { try { await navigator.clipboard.writeText(endpoint); setMessage("MCP server address copied."); } catch { setMessage("Copy unavailable. Select the server address and copy it manually."); } }}>Copy server address</button>.</li><li>If the client supports a private bearer-token setting, enter the token there. If it only offers browser sign-in, follow the <Link href="/use-with-claude">supported connection instructions</Link>; do not put tokens in chat messages.</li><li>Ask your chat app to run <code>usage_status</code> to confirm the full connection.</li></ol><p><strong>Permissions:</strong> bounded, read-only place research. Connections cannot change your account or automatically download files.</p></div>
    <p>A free research account is required to create and manage MCP connections. Each token permits limited informational research. We record your account identifier, connection, terms version and document fingerprint, acceptance time, expiration, and last-used time. We do not record your questions or tool arguments.</p>
    <form onSubmit={(event) => { event.preventDefault(); void issue(); }}>
      <label className="scope-field">Connection name<input value={label} maxLength={60} required disabled={busy} onChange={(event) => setLabel(event.target.value)} autoComplete="off" /></label>
      <p className="hint">Use a simple app label, such as “Desktop chat.” Do not include personal or research information.</p>
      {replace && <p>Replacing this connection immediately invalidates its previous token. <button type="button" className="link" disabled={busy} onClick={() => { setReplace(undefined); setAccepted(false); }}>Cancel replacement</button></p>}
      <label className="consent-checkbox"><input ref={checkbox} type="checkbox" checked={accepted} disabled={busy} onChange={(event) => setAccepted(event.target.checked)} required /><span>I have read and agree to the <Link href="/legal#terms">Terms of Use</Link> and acknowledge the <Link href="/legal#disclaimer">Disclaimer</Link> and <Link href="/legal#privacy">Privacy Notice</Link> for MCP use, version {TERMS_VERSION}.</span></label>
      {accepted && !account.member && <p role="status">Sign in to continue, or create a free account if you haven’t already. Your selection stays here; no token is created until you return and confirm.</p>}
      <button ref={submit} type="submit" className="button" disabled={!accepted || busy || !label.trim()}>{busy ? "Working…" : !account.member ? "Sign in / create a free account" : !account.termsCurrent ? "Review account terms" : replace ? "Accept terms and replace MCP token" : "Accept terms and create MCP token"}</button>
    </form>
    {visibleCredential && <div className="lab-card">
      <h3>Save your new token</h3>
      <label className="scope-field">Private MCP access token<input type={revealed ? "text" : "password"} value={visibleCredential.token} readOnly autoComplete="off" spellCheck={false} /></label>
      <div className="answer-actions"><button className="button secondary" type="button" aria-pressed={revealed} onClick={() => setRevealed(!revealed)}>{revealed ? "Hide token" : "Show token"}</button><button className="button secondary" type="button" onClick={async () => { try { await navigator.clipboard.writeText(visibleCredential.token); setMessage("Token copied. Paste it only into your client’s private credential settings."); } catch { setMessage("Copy unavailable. Show the token and copy it manually into private credential settings."); } }}>Copy token</button><button className="button secondary" type="button" onClick={() => { setCredential(null); setRevealed(false); }}>Dismiss token</button></div>
      <p>Expires {date(visibleCredential.expires)}. Store it in your client’s private credential settings or a password manager. Never paste it into a chat, shared file, URL, or repository. This page keeps it only in memory; the service stores only its hash.</p>
    </div>}
    {account.member && <section aria-labelledby="mcp-connections-list"><h3 id="mcp-connections-list">Your connections</h3>
      <p className="hint">Up to five active connections; ten tokens created or replaced per 24 hours. All connections share your account’s MCP request allowance. Revocation stops future requests; it cannot recall data already returned.</p>
      <button type="button" className="button secondary" disabled={busy} onClick={() => void load().catch((error) => setMessage(error.message))}>Refresh connections</button>
      {connections.length ? <ul className="mcp-connection-list">{connections.map((connection) => <li className="lab-card" key={connection.id}>
        <h4>{connection.label} · {connection.status.replace("-", " ")}</h4>
        <dl><dt>Created</dt><dd>{date(connection.created)}</dd><dt>Terms accepted</dt><dd>{date(connection.accepted)} · {connection.version}</dd><dt>Expires</dt><dd>{date(connection.expires)}</dd><dt>Last used</dt><dd>{connection.lastUsed ? date(connection.lastUsed) : "Not yet used"}</dd></dl>
        <p><strong>Permissions:</strong> Read-only research · shared account limits</p><button type="button" className="button secondary" disabled={busy} onClick={async () => { setBusy(true); setMessage(""); try { const result = await action({ action: "test", id: connection.id }); setMessage(result.message); await refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "Connection check unavailable."); } finally { setBusy(false); } }}>Test connection</button>
        <details><summary>Acceptance record</summary><p>Connection ID: <code>{connection.id}</code></p><p>Accepted document fingerprint: <code style={{ overflowWrap: "anywhere" }}>{connection.digest}</code></p></details>
        <div className="answer-actions"><button type="button" className="button secondary" disabled={busy} onClick={() => { setReplace(connection.id); setLabel(connection.label); setAccepted(false); checkbox.current?.focus(); checkbox.current?.scrollIntoView({ block: "center" }); }}>Replace token</button><button type="button" className="button secondary" disabled={busy || connection.status === "revoked"} onClick={() => void revoke(connection.id)} aria-label={`Revoke ${connection.label}`}>Revoke connection</button></div>
      </li>)}</ul> : <p>{listing?.owner === account.id ? "No MCP connections yet." : "Loading connections…"}</p>}
      <button type="button" className="button secondary" disabled={busy || !connections.some((c) => c.status !== "revoked")} onClick={() => void revoke()}>Revoke all MCP connections</button>
      <p className="hint">Acceptance and connection records are retained for up to 90 days after acceptance. Deleting your account removes its connections and MCP acceptance records and invalidates its tokens.</p>
    </section>}
    <p role="status" aria-live="polite">{message}</p>
  </section>;
}
