import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AccessError, checkBudgets, consume, DAY, db, prune, recordBudgets, transaction } from "./store";
import { networkSubject } from "./http";
import { DISCLAIMER, error } from "@/lib/tools/shared";

export const MCP_LIMITS = { callsPerMinute: 60, callsPerDay: 500, rowsPerDay: 1000, bytesPerDay: 16 * 1024 * 1024, responseBytes: 128 * 1024, concurrentPerAccount: 2, concurrentGlobal: 8 } as const;
export const mcpContext = new AsyncLocalStorage<{ account: string; network: string }>();
const resultSchema = z.object({ content: z.array(z.object({ type: z.literal("text"), text: z.string() }).strict()).min(1).max(2), structuredContent: z.record(z.string(), z.unknown()).optional(), isError: z.boolean().optional() }).strict();
function finiteOutput(value: unknown, depth = 0): boolean {
  if (depth > 16) return false;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((item) => finiteOutput(item, depth + 1));
  if (value && typeof value === "object") return Object.values(value).every((item) => finiteOutput(item, depth + 1));
  return value == null || ["string", "boolean"].includes(typeof value);
}
export function mcpPaused(tool?: string) {
  const store = db();
  return process.env.OZ_MCP_PAUSED === "1" || !!store.prepare("SELECT 1 FROM settings WHERE value='1' AND key IN (?,?)").get("mcp-paused", `mcp-paused:${tool ?? ""}`);
}
export function mcpEvent(subject: string, code: "invalid-request" | "invalid-token" | "invalid-tool" | "invalid-output" | "tool-failure", now = Date.now()) {
  transaction(db(), () => {
    prune(db(), now);
    db().prepare("INSERT INTO mcp_events VALUES(?,?,?,1) ON CONFLICT(subject,code,bucket) DO UPDATE SET count=count+1").run(subject, code, Math.floor(now / 60_000) * 60_000);
    if (code === "invalid-output" || code === "tool-failure") return;
    const total = (db().prepare("SELECT SUM(count) AS n FROM mcp_events WHERE subject=? AND bucket>=? AND code IN ('invalid-request','invalid-token','invalid-tool')").get(subject, now - 300_000) as { n: number }).n;
    if (total >= 10) {
      const prior = db().prepare("SELECT until,level FROM mcp_cooldowns WHERE subject=?").get(subject) as { until: number; level: number } | undefined;
      if (prior && prior.until > now) return;
      const level = Math.min((prior?.level ?? 0) + 1, 5);
      db().prepare("INSERT INTO mcp_cooldowns VALUES(?,?,?) ON CONFLICT(subject) DO UPDATE SET until=excluded.until,level=excluded.level").run(subject, now + Math.min(900, 30 * 2 ** level) * 1000, level);
    }
  });
}
export function checkMcpCooldown(subject: string, now = Date.now()) {
  const row = db().prepare("SELECT until FROM mcp_cooldowns WHERE subject=?").get(subject) as { until: number } | undefined;
  if (row && row.until > now) throw new AccessError("MCP requests are temporarily paused. Wait before retrying.", 429, Math.ceil((row.until - now) / 1000));
}
export function mcpTransport(req: Request, account?: string) {
  const network = networkSubject(req);
  checkMcpCooldown(network); if (account) checkMcpCooldown(account);
  if (mcpPaused()) throw new AccessError("MCP research is temporarily paused. The website remains available.", 503);
  consume(account ? [{ subject: account, action: "mcp-read", limit: 300, window: 60_000 }] : [{ subject: network, action: "mcp-transport", limit: 1500, window: 60_000 }, { subject: "mcp-service", action: "mcp-transport", limit: 6000, window: 60_000 }]);
  return network;
}
export function acquireMcpWork(account: string, rows: number, now = Date.now()) {
  return transaction(db(), () => {
    prune(db(), now);
    db().prepare("DELETE FROM mcp_leases WHERE expires<=?").run(now);
    const active = db().prepare("SELECT COUNT(*) AS n, SUM(account=?) AS own FROM mcp_leases").get(account) as { n: number; own: number };
    if (active.n >= MCP_LIMITS.concurrentGlobal || active.own >= MCP_LIMITS.concurrentPerAccount) throw new AccessError("MCP is busy. Wait for the current research to finish.", 429, 5);
    const budgets = [
      { subject: account, action: "mcp-calls", limit: MCP_LIMITS.callsPerMinute, window: 60_000 },
      { subject: account, action: "mcp-calls", limit: MCP_LIMITS.callsPerDay, window: DAY },
      { subject: account, action: "mcp-rows", amount: rows, limit: MCP_LIMITS.rowsPerDay, window: DAY },
      { subject: "mcp-service", action: "mcp-calls", limit: 20_000, window: DAY },
      { subject: "mcp-service", action: "mcp-rows", amount: rows, limit: 50_000, window: DAY },
    ];
    checkBudgets(db(), budgets, now); recordBudgets(db(), budgets, now);
    const id = randomUUID(); db().prepare("INSERT INTO mcp_leases VALUES(?,?,?)").run(id, account, now + 30_000); return id;
  });
}
export function releaseMcpWork(id: string) { db().prepare("DELETE FROM mcp_leases WHERE id=?").run(id); }
export function usageStatus(account: string, now = Date.now()) {
  const budgets = [["mcp-calls", MCP_LIMITS.callsPerDay], ["mcp-rows", MCP_LIMITS.rowsPerDay], ["mcp-bytes", MCP_LIMITS.bytesPerDay]] as const;
  return budgets.map(([name, limit]) => {
    const events = db().prepare("SELECT at,amount FROM usage WHERE subject=? AND action=? AND at>? ORDER BY at").all(account, name, now - DAY) as Array<{ at: number; amount: number }>;
    const used = events.reduce((sum, item) => sum + item.amount, 0);
    return { name, limit, used, remaining: Math.max(0, limit - used), nextReleaseAt: events.length ? new Date(events[0].at + DAY).toISOString() : null, windowHours: 24 };
  });
}
export async function protectedMcpTool(name: string, rows: number, run: () => unknown | Promise<unknown>) {
  const context = mcpContext.getStore();
  if (!context) return error("An authenticated MCP request is required.");
  let lease: string | undefined;
  try {
    if (mcpPaused(name)) throw new AccessError("This MCP capability is temporarily paused.", 503);
    checkMcpCooldown(context.account);
    lease = acquireMcpWork(context.account, rows);
    const output = resultSchema.safeParse(await run());
    if (!output.success || !finiteOutput(output.data)) { mcpEvent("mcp-service", "invalid-output"); return error("The research response could not be validated. Try again later."); }
    const serialized = JSON.stringify(output.data);
    const bytes = Buffer.byteLength(serialized);
    if (bytes > MCP_LIMITS.responseBytes || !output.data.content.every((item) => item.text.includes(DISCLAIMER))) {
      mcpEvent("mcp-service", "invalid-output"); return error("This result exceeds the supported response size or format. Narrow the request.");
    }
    consume([{ subject: context.account, action: "mcp-bytes", amount: bytes, limit: MCP_LIMITS.bytesPerDay, window: DAY }, { subject: "mcp-service", action: "mcp-bytes", amount: bytes, limit: 128 * 1024 * 1024, window: DAY }]);
    return output.data;
  } catch (reason) {
    if (reason instanceof AccessError) return { ...error(reason.message), structuredContent: { error: "research_limit", retryAfter: reason.retryAfter, disclaimer: DISCLAIMER } };
    mcpEvent("mcp-service", "tool-failure"); return error("Research is temporarily unavailable. Your request was not logged.");
  } finally { if (lease) releaseMcpWork(lease); }
}

/** Bound depth and text before SDK validation; no reflected attacker-controlled errors. */
export function safeMcpInput(value: unknown, depth = 0): boolean {
  if (depth > 8) return false;
  if (typeof value === "string") return value.length <= 2000 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
  if (typeof value === "number") return Number.isFinite(value) && Math.abs(value) <= 1e12;
  if (Array.isArray(value)) return value.length <= 50 && value.every((item) => safeMcpInput(item, depth + 1));
  if (value && typeof value === "object") return Object.entries(value).length <= 50 && Object.entries(value).every(([key, item]) => key.length <= 80 && !["__proto__", "constructor", "prototype"].includes(key) && safeMcpInput(item, depth + 1));
  return value == null || typeof value === "boolean";
}
