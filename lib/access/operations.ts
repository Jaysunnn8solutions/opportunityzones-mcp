import { randomUUID } from "node:crypto";
import { AccessError, db, DAY, transaction, prune } from "./store";
import { requireMember, limitRequest } from "./http";
import { servicePaused, type ServiceName } from "./serviceControl";
import { securityEvent } from "./securityEvents";

export function isOperator(account: string) {
  return (process.env.OZ_OPERATOR_ACCOUNT_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean).includes(account);
}
export async function requireOperator(req: Request) {
  const account = await requireMember(req, true);
  if (!isOperator(account.id)) throw new AccessError("Operator access required.", 403);
  await limitRequest(req, "auth", account);
  return account;
}
export async function operationsStatus() {
  const store = db(), now = Date.now();
  await transaction(store, () => prune(store, now));
  const accounts = await store.prepare("SELECT COUNT(*) AS count FROM accounts").get();
  const exports = await store.prepare("SELECT COUNT(*) AS count,COALESCE(SUM(length(body)),0) AS bytes FROM exports WHERE at>?").get(now - 3_600_000);
  // Service counters count each operation once, unlike account/browser mirrored counters.
  const usage = await store.prepare("SELECT subject,action,SUM(amount) AS used FROM usage WHERE subject IN ('service','mcp-service') AND at>? GROUP BY subject,action ORDER BY subject,action").all(now - DAY);
  const failures = await store.prepare("SELECT code,SUM(count) AS count FROM mcp_events WHERE bucket>? GROUP BY code ORDER BY code").all(now - DAY);
  const audit = await store.prepare("SELECT action,at,actor,target FROM operator_audit ORDER BY at DESC LIMIT 50").all();
  return { asOf: now, accounts, exports, usage, failures, audit,
    paused: { exports: await servicePaused("exports"), signup: await servicePaused("signup"), mcp: await servicePaused("mcp") },
    proxy: { configured: !!process.env.OZ_TRUSTED_IP_HEADER, verified: process.env.OZ_TRUSTED_PROXY_VERIFIED === "1", header: process.env.OZ_TRUSTED_IP_HEADER ?? null },
    storage: process.env.DATABASE_URL ? "PostgreSQL" : "SQLite", storageNote: "Export bytes cover temporary files only. Check your host for total database size, storage quota, and backups." };
}
export async function operate(actor: string, action: "pause" | "resume" | "suspend" | "restore" | "revoke", target?: string, service?: ServiceName) {
  if (!isOperator(actor)) throw new AccessError("Operator access required.", 403);
  return transaction(db(), async () => {
    if (action === "pause" || action === "resume") {
      if (!service || !["exports", "signup", "mcp"].includes(service)) throw new AccessError("Choose a service.", 400);
      if (action === "resume" && process.env[`OZ_${service.toUpperCase()}_PAUSED`] === "1") throw new AccessError("This service is paused in the deployment environment. Update that configuration before resuming.", 409);
      await db().prepare("INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(`${service}-paused`, action === "pause" ? "1" : "0");
    } else {
      if (!target || target.length > 64 || !await db().prepare("SELECT 1 FROM accounts WHERE id=?").get(target)) throw new AccessError("Account not found.", 404);
      if (isOperator(target)) throw new AccessError("Use the operator recovery procedure for an operator account.", 409);
      if (action !== "revoke") await db().prepare("INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(`account-disabled:${target}`, action === "suspend" ? "1" : "0");
      if (action !== "restore") {
        await db().prepare("DELETE FROM sessions WHERE account=?").run(target);
        await db().prepare("DELETE FROM challenges WHERE account=?").run(target);
        await db().prepare("DELETE FROM oauth_codes WHERE account=?").run(target);
        await db().prepare("UPDATE consents SET revoked=1 WHERE account=?").run(target);
        await securityEvent(target, "operator-revoked");
      }
    }
    await db().prepare("INSERT INTO operator_audit VALUES(?,?,?,?,?)").run(randomUUID(), actor, service ? `${action}:${service}` : action, target ?? null, Date.now());
  });
}
