import { randomUUID } from "node:crypto";
import { db, DAY } from "./store";
import { usageStatus } from "./mcpPolicy";
import { listMcpConnections } from "./consent";

export async function accountDetails(account: string, currentSessionHash: string, now = Date.now()) {
  const store = db();
  // Add opaque public management IDs for legacy sessions; never send bearer-token hashes.
  const active = await store.prepare("SELECT hash FROM sessions WHERE account=? AND expires>?").all(account, now) as { hash: string }[];
  for (const item of active) await store.prepare("INSERT OR IGNORE INTO session_details(hash,id) VALUES(?,?)").run(item.hash, randomUUID());
  const passkeys = await store.prepare('SELECT c.id,d.label,d.created,d.last_used AS "lastUsed" FROM credentials c LEFT JOIN credential_details d ON d.credential=c.id WHERE c.account=? ORDER BY c.id').all(account);
  const sessions = await store.prepare('SELECT d.id,d.created,d.last_used AS "lastUsed",s.expires,CASE WHEN s.hash=? THEN 1 ELSE 0 END AS current FROM sessions s JOIN session_details d ON d.hash=s.hash WHERE s.account=? AND s.expires>? ORDER BY s.verified DESC').all(currentSessionHash, account, now);
  const recovery = await store.prepare("SELECT COUNT(*) AS remaining FROM recovery WHERE account=?").get(account);
  const acceptances = await store.prepare("SELECT version,accepted FROM account_acceptances WHERE account=? ORDER BY accepted DESC").all(account);
  const downloads = await store.prepare("SELECT id,filename,mime,rows,at FROM exports WHERE account=? AND at>? AND body IS NOT NULL ORDER BY at DESC LIMIT 30").all(account, now - 3_600_000);
  const securityEvents = await store.prepare("SELECT code,at FROM security_events WHERE account=? AND at>? ORDER BY at DESC LIMIT 50").all(account, now - 30 * DAY);
  return { securityEvents, passkeys, sessions, recovery, acceptances, downloads, mcpUsage: await usageStatus(account, now) };
}

export async function accountRecords(account: string, currentSessionHash: string) {
  const store = db();
  const details = await accountDetails(account, currentSessionHash);
  const profile = await store.prepare("SELECT id,terms,created FROM accounts WHERE id=?").get(account);
  const usage = await store.prepare("SELECT action,at,amount FROM usage WHERE subject=? AND at>? ORDER BY at").all(account, Date.now() - 35 * DAY);
  return { exportedAt: new Date().toISOString(), profile, ...details, usage, connections: await listMcpConnections(account),
    note: "Account records only. Private keys, session tokens, recovery secrets, research files, device-local notes and preferences are excluded. Separate browser/network abuse counters are not account records." };
}
