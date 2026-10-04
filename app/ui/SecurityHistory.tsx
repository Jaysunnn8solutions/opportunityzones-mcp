"use client";
import Link from "next/link";
import { useAccount } from "./AccountAccess";
const labels: Record<string, string> = { "sign-in": "Signed in", "passkey-added": "Passkey added", "passkey-removed": "Passkey removed", "recovery-used": "Recovery code used", "recovery-replaced": "Recovery codes replaced", "sessions-revoked": "Website sessions signed out", "mcp-created": "Chat connection created or replaced", "mcp-revoked": "Chat connection revoked", "operator-revoked": "Access revoked by operator" };
export default function SecurityHistory() {
  const { account } = useAccount();
  if (!account.member) return null;
  return <section className="lab-card" id="security-history"><h2>Recent security activity</h2><p>Account ID: <code style={{ overflowWrap: "anywhere" }}>{account.id}</code></p><p>Successful security changes from the last 30 days, up to 50 events. Research queries, addresses, and notes are not recorded. Activity before this feature was introduced is not available.</p>{account.securityEvents?.length ? <ul>{account.securityEvents.map((event, i) => <li key={i}><strong>{labels[event.code] ?? "Security change"}</strong> · {new Date(event.at).toLocaleString("en-US")}</li>)}</ul> : <p>No recorded security events in this window.</p>}<p>If an action is unfamiliar, <Link href="#account-security">verify your identity and sign out other sessions</Link>, then revoke unknown connected apps.</p>{account.operator && <Link href="/operator">Open operator console →</Link>}</section>;
}
