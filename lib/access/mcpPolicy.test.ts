import { beforeEach, expect, it } from "vitest";
import { db, DAY, consume } from "./store";
import { acquireMcpWork, checkMcpCooldown, MCP_LIMITS, mcpContext, mcpEvent, protectedMcpTool, releaseMcpWork, usageStatus } from "./mcpPolicy";
import { text } from "@/lib/tools/shared";
import { TERMS_VERSION } from "@/lib/content/siteTerms";
beforeEach(async () => { (await db().exec("DELETE FROM mcp_leases; DELETE FROM mcp_events; DELETE FROM mcp_cooldowns; DELETE FROM usage; DELETE FROM settings WHERE key LIKE 'mcp-paused%';")); (await db().prepare("INSERT OR IGNORE INTO accounts VALUES('policy-test',?,?)").run(TERMS_VERSION, Date.now())); });
it("reserves concurrency atomically, releases work, and expires abandoned leases", async () => {
  const first = (await acquireMcpWork("policy-test", 1)); (await acquireMcpWork("policy-test", 1));
  await expect(async () => (await acquireMcpWork("policy-test", 1))).rejects.toThrow(/busy/);
  (await releaseMcpWork(first)); expect((await acquireMcpWork("policy-test", 1))).toBeTruthy();
  expect((await acquireMcpWork("policy-test", 1, Date.now() + 31_000))).toBeTruthy();
});
it("shares daily rows across tokens and keeps MCP budgets separate from website calls", async () => {
  (await consume([{ subject: "policy-test", action: "mcp-rows", amount: 1000, limit: 1000, window: DAY }]));
  await expect(async () => (await acquireMcpWork("policy-test", 1))).rejects.toThrow(/allowance/);
  expect((await usageStatus("policy-test")).find((item) => item.name === "mcp-rows")?.remaining).toBe(0);
  expect((await db().prepare("SELECT * FROM usage WHERE action='read'").all())).toHaveLength(0);
});
it("uses temporary escalating cooldowns without retaining input or permanent bans", async () => {
  const now = Date.now(); for (let i = 0; i < 10; i++) (await mcpEvent("policy-test", "invalid-tool", now));
  await expect(async () => (await checkMcpCooldown("policy-test", now))).rejects.toThrow(/paused/);
  await expect(checkMcpCooldown("policy-test", now + 61_000)).resolves.toBeUndefined();
  (await mcpEvent("policy-test", "invalid-tool", now + 61_000));
  await expect(async () => (await checkMcpCooldown("policy-test", now + 122_000))).rejects.toThrow(/paused/);
  expect(Object.keys((await db().prepare("SELECT * FROM mcp_events LIMIT 1").get())!)).toEqual(["subject", "code", "bucket", "count"]);
});
it("checks result size, releases failed work, and supports emergency pause", async () => {
  await mcpContext.run({ account: "policy-test", network: "network:test" }, async () => {
    const huge = await protectedMcpTool("get_tract", 1, () => text("x".repeat(MCP_LIMITS.responseBytes), []));
    expect(huge.isError).toBe(true);
    expect((await db().prepare("SELECT * FROM mcp_leases").all())).toHaveLength(0);
    (await db().prepare("INSERT INTO settings VALUES('mcp-paused:get_tract','1')").run());
    const paused = await protectedMcpTool("get_tract", 1, () => { throw new Error("Must not execute"); });
    expect(paused.content[0].text).toContain("paused");
  });
});
