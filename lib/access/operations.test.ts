import { beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { db, DAY, transaction, consume } from "./store";
import { bindMcpAllowance, withMcpAllowance, mcpAllowanceSubject } from "./mcpAllowance";
import { acquireMcpWork, releaseMcpWork, usageStatus } from "./mcpPolicy";
import { retainDeletedAllowance } from "./browserAllowance";
import { operate } from "./operations";
import { servicePaused } from "./serviceControl";
import { createMcpConnection, mcpConnection } from "./consent";
import { quarantineRestoredAccess } from "./restoreSafety";
import { hashToken, networkSubject } from "./http";
import { TERMS_VERSION } from "@/lib/content/siteTerms";
import { GET, POST } from "@/app/api/operator/route";

beforeEach(async () => { vi.unstubAllEnvs(); await db().exec("DELETE FROM accounts; DELETE FROM usage; DELETE FROM settings; DELETE FROM operator_audit;"); });
async function member() {
  const id = randomUUID(), raw = randomUUID();
  await db().prepare("INSERT INTO accounts VALUES(?,?,?)").run(id, TERMS_VERSION, Date.now());
  await db().prepare("INSERT INTO sessions VALUES(?,?,?,?)").run(hashToken(raw), id, Date.now() + DAY, Date.now());
  return { id, raw };
}
function req(raw: string, body?: unknown, origin = "http://localhost:3000") {
  return new Request("http://localhost:3000/api/operator", { method: body ? "POST" : "GET", headers: { cookie: `oz_session=${raw}`, origin, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
it("carries MCP call, row, byte, discovery and issue limits across deletion without extending their window", async () => {
  const first = await member(), browser = `browser:${randomUUID()}`, now = Date.now();
  await bindMcpAllowance(first.id, browser, now);
  await consume(await withMcpAllowance(["mcp-calls", "mcp-rows", "mcp-bytes", "mcp-discovery", "mcp-issue"].map((action) => ({ subject: first.id, action, amount: 10, limit: 10, window: DAY })), first.id), db(), now - 1000);
  await transaction(db(), async () => { await retainDeletedAllowance(db(), first.id, browser, now); await db().prepare("DELETE FROM accounts WHERE id=?").run(first.id); });
  const next = await member(); await bindMcpAllowance(next.id, browser, now);
  for (const action of ["mcp-calls", "mcp-rows", "mcp-bytes", "mcp-discovery", "mcp-issue"]) {
    const budgets = await withMcpAllowance([{ subject: next.id, action, limit: 10, window: DAY }], next.id, now);
    await expect(consume(budgets, db(), now)).rejects.toThrow(/allowance/);
    await expect(consume(budgets, db(), now + DAY)).resolves.toBeUndefined();
  }
});
it("does not let a new cookie reset an account binding and displays inherited MCP usage", async () => {
  const a = await member(), browser = `browser:${randomUUID()}`;
  await bindMcpAllowance(a.id, browser);
  await bindMcpAllowance(a.id, `browser:${randomUUID()}`);
  expect(await mcpAllowanceSubject(a.id)).toBe(browser);
  await db().prepare("INSERT INTO usage(subject,action,at,amount) VALUES(?,'mcp-rows',?,900)").run(browser, Date.now());
  expect((await usageStatus(a.id)).find((v) => v.name === "mcp-rows")).toMatchObject({ used: 900, remaining: 100 });
  await expect(acquireMcpWork(a.id, 101)).rejects.toThrow(/allowance/);
  await releaseMcpWork(await acquireMcpWork(a.id, 100));
});
it("serializes shared browser reservations across two accounts", async () => {
  const a = await member(), b = await member(), browser = `browser:${randomUUID()}`;
  await bindMcpAllowance(a.id, browser); await bindMcpAllowance(b.id, browser);
  const results = await Promise.allSettled([acquireMcpWork(a.id, 700), acquireMcpWork(b.id, 700)]);
  expect(results.filter((v) => v.status === "fulfilled")).toHaveLength(1);
  for (const result of results) if (result.status === "fulfilled") await releaseMcpWork(result.value);
});
it("enforces independent operator authorization, recent identity verification and same-origin mutations", async () => {
  const a = await member(), other = await member(); vi.stubEnv("OZ_OPERATOR_ACCOUNT_IDS", a.id);
  expect((await GET(req(other.raw))).status).toBe(403);
  expect((await GET(req("missing"))).status).toBe(401);
  expect((await GET(req(a.raw))).status).toBe(200);
  expect((await POST(req(a.raw, { action: "pause", service: "exports" }, "https://other.invalid"))).status).toBe(403);
  expect((await POST(req(a.raw, { action: "pause", service: "exports" }))).status).toBe(200);
  expect(await servicePaused("exports")).toBe(true);
  await db().prepare("UPDATE sessions SET verified=? WHERE account=?").run(Date.now() - DAY, a.id);
  expect((await POST(req(a.raw, { action: "resume", service: "exports" }))).status).toBe(401);
});
it("permanently revokes tokens on suspension and never restores them by enabling an account", async () => {
  const operator = await member(), user = await member(); vi.stubEnv("OZ_OPERATOR_ACCOUNT_IDS", operator.id);
  const connection = await createMcpConnection(user.id, "Chat");
  const request = new Request("http://localhost:3000/mcp", { headers: { authorization: `Bearer ${connection.token}` } });
  expect(await mcpConnection(request)).toBeTruthy();
  await operate(operator.id, "suspend", user.id);
  await operate(operator.id, "restore", user.id);
  expect(await mcpConnection(request)).toBeNull();
  expect(await db().prepare("SELECT * FROM sessions WHERE account=?").all(user.id)).toHaveLength(0);
  await expect(operate(operator.id, "suspend", operator.id)).rejects.toThrow(/operator recovery/);
  expect(await db().prepare("SELECT * FROM operator_audit").all()).toHaveLength(2);
  await db().prepare("DELETE FROM accounts WHERE id=?").run(user.id);
  expect((await db().prepare("SELECT target FROM operator_audit").all()).every((row) => row.target === null)).toBe(true);
});
it("quarantines restored access, including old passkeys and recovery secrets, while retaining usage", async () => {
  const a = await member(); const connection = await createMcpConnection(a.id, "Restored chat");
  await db().prepare("INSERT INTO credentials VALUES(?,?,?,?,?)").run(randomUUID(), a.id, new Uint8Array([1]), 0, "[]");
  await db().prepare("INSERT INTO recovery VALUES(?,?)").run("recovered-old-code", a.id);
  await quarantineRestoredAccess(db());
  for (const table of ["sessions", "credentials", "recovery", "oauth_codes"]) expect(await db().prepare(`SELECT * FROM ${table}`).all()).toEqual([]);
  expect(await mcpConnection(new Request("http://localhost:3000/mcp", { headers: { authorization: `Bearer ${connection.token}` } }))).toBeNull();
  expect(await servicePaused("signup")).toBe(true);
  expect(await db().prepare("SELECT * FROM usage").all()).not.toHaveLength(0);
});
it("ignores spoofable IP headers until the operator explicitly verifies the proxy", async () => {
  vi.stubEnv("OZ_TRUSTED_IP_HEADER", "x-test-ip");
  const a = new Request("http://localhost:3000", { headers: { "x-test-ip": "192.0.2.1" } });
  const b = new Request("http://localhost:3000", { headers: { "x-test-ip": "192.0.2.2" } });
  expect(await networkSubject(a)).toBe(await networkSubject(b));
  vi.stubEnv("OZ_TRUSTED_PROXY_VERIFIED", "1");
  expect(await networkSubject(a)).not.toBe(await networkSubject(b));
});
