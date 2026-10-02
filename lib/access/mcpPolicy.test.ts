import { beforeEach, expect, it } from "vitest";
import { db, DAY, consume } from "./store";
import { acquireMcpWork, checkMcpCooldown, MCP_LIMITS, mcpContext, mcpEvent, protectedMcpTool, releaseMcpWork, usageStatus } from "./mcpPolicy";
import { text } from "@/lib/tools/shared";
import { TERMS_VERSION } from "@/lib/content/siteTerms";
beforeEach(() => { db().exec("DELETE FROM mcp_leases; DELETE FROM mcp_events; DELETE FROM mcp_cooldowns; DELETE FROM usage; DELETE FROM settings WHERE key LIKE 'mcp-paused%';"); db().prepare("INSERT OR IGNORE INTO accounts VALUES('policy-test',?,?)").run(TERMS_VERSION, Date.now()); });
it("reserves concurrency atomically, releases work, and expires abandoned leases", () => {
  const first = acquireMcpWork("policy-test", 1); acquireMcpWork("policy-test", 1);
  expect(() => acquireMcpWork("policy-test", 1)).toThrow(/busy/);
  releaseMcpWork(first); expect(acquireMcpWork("policy-test", 1)).toBeTruthy();
  expect(acquireMcpWork("policy-test", 1, Date.now() + 31_000)).toBeTruthy();
});
it("shares daily rows across tokens and keeps MCP budgets separate from website calls", () => {
  consume([{ subject: "policy-test", action: "mcp-rows", amount: 1000, limit: 1000, window: DAY }]);
  expect(() => acquireMcpWork("policy-test", 1)).toThrow(/allowance/);
  expect(usageStatus("policy-test").find((item) => item.name === "mcp-rows")?.remaining).toBe(0);
  expect(db().prepare("SELECT * FROM usage WHERE action='read'").all()).toHaveLength(0);
});
it("uses temporary escalating cooldowns without retaining input or permanent bans", () => {
  const now = Date.now(); for (let i = 0; i < 10; i++) mcpEvent("policy-test", "invalid-tool", now);
  expect(() => checkMcpCooldown("policy-test", now)).toThrow(/paused/);
  expect(() => checkMcpCooldown("policy-test", now + 61_000)).not.toThrow();
  mcpEvent("policy-test", "invalid-tool", now + 61_000);
  expect(() => checkMcpCooldown("policy-test", now + 122_000)).toThrow(/paused/);
  expect(Object.keys(db().prepare("SELECT * FROM mcp_events LIMIT 1").get()!)).toEqual(["subject", "code", "bucket", "count"]);
});
it("checks result size, releases failed work, and supports emergency pause", async () => {
  await mcpContext.run({ account: "policy-test", network: "network:test" }, async () => {
    const huge = await protectedMcpTool("get_tract", 1, () => text("x".repeat(MCP_LIMITS.responseBytes), []));
    expect(huge.isError).toBe(true);
    expect(db().prepare("SELECT * FROM mcp_leases").all()).toHaveLength(0);
    db().prepare("INSERT INTO settings VALUES('mcp-paused:get_tract','1')").run();
    const paused = await protectedMcpTool("get_tract", 1, () => { throw new Error("Must not execute"); });
    expect(paused.content[0].text).toContain("paused");
  });
});
