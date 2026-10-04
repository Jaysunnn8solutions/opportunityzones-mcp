import { randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import { DAY, db } from "./store";
import { hashToken } from "./http";
import { TERMS_VERSION } from "@/lib/content/siteTerms";
import { GET, POST } from "@/app/api/account/route";
import { POST as retryDownload } from "@/app/api/account/download/route";
import { POST as connectionAction } from "@/app/api/mcp-connections/route";
import { createMcpConnection } from "./consent";
import { generateExport } from "./exports";

const origin = "http://localhost:3000";
function request(cookie: string, body?: unknown, path = "/api/account", from = origin) { return new Request(`${origin}${path}`, { method: body ? "POST" : "GET", headers: { Cookie: cookie, Origin: from, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
async function member() {
  const id = randomUUID(), raw = randomUUID(), credential = randomUUID();
  await db().prepare("INSERT INTO accounts VALUES(?,?,?)").run(id, TERMS_VERSION, Date.now());
  await db().prepare("INSERT INTO sessions VALUES(?,?,?,?)").run(hashToken(raw), id, Date.now() + DAY, Date.now());
  await db().prepare("INSERT INTO credentials VALUES(?,?,?,?,?)").run(credential, id, new Uint8Array([1, 2]), 0, "[]");
  return { id, raw, credential, cookie: `oz_session=${raw}` };
}
beforeEach(async () => { vi.unstubAllEnvs(); await db().exec("DELETE FROM accounts; DELETE FROM usage; DELETE FROM settings;"); });

it("names only owned passkeys, requires recent authentication, and keeps unknown legacy dates explicit", async () => {
  const a = await member(), b = await member();
  const result = await POST(request(a.cookie, { action: "rename-passkey", id: a.credential, label: "Laptop" }));
  expect(result.status).toBe(200);
  const profile = await (await GET(request(a.cookie))).json();
  expect(profile.passkeys[0]).toMatchObject({ label: "Laptop", created: null, lastUsed: null });
  expect((await POST(request(a.cookie, { action: "rename-passkey", id: b.credential, label: "Other" }))).status).toBe(404);
  expect((await POST(request(a.cookie, { action: "rename-passkey", id: a.credential, label: "x".repeat(61) }))).status).toBe(400);
  await db().prepare("UPDATE sessions SET verified=? WHERE account=?").run(Date.now() - DAY, a.id);
  expect((await POST(request(a.cookie, { action: "rename-passkey", id: a.credential, label: "Desktop" }))).status).toBe(401);
});

it("lists safe session IDs and revokes only an owned session", async () => {
  const a = await member(), b = await member(), second = randomUUID();
  await db().prepare("INSERT INTO sessions VALUES(?,?,?,?)").run(hashToken(second), a.id, Date.now() + DAY, Date.now());
  const profile = await (await GET(request(a.cookie))).json();
  expect(profile.sessions).toHaveLength(2);
  expect(JSON.stringify(profile.sessions)).not.toContain(hashToken(a.raw));
  const other = profile.sessions.find((item: { current: number }) => !item.current);
  expect((await POST(request(b.cookie, { action: "revoke-session", id: other.id }))).status).toBe(404);
  expect((await POST(request(a.cookie, { action: "revoke-session", id: other.id }))).status).toBe(200);
  expect((await (await GET(request(`oz_session=${second}`))).json()).member).toBe(false);
  expect((await (await GET(request(a.cookie))).json()).member).toBe(true);
});

it("exports account records without secrets and removes added metadata on account deletion", async () => {
  const a = await member(), recovery = "private-recovery-secret";
  await db().prepare("INSERT INTO recovery VALUES(?,?)").run(hashToken(recovery), a.id);
  await POST(request(a.cookie, { action: "rename-passkey", id: a.credential, label: "Phone" }));
  await POST(request(a.cookie, { action: "accept-terms", terms: TERMS_VERSION }));
  const records = await POST(request(a.cookie, { action: "account-records" }));
  expect(records.status).toBe(200);
  const body = await records.json(), text = JSON.stringify(body);
  expect(body.acceptances[0]).toMatchObject({ version: TERMS_VERSION });
  expect(body.recovery.remaining).toBe(1);
  for (const secret of [a.raw, hashToken(a.raw), recovery, hashToken(recovery), '"public_key"', '"body"']) expect(text).not.toContain(secret);
  expect((await POST(request(a.cookie, { action: "delete", confirm: "DELETE" }))).status).toBe(200);
  for (const table of ["credential_details", "session_details", "account_acceptances"]) expect(await db().prepare(`SELECT * FROM ${table}`).all()).toEqual([]);
});

it("retries only owned unexpired files without changing export usage", async () => {
  const a = await member(), b = await member(), id = randomUUID();
  await generateExport(a.id, id, { dictionaryOnly: true });
  const before = await db().prepare("SELECT * FROM usage WHERE subject=? AND action='exports'").all(a.id);
  const response = await retryDownload(request(a.cookie, { id }, "/api/account/download"));
  expect(response.status).toBe(200); expect(response.headers.get("content-type")).toBe("application/zip");
  expect(await db().prepare("SELECT * FROM usage WHERE subject=? AND action='exports'").all(a.id)).toEqual(before);
  expect((await retryDownload(request(b.cookie, { id }, "/api/account/download"))).status).toBe(404);
  expect((await retryDownload(request(a.cookie, { id }, "/api/account/download", "https://other.example"))).status).toBe(403);
  await db().prepare("UPDATE exports SET at=? WHERE id=?").run(Date.now() - 3_600_001, id);
  expect((await retryDownload(request(a.cookie, { id }, "/api/account/download"))).status).toBe(404);
});

it("checks owned MCP connections without provider calls and distinguishes revocation and exhausted quotas", async () => {
  const a = await member(), b = await member();
  const connection = await createMcpConnection(a.id, "Desktop chat");
  const req = (cookie = a.cookie) => request(cookie, { action: "test", id: connection.id }, "/api/mcp-connections");
  expect((await (await connectionAction(req())).json()).ready).toBe(true);
  expect((await connectionAction(req(b.cookie))).status).toBe(404);
  await db().prepare("INSERT INTO usage(subject,action,at,amount) VALUES(?,?,?,?)").run(a.id, "mcp-calls", Date.now(), 500);
  expect((await (await connectionAction(req())).json()).message).toContain("exhausted");
  await connectionAction(request(a.cookie, { action: "revoke", id: connection.id }, "/api/mcp-connections"));
  expect((await (await connectionAction(req())).json()).message).toContain("revoked");
});
