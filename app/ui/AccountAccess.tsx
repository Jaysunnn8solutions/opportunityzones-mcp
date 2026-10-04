"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import { TERMS_VERSION } from "@/lib/content/siteTerms";
import type { AllowanceSummary } from "@/lib/access/allowance";
import AccountUsage from "./AccountUsage";
import { AccountSecurityDetails, McpUsage } from "./AccountCenter";

type Account = { operator?: boolean; securityEvents?: Array<{ code: string; at: number }>; member: boolean; id?: string; termsCurrent?: boolean; configured?: boolean; asOf?: number; usage?: Array<{ action: string; at: number; amount: number }>; allowances?: AllowanceSummary; credentials?: { count: number }; passkeys?: Array<{ id: string; label?: string | null; created?: number | null; lastUsed?: number | null }>; sessions?: Array<{ id: string; created: number | null; lastUsed: number | null; expires: number; current: number }>; recovery?: { remaining: number }; acceptances?: Array<{ version: string; accepted: number }>; downloads?: Array<{ id: string; filename: string; mime: string; rows: number; at: number }>; mcpUsage?: Array<{ name: string; used: number; limit: number; remaining: number; nextReleaseAt: string | null }> };
const Context = createContext<{ account: Account; refresh: () => Promise<void>; open: () => void; resumeAfterSignIn: (action: () => void) => void; settings?: React.ReactNode }>({ account: { member: false }, refresh: async () => {}, open: () => {}, resumeAfterSignIn: () => {} });
export const useAccount = () => useContext(Context);
export async function accountAction(body: unknown) {
  const response = await fetch("/api/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Account action unavailable.");
  return data;
}
export function AccountAccess({ children }: { children: React.ReactNode }) {
  const accountPage = usePathname() === "/account";
  const [account, setAccount] = useState<Account>({ member: false });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [codes, setCodes] = useState<string[]>([]);
  const [recovery, setRecovery] = useState("");
  const [deletion, setDeletion] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const continuation = useRef<(() => void) | null>(null);
  useEffect(() => {
    // Clear one-time recovery material when leaving the dedicated settings page.
    return () => { setCodes([]); setRecovery(""); setDeletion(""); continuation.current = null; };
  }, [accountPage]);
  const refresh = useCallback(async () => { try { const response = await fetch("/api/account"); if (response.ok) setAccount(await response.json()); } catch { /* Public browsing remains available. */ } }, []);
  useEffect(() => { const frame = requestAnimationFrame(() => void refresh()); return () => cancelAnimationFrame(frame); }, [refresh, accountPage]);
  useEffect(() => {
    if (busy || !account.member || !account.termsCurrent || !continuation.current) return;
    const action = continuation.current;
    continuation.current = null;
    dialog.current?.close();
    const frame = requestAnimationFrame(action);
    return () => cancelAnimationFrame(frame);
  }, [account.member, account.termsCurrent, busy]);
  async function run(action: () => Promise<void>) {
    setBusy(true); setMessage("");
    try { await action(); await refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "The action could not be completed."); }
    finally { setBusy(false); }
  }
  async function passkey(kind: "register" | "login" | "add") {
    const { options } = await accountAction({ action: "options", kind, terms: agreed ? TERMS_VERSION : undefined });
    const response = kind === "login" ? await startAuthentication({ optionsJSON: options }) : await startRegistration({ optionsJSON: options });
    await accountAction({ action: "verify", response, terms: agreed ? TERMS_VERSION : undefined });
    if (kind !== "add") setCodes([]);
    setMessage(kind === "add" ? "Additional passkey saved." : "You are signed in. Your research selections are still here.");
  }
  const open = () => { setMessage(""); void refresh(); if (accountPage) document.getElementById("account-title")?.focus(); else dialog.current?.showModal(); };
  const resumeAfterSignIn = (action: () => void) => { continuation.current = action; open(); };
  const settings = <>
    <header><div><p className="eyebrow">Free research access</p><h2 id="account-title" tabIndex={-1}>{account.member ? "Your research account" : "Sign in or create a free account"}</h2></div>{!accountPage && <button className="button secondary" onClick={() => dialog.current?.close()}>Close</button>}</header>
    <p>Explore the public map without an account. A free account adds numeric filters, comparisons of up to 25 tracts, limited research downloads, and managed MCP connections. No payment details, name, or email required.</p>
    <p className="hint">A passkey uses your device or password manager. This site stores its public credential, account identifier, session, and usage counts. It never receives your device PIN or biometric data.</p>
    {account.member ? <><div id="account-download-usage"><AccountUsage allowances={account.allowances} asOf={account.asOf} />{accountPage && <McpUsage />}</div><button disabled={busy} className="button secondary" onClick={() => void run(async () => {})}>Refresh usage</button><div className="answer-actions"><button disabled={busy} className="button secondary" onClick={() => void run(() => passkey("add"))}>Add another passkey</button><button disabled={busy} className="button secondary" onClick={() => void run(async () => { const result = await accountAction({ action: "recovery-codes" }); setCodes(result.codes); })}>Create recovery codes</button><button disabled={busy} className="button secondary" onClick={() => void run(async () => { await accountAction({ action: "logout" }); setCodes([]); })}>Sign out</button></div>
    <p className="hint">Keep a second passkey or recovery codes. Without either, this site cannot recover your account. New recovery codes replace earlier codes.</p>
    <section aria-labelledby="account-security"><h3 id="account-security">Passkeys and security</h3><p>Security changes require verification within the last ten minutes. Replacing a passkey means adding the new one, then removing the old one.</p><div className="answer-actions"><button className="button secondary" disabled={busy} onClick={() => void run(() => passkey("login"))}>Verify identity with a passkey</button><button className="button secondary" disabled={busy} onClick={() => void run(async () => { await accountAction({ action: "logout-others" }); setMessage("Other website sessions signed out. Manage MCP tokens separately below."); })}>Sign out other website sessions</button></div><AccountSecurityDetails /><p className="hint">Your last passkey cannot be removed. Manage the underlying passkey in your device or password manager; removing it here disables its access to this account.</p></section>
    {!accountPage && <p><Link href="/account" onClick={() => dialog.current?.close()}>Open My account and connected apps →</Link></p>}
    {codes.length > 0 && <section className="recovery-codes"><h3>Save these codes privately</h3><p>Each code works once. They are shown only now and disappear when this panel closes.</p>{codes.map((code) => <code key={code}>{code}</code>)}</section>}
    <details id="account-deletion"><summary>Delete account</summary><p>Deletes the account, passkeys, sessions, recovery codes, account usage, MCP connections, and account-linked MCP acceptance records. All its MCP tokens stop working. Separate pseudonymous browser download counts remain for up to 30 days from each use, so deleting and recreating an account does not reset this browser’s allowance. Short-lived shared network protections also remain.</p><label>Type DELETE<input value={deletion} onChange={(e) => setDeletion(e.target.value)} autoComplete="off" /></label><button className="button secondary" disabled={busy || deletion !== "DELETE"} onClick={() => void run(async () => { await accountAction({ action: "delete", confirm: deletion }); setDeletion(""); setCodes([]); })}>Delete my account</button></details></> : <><div className="answer-actions"><button disabled={busy} className="button secondary" onClick={() => void run(() => passkey("login"))}>Sign in with a passkey</button></div><details><summary>Use a recovery code</summary><label>One-time recovery code<input value={recovery} onChange={(e) => setRecovery(e.target.value.trim())} autoComplete="off" type="password" /></label><button className="button secondary" disabled={busy || !recovery} onClick={() => void run(async () => { await accountAction({ action: "recover", code: recovery }); setRecovery(""); })}>Recover account</button></details></>}
    {(!account.member || !account.termsCurrent) && <><label className="consent-checkbox"><input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} /><span>I agree to the <Link href="/legal#terms" onClick={() => dialog.current?.close()}>Terms of Use</Link> and acknowledge the <Link href="/legal#privacy" onClick={() => dialog.current?.close()}>Privacy Notice</Link>, version {TERMS_VERSION}.</span></label><button disabled={busy || !agreed} className="button" onClick={() => void run(() => account.member ? accountAction({ action: "accept-terms", terms: TERMS_VERSION }).then(() => undefined) : passkey("register"))}>{account.member ? "Accept updated terms" : "Agree and create free account"}</button></>}
    {message && <p role="status" className="hint">{message}</p>}{busy && <p role="status">Complete the prompt on your device…</p>}
    <p className="hint">Passkeys need HTTPS, or localhost during development. On a local IP preview, open the same site at localhost to test signup. No account is needed to keep browsing.</p>
  </>;
  return <Context.Provider value={{ account, refresh, open, resumeAfterSignIn, settings }}>{children}{!accountPage && <dialog ref={dialog} className="account-dialog" aria-labelledby="account-title" onClose={() => { continuation.current = null; setCodes([]); setRecovery(""); setDeletion(""); }}>{settings}</dialog>}</Context.Provider>;
}
export function AccountSettings() { return <section className="lab-card account-settings">{useAccount().settings}</section>; }
export function AccountButton() { const { account, open } = useAccount(); return account.member ? <Link className="account-button" href="/account">My account</Link> : <button className="account-button" type="button" onClick={open}>Free account / sign in</button>; }
