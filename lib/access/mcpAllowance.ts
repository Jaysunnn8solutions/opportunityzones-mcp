import { db, DAY, transaction, type Budget } from "./store";
import type { Store } from "./database";

const ACTIONS = "'mcp-calls','mcp-rows','mcp-bytes','mcp-discovery','mcp-issue'";
export async function mcpAllowanceSubject(account: string, now = Date.now()) {
  const row = await db().prepare("SELECT subject FROM account_allowances WHERE account=? AND expires>?").get(account, now) as { subject: string } | undefined;
  return row?.subject;
}
/** A chat client never chooses this subject. Only a signed browser allowance can bind it. */
export async function bindMcpAllowance(account: string, browser: string, now = Date.now()) {
  await transaction(db(), async () => {
    const existing = await mcpAllowanceSubject(account, now);
    if (existing) return; // Clearing a cookie cannot reset an existing account's MCP allowance.
    await db().prepare("INSERT INTO account_allowances VALUES(?,?,?) ON CONFLICT(account) DO UPDATE SET subject=excluded.subject,expires=excluded.expires").run(account, browser, now + 30 * DAY);
    await copyMcpAllowance(db(), account, browser, now);
  });
}
export async function copyMcpAllowance(store: Store, from: string, to: string, now = Date.now()) {
  const events = await store.prepare(`SELECT action,at,SUM(amount) AS amount FROM usage WHERE subject=? AND action IN (${ACTIONS}) AND at>? GROUP BY action,at`).all(from, now - DAY) as { action: string; at: number; amount: number }[];
  for (const event of events) {
    const current = await store.prepare("SELECT COALESCE(SUM(amount),0) AS n FROM usage WHERE subject=? AND action=? AND at=?").get(to, event.action, event.at) as { n: number };
    if (event.amount > current.n) await store.prepare("INSERT INTO usage(subject,action,at,amount) VALUES(?,?,?,?)").run(to, event.action, event.at, event.amount - current.n);
  }
}
export async function withMcpAllowance(budgets: Budget[], account: string, now = Date.now()) {
  const subject = await mcpAllowanceSubject(account, now);
  return subject ? [...budgets, ...budgets.filter((b) => b.subject === account).map((b) => ({ ...b, subject }))] : budgets;
}
