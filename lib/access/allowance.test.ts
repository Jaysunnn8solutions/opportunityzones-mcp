import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { summarizeAllowance } from "./allowance";
import { ALLOWANCE_COOKIE, browserAllowance, exportUsage } from "./browserAllowance";
import { DAY, consume, db, prune, recordBudgets, transaction } from "./store";
import { exportBudgets, generateExport } from "./exports";
import { hashToken, signupBudgets } from "./http";
import { TERMS_VERSION } from "@/lib/content/siteTerms";
import { GET as accountGet, POST as accountPost } from "@/app/api/account/route";
import { POST as exportPost } from "@/app/api/exports/route";

const origin = "http://localhost:3000";
function request(path: string, cookie = "", body?: unknown) {
  return new Request(`${origin}${path}`, { method: body ? "POST" : "GET", headers: { Origin: origin, Cookie: cookie, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
async function member() {
  const id = randomUUID(), raw = randomUUID();
  await db().prepare("INSERT INTO accounts VALUES(?,?,?)").run(id, TERMS_VERSION, Date.now());
  await db().prepare("INSERT INTO sessions VALUES(?,?,?,?)").run(hashToken(raw), id, Date.now() + DAY, Date.now());
  return { id, cookie: `oz_session=${raw}` };
}
beforeEach(async () => { await db().exec("DELETE FROM accounts; DELETE FROM usage; DELETE FROM settings;"); });
afterEach(() => { vi.unstubAllEnvs(); });

describe("usage display calculations", () => {
  it("counts both windows, exact boundaries, and the stricter account or browser allowance", () => {
    const now = 40 * DAY;
    const account = [{ action: "exports", at: now - DAY, amount: 1 }, { action: "exports", at: now - 30 * DAY, amount: 9 }, { action: "exports", at: now - 1000, amount: 1 }, { action: "export-rows", at: now - 1000, amount: 200 }];
    const browser = [{ action: "exports", at: now - 500, amount: 3 }, { action: "export-rows", at: now - 500, amount: 900 }];
    const summary = summarizeAllowance(account, browser, now);
    expect(summary[0]).toMatchObject({ used: 3, accountUsed: 1, browserUsed: 3, remaining: 0, nextReleaseAt: now - 500 + DAY });
    expect(summary[1]).toMatchObject({ used: 900, remaining: 100 });
    expect(summary[2]).toMatchObject({ accountUsed: 2, used: 3, remaining: 7 });
    expect(summarizeAllowance([], [], now)[0]).toMatchObject({ used: 0, remaining: 3, nextReleaseAt: null });
  });
});

describe("browser download abuse protection", () => {
  it("keeps signup counters independent of accounts and only trusts a configured proxy header", async () => {
    vi.stubEnv("OZ_TRUSTED_IP_HEADER", "");
    const req = new Request(`${origin}/api/account`, { headers: { "x-test-trusted-ip": "192.0.2.10", "x-forwarded-for": "forged" } });
    expect(await signupBudgets(req)).toHaveLength(1);
    vi.stubEnv("OZ_TRUSTED_IP_HEADER", "x-test-trusted-ip");
    vi.stubEnv("OZ_TRUSTED_PROXY_VERIFIED", "1");
    const budgets = await signupBudgets(req);
    for (let i = 0; i < 5; i++) await consume(budgets);
    await db().exec("DELETE FROM accounts");
    await expect(consume(await signupBudgets(req))).rejects.toThrow(/allowance/);
    expect(JSON.stringify(await db().prepare("SELECT subject FROM usage").all())).not.toContain("192.0.2.10");
  });
  it("requires a signed cookie, renews its identity, and rejects tampering or expiration", async () => {
    const now = Date.now(), empty = request("/api/account");
    await expect(browserAllowance(empty)).rejects.toThrow(/Refresh My account/);
    const browser = await browserAllowance(empty, true, now);
    const cookie = browser.cookie.split(";")[0];
    expect(browser.cookie).toContain("HttpOnly; SameSite=Strict");
    expect((await browserAllowance(request("/api/account", cookie), false, now + 1000)).subject).toBe(browser.subject);
    await expect(browserAllowance(request("/api/account", `${cookie}x`))).rejects.toThrow();
    await expect(browserAllowance(request("/api/account", cookie), false, now + 30 * DAY)).rejects.toThrow();
    const changed = cookie.replace(/\.\d+\./, `.${now + 20 * DAY}.`);
    await expect(browserAllowance(request("/api/account", changed))).rejects.toThrow();
    const signed = await member();
    expect((await exportPost(request("/api/exports", signed.cookie, { input: { dictionaryOnly: true }, id: randomUUID() }))).status).toBe(409);
  });

  it("retains daily and monthly usage after deletion and blocks replacement-account previews and downloads", async () => {
    const signed = await member();
    const initial = await accountGet(request("/api/account", signed.cookie));
    const browserCookie = initial.headers.get("set-cookie")!.split(";")[0];
    const browser = await browserAllowance(request("/api/account", browserCookie));
    const now = Date.now();
    // Usage before this feature (or from another device) must also survive deletion.
    await db().prepare("INSERT INTO usage(subject,action,at,amount) VALUES(?,?,?,?)").run(signed.id, "exports", now - 2 * DAY, 7);
    await db().prepare("INSERT INTO usage(subject,action,at,amount) VALUES(?,?,?,?)").run(signed.id, "export-rows", now - 2 * DAY, 4000);
    await transaction(db(), () => recordBudgets(db(), exportBudgets(signed.id, 200, false, browser.subject), now - 1000));
    const id = randomUUID();
    await generateExport(signed.id, id, { dictionaryOnly: true }, browser.subject);
    await generateExport(signed.id, id, { dictionaryOnly: true }, browser.subject); // Free retry.
    await generateExport(signed.id, randomUUID(), { dictionaryOnly: true }, browser.subject);
    const deleted = await accountPost(request("/api/account", `${signed.cookie}; ${browserCookie}`, { action: "delete", confirm: "DELETE" }));
    expect(deleted.status).toBe(200);
    expect(deleted.headers.getSetCookie()).toHaveLength(2);
    expect(await db().prepare("SELECT * FROM accounts WHERE id=?").get(signed.id)).toBeUndefined();
    expect(await db().prepare("SELECT * FROM usage WHERE subject=?").all(signed.id)).toHaveLength(0);
    expect(await db().prepare("SELECT * FROM exports WHERE account=?").all(signed.id)).toHaveLength(0);
    const replacement = await member();
    const cookie = `${replacement.cookie}; ${browserCookie}`;
    const status = await (await accountGet(request("/api/account", cookie))).json();
    expect(status.allowances[0]).toMatchObject({ accountUsed: 0, browserUsed: 3, remaining: 0 });
    expect(status.allowances[2]).toMatchObject({ used: 10, remaining: 0 });
    expect(status.allowances[3]).toMatchObject({ used: 4200, remaining: 800 });
    const preview = await exportPost(request("/api/exports", cookie, { preview: true, input: { dictionaryOnly: true } }));
    expect((await preview.json()).allowance.available).toBe(false);
    expect((await exportPost(request("/api/exports", cookie, { input: { dictionaryOnly: true }, id: randomUUID() }))).status).toBe(429);
    // Refusal did not create an export or charge new usage.
    expect(await exportUsage(db(), replacement.id)).toEqual([]);
  });

  it("serializes competing accounts in the same browser and expires retained counts", async () => {
    const a = await member(), b = await member();
    const browser = await browserAllowance(request("/api/account"), true);
    const now = Date.now();
    await db().prepare("INSERT INTO usage(subject,action,at,amount) VALUES(?,?,?,?)").run(browser.subject, "exports", now - 1000, 2);
    const results = await Promise.allSettled([generateExport(a.id, randomUUID(), { dictionaryOnly: true }, browser.subject), generateExport(b.id, randomUUID(), { dictionaryOnly: true }, browser.subject)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    await prune(db(), now + 31 * DAY);
    expect(await db().prepare("SELECT * FROM usage WHERE subject=?").all(browser.subject)).toEqual([]);
    expect(ALLOWANCE_COOKIE).not.toBe("oz_session");
  });
});
