import { randomUUID } from "node:crypto";
import { db } from "./store";
export const SECURITY_LABELS = {
  "sign-in": "Signed in", "passkey-added": "Passkey added", "passkey-removed": "Passkey removed",
  "recovery-used": "Recovery code used", "recovery-replaced": "Recovery codes replaced",
  "sessions-revoked": "Website sessions signed out", "mcp-created": "Chat connection created or replaced",
  "mcp-revoked": "Chat connection revoked", "operator-revoked": "Access revoked by operator",
} as const;
export type SecurityCode = keyof typeof SECURITY_LABELS;
/** Successful security changes only. No addresses, IPs, user agents, tokens, or queries. */
export async function securityEvent(account: string, code: SecurityCode, now = Date.now()) {
  await db().prepare("INSERT INTO security_events VALUES(?,?,?,?)").run(randomUUID(), account, code, now);
}
