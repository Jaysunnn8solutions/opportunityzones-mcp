"use client";
import Link from "next/link";
import { useState } from "react";
import { useAccount } from "./AccountAccess";
import type { operationsStatus } from "@/lib/access/operations";
type Status = Awaited<ReturnType<typeof operationsStatus>>;
export default function OperatorConsole() {
  const { account } = useAccount();
  const [status, setStatus] = useState<Status | null>(null), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const [target, setTarget] = useState(""), [action, setAction] = useState("revoke"), [confirm, setConfirm] = useState("");
  async function request(body?: unknown) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/operator", { cache: "no-store", ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
      const value = await response.json(); if (!response.ok) throw new Error(value.error);
      setStatus(value); setConfirm(""); setMessage(body ? "Change recorded in the operator audit log." : "Status refreshed.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Operator service unavailable."); }
    finally { setBusy(false); }
  }
  if (!account.operator) return <p>Access requires a separately authorized operator account. <Link href="/account">Go to My account</Link>.</p>;
  return <><p>Requires identity verification within the last ten minutes. <Link href="/account#account-security">Verify with a passkey</Link>.</p><button className="button" disabled={busy} onClick={() => void request()}>Load operator status</button><p role="status">{message}</p>
    {status && <><section className="lab-card"><h2>Service controls</h2><p>Read at {new Date(status.asOf).toLocaleString("en-US")}. No automatic polling.</p><ul className="account-items">{Object.entries(status.paused).map(([service, paused]) => <li key={service}><strong>{service}: {paused ? "paused" : "accepting requests"}</strong><button className="button secondary" disabled={busy} onClick={() => void request({ action: paused ? "resume" : "pause", service })}>{paused ? "Resume" : "Pause"} {service}</button></li>)}</ul><p>Pausing new exports preserves the one-hour retry window. Pausing signups leaves existing sign-ins available.</p></section>
      <section className="lab-card"><h2>Capacity & configuration</h2><p>Accounts: {Number(status.accounts?.count ?? 0).toLocaleString("en-US")} · Temporary files: {Number(status.exports?.count ?? 0)} · File bytes: {Number(status.exports?.bytes ?? 0).toLocaleString("en-US")}</p><p>{status.storage}: {status.storageNote}</p><p>Trusted proxy: {status.proxy.configured ? status.proxy.verified ? "marked verified by operator" : "configured; verification still required" : "not configured; shared network allowance"}. Header: {status.proxy.header ?? "none"}.</p><Link href="/status">Dataset dates & public service status</Link></section>
      <section className="lab-card"><h2>Service usage · last 24 hours</h2><div className="table-wrap"><table><thead><tr><th>Service</th><th>Counter</th><th>Used</th></tr></thead><tbody>{status.usage.map((row, i) => <tr key={i}><td>{String(row.subject)}</td><td>{String(row.action)}</td><td>{Number(row.used).toLocaleString("en-US")}</td></tr>)}</tbody></table></div><h3>MCP failure categories · last 24 hours</h3>{status.failures.length ? <ul>{status.failures.map((row, i) => <li key={i}>{String(row.code)}: {Number(row.count)}</li>)}</ul> : <p>No recorded MCP failures in this window.</p>}</section>
      <section className="lab-card"><h2>Account access control</h2><p>Use an exact account ID supplied through support. Suspension signs out website sessions and permanently revokes existing chat tokens. Restoring access does not reactivate those tokens.</p><label>Account ID<input value={target} maxLength={64} onChange={(e) => setTarget(e.target.value)} /></label><label>Action<select value={action} onChange={(e) => setAction(e.target.value)}><option value="revoke">Revoke sessions and chat tokens</option><option value="suspend">Suspend account</option><option value="restore">Restore account access</option></select></label><label>Type CONFIRM<input value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label><button className="button secondary" disabled={busy || !target || confirm !== "CONFIRM"} onClick={() => void request({ action, target, confirm })}>Apply account change</button></section>
      <section className="lab-card"><h2>Operator audit · latest 50 events</h2><p>Retained for 90 days. Deleted accounts are detached from the log.</p><ul>{status.audit.map((row, i) => <li key={i}>{new Date(Number(row.at)).toLocaleString("en-US")} · {String(row.action)} · Operator {String(row.actor ?? "removed")} {row.target ? `· Account ${String(row.target)}` : ""}</li>)}</ul></section></>}
  </>;
}
