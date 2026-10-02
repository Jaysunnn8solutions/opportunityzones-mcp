"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount } from "./AccountAccess";
import { TERMS_VERSION } from "@/lib/content/siteTerms";
import { DISCLAIMER } from "@/lib/client/presentation";
export default function OAuthConsent({ parameters }: { parameters: Record<string, string | string[] | undefined> }) {
  const { account, open } = useAccount();
  const [preview, setPreview] = useState<{ client: { name: string }; destination: string } | null>(null);
  const [error, setError] = useState(""); const [accepted, setAccepted] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/oauth/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parameters, preview: true }), signal: controller.signal }).then(async (response) => {
      const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Connection unavailable."); if (!controller.signal.aborted) setPreview(data);
    }).catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Connection unavailable."); });
    return () => controller.abort();
  }, [parameters]);
  async function approve() {
    if (!account.member || !account.termsCurrent) { open(); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/oauth/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parameters, accepted, version: TERMS_VERSION }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Authorization failed.");
      window.location.assign(data.redirect);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Authorization failed."); setBusy(false); }
  }
  return <section aria-label="Authorize your research client">
    {preview ? <><h2>{preview.client.name}</h2><p>This client requests permission to read published place data through your research account. It cannot download files, read local project notes, change your account, or make investments.</p><p><strong>Return destination:</strong> {preview.destination}</p><p className="hint">The client supplies its name. Confirm the destination belongs to the app you intended to connect.</p>
      <p>Access expires after one hour. You can revoke it sooner from <Link href="/account">your account</Link>. Reconnecting requires approval again; usage limits apply across all connections.</p>
      <details><summary>Review terms, disclaimer, and privacy notice</summary><p><Link href="/legal" target="_blank" rel="noreferrer">Read the complete agreement</Link>. Your acceptance is recorded with the account, connection, time, terms version, and document fingerprint.</p><p>{DISCLAIMER}</p></details>
      <label className="consent-checkbox"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />I have read and accept the terms, disclaimer, and privacy notice, and authorize this client to read research data.</label>
      <div className="answer-actions"><button type="button" className="button" disabled={!accepted || busy} onClick={() => void approve()}>{busy ? "Connecting…" : !account.member || !account.termsCurrent ? "Sign in to proceed" : "Agree and connect"}</button><Link className="button secondary" href="/use-with-claude">Cancel</Link></div>
      {!account.member && <p>Sign in or create a free passkey account. Signing in does not approve the connection; return here and select Agree and connect.</p>}</> : !error && <p role="status">Checking the connection request…</p>}
    {error && <p className="error" role="alert">{error}</p>}<p className="note">{DISCLAIMER}</p>
  </section>;
}
