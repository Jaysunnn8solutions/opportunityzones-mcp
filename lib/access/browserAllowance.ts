import { createHmac, timingSafeEqual } from "node:crypto";
import { cookie, hashToken, setCookie, token } from "./http";
import { AccessError, DAY, db } from "./store";
import type { Store } from "./database";
import type { UsageEvent } from "./allowance";
import { copyMcpAllowance, mcpAllowanceSubject } from "./mcpAllowance";

export const ALLOWANCE_COOKIE = "oz_allowance";
/** Pseudonymous abuse control, not authentication. No fingerprint, address, or research data. */
export async function browserAllowance(req: Request, create = false, now = Date.now()) {
  const store = db();
  await store.prepare("INSERT OR IGNORE INTO settings(key,value) VALUES('allowance-secret',?)").run(token());
  const { value: secret } = await store.prepare("SELECT value FROM settings WHERE key='allowance-secret'").get() as { value: string };
  const raw = cookie(req, ALLOWANCE_COOKIE);
  const parts = /^[\w-]{43}\.\d{13}\.[\w-]{43}$/.test(raw) ? raw.split(".") : [];
  const signature = (payload: string) => createHmac("sha256", secret).update(payload).digest("base64url");
  const valid = parts.length === 3 && Number(parts[1]) > now && Number(parts[1]) <= now + 30 * DAY &&
    timingSafeEqual(Buffer.from(parts[2]), Buffer.from(signature(`${parts[0]}.${parts[1]}`)));
  if (!valid && !create) throw new AccessError("Refresh My account to initialize download protection, then try again.", 409);
  const id = valid ? parts[0] : token();
  const payload = `${id}.${now + 30 * DAY}`;
  return { subject: `browser:${hashToken(id)}`, cookie: setCookie(ALLOWANCE_COOKIE, `${payload}.${signature(payload)}`, 30 * 86400, req) };
}
export async function exportUsage(store: Store, subject: string, now = Date.now()) {
  return await store.prepare("SELECT action, at, amount FROM usage WHERE subject=? AND action IN ('exports','export-rows') AND at>? ORDER BY at").all(subject, now - 30 * DAY) as UsageEvent[];
}
/** Call inside the deletion transaction. Preserve past usage, including exports made on another browser. */
export async function retainDeletedAllowance(store: Store, account: string, browser: string, now = Date.now()) {
  await copyMcpAllowance(store, account, browser, now);
  const bound = await mcpAllowanceSubject(account, now);
  if (bound && bound !== browser) await copyMcpAllowance(store, bound, browser, now);
  const events = await store.prepare("SELECT action,at,SUM(amount) AS amount FROM usage WHERE subject=? AND action IN ('exports','export-rows','research-files') AND at>? GROUP BY action,at").all(account, now - 30 * DAY) as UsageEvent[];
  for (const event of events) {
    const existing = await store.prepare("SELECT COALESCE(SUM(amount),0) AS amount FROM usage WHERE subject=? AND action=? AND at=?").get(browser, event.action, event.at) as { amount: number };
    const amount = Math.max(0, event.amount - existing.amount);
    if (amount) await store.prepare("INSERT INTO usage(subject,action,at,amount) VALUES(?,?,?,?)").run(browser, event.action, event.at, amount);
  }
}
