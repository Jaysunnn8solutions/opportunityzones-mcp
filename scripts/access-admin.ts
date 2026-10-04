/** Trusted-host maintenance CLI. Web operations separately require an allowlisted account. */
import { randomUUID } from "node:crypto";
import { db, DAY, prune, transaction } from "../lib/access/store";
const [action = "status", account] = process.argv.slice(2);
const store = db();
(await prune(store));
if (action === "status") {
  console.log(JSON.stringify({ accounts: (await store.prepare("SELECT COUNT(*) AS count FROM accounts").get()), recent: (await store.prepare("SELECT subject, action, SUM(amount) AS amount FROM usage WHERE subject IN ('service','mcp-service') AND at>? GROUP BY subject,action").all(Date.now() - DAY)), providers: (await store.prepare("SELECT subject, SUM(amount) AS attempts FROM usage WHERE subject LIKE 'provider:%' AND at>? GROUP BY subject").all(Date.now() - DAY)), preparedExports: (await store.prepare("SELECT COUNT(*) AS count, SUM(LENGTH(body)) AS bytes FROM exports").get()) }, null, 2));
} else if (["mcp-pause", "mcp-resume"].includes(action) && (!account || /^[a-z_]{1,60}$/.test(account))) {
  await transaction(store, async () => {
    (await store.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(account ? `mcp-paused:${account}` : "mcp-paused", action === "mcp-pause" ? "1" : "0"));
    await store.prepare("INSERT INTO operator_audit VALUES(?,NULL,?,NULL,?)").run(randomUUID(), `cli:${action}:${account ?? "service"}`, Date.now());
  });
  console.log(`MCP ${account ?? "service"} ${action === "mcp-pause" ? "paused" : "resumed"}.`);
} else if (action === "mcp-status") {
  console.log(JSON.stringify({ leases: (await store.prepare("SELECT COUNT(*) AS active FROM mcp_leases WHERE expires>?").get(Date.now())), events: (await store.prepare("SELECT code,SUM(count) AS count FROM mcp_events WHERE bucket>? GROUP BY code").all(Date.now() - DAY)), usage: (await store.prepare("SELECT action,SUM(amount) AS amount FROM usage WHERE subject='mcp-service' AND at>? GROUP BY action").all(Date.now() - DAY)), paused: (await store.prepare("SELECT key FROM settings WHERE key LIKE 'mcp-paused%' AND value='1'").all()) }, null, 2));
} else if (["suspend", "restore"].includes(action) && account && /^[A-Za-z0-9_-]{16,80}$/.test(account)) {
  if (!(await store.prepare("SELECT id FROM accounts WHERE id=?").get(account))) throw new Error("Account not found");
  await transaction(store, async () => {
    (await store.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(`account-disabled:${account}`, action === "suspend" ? "1" : "0"));
    await store.prepare("DELETE FROM sessions WHERE account=?").run(account);
    await store.prepare("DELETE FROM challenges WHERE account=?").run(account);
    await store.prepare("DELETE FROM oauth_codes WHERE account=?").run(account);
    await store.prepare("UPDATE consents SET revoked=1 WHERE account=?").run(account);
    await store.prepare("INSERT INTO operator_audit VALUES(?,NULL,?,?,?)").run(randomUUID(), `cli:${action}`, account, Date.now());
  });
  console.log(`Account ${action === "suspend" ? "suspended" : "restored"}; existing sessions and MCP tokens permanently revoked.`);
} else throw new Error("Usage: tsx scripts/access-admin.ts [status | mcp-status | mcp-pause [TOOL] | mcp-resume [TOOL] | suspend ACCOUNT_ID | restore ACCOUNT_ID]");
