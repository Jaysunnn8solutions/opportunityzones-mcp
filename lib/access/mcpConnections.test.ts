import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { POST, GET } from "@/app/api/mcp-connections/route";
import { POST as consentPost } from "@/app/api/consent/route";
import { POST as accountPost } from "@/app/api/account/route";
import { createMcpConnection, hasConsent, listMcpConnections, markMcpConnectionUsed, mcpConnection, recordConsent, revokeMcpConnections } from "./consent";
import { db, DAY, prune } from "./store";
import { hashToken } from "./http";
import { TERMS_VERSION } from "@/lib/content/siteTerms";

beforeEach(async () => {
  (await db().exec("DELETE FROM accounts; DELETE FROM consents; DELETE FROM usage; DELETE FROM settings;"));
  for (const id of ["owner", "other"]) {
    (await db().prepare("INSERT INTO accounts VALUES(?,?,?)").run(id, TERMS_VERSION, Date.now()));
    (await db().prepare("INSERT INTO sessions VALUES(?,?,?,?)").run(hashToken(id), id, Date.now() + DAY, Date.now()));
  }
});
const req = (body?: unknown, owner = "owner", origin = "http://localhost:3000") => new Request("http://localhost:3000/api/mcp-connections", { method: body ? "POST" : "GET", headers: { Cookie: `oz_session=${owner}`, Origin: origin, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
const bearer = (token: string) => new Request("http://localhost:3000/mcp", { headers: { Authorization: `Bearer ${token}` } });
const accepted = { action: "create", label: "Desktop chat", accepted: true, version: TERMS_VERSION };

describe("account-owned MCP connections", () => {
  it("requires login and explicit current-version acceptance on both issuance endpoints", async () => {
    expect((await POST(req(accepted, "missing"))).status).toBe(401);
    expect((await POST(req({ ...accepted, accepted: false }))).status).toBe(400);
    expect((await POST(req({ ...accepted, version: "old" }))).status).toBe(400);
    expect((await POST(req(accepted, "owner", "https://attacker.example"))).status).toBe(403);
    expect((await consentPost(req({ accepted: true, version: TERMS_VERSION, channel: "mcp" }, "missing"))).status).toBe(401);
    await expect(async () => (await recordConsent("mcp"))).rejects.toThrow();
    expect((await db().prepare("SELECT COUNT(*) AS n FROM mcp_connections").get())?.n).toBe(0);
  });
  it("logs account, time, connection and exact document, without storing or listing usable tokens", async () => {
    const response = await POST(req(accepted));
    expect(response.status).toBe(200);
    const issued = await response.json();
    expect((await hasConsent(bearer(issued.token), "mcp"))).toBe(true);
    const row = (await db().prepare("SELECT * FROM consents WHERE account='owner'").get())!;
    expect(row.connection_id).toBe(issued.id); expect(row.accepted).toBeGreaterThan(0);
    expect(JSON.stringify(row)).not.toContain(issued.token);
    expect((await db().prepare("SELECT document FROM consent_documents WHERE digest=?").get(String(row.digest)))?.document).toContain("MCP connections require");
    const listed = await GET(req()); expect(listed.headers.get("Cache-Control")).toContain("no-store");
    expect(JSON.stringify(await listed.json())).not.toContain(issued.token);
    expect((await (await GET(req(undefined, "other"))).json()).connections).toEqual([]);
    (await markMcpConnectionUsed(issued.id)); expect((await listMcpConnections("owner"))[0].lastUsed).toBeGreaterThan(0);
  });
  it("isolates owners, rotates atomically and revokes single/all tokens", async () => {
    const first = (await createMcpConnection("owner", "One")), second = (await createMcpConnection("owner", "Two"));
    expect((await POST(req({ ...accepted, replace: first.id }, "other"))).status).toBe(404);
    expect((await POST(req({ action: "revoke", id: first.id }, "other"))).status).toBe(404);
    const next = (await createMcpConnection("owner", "One", first.id));
    expect((await hasConsent(bearer(first.token), "mcp"))).toBe(false); expect((await hasConsent(bearer(next.token), "mcp"))).toBe(true);
    expect((await db().prepare("SELECT COUNT(*) AS n FROM consents WHERE account='owner'").get())?.n).toBe(3);
    (await revokeMcpConnections("owner", first.id));
    expect((await hasConsent(bearer(next.token), "mcp"))).toBe(false); expect((await hasConsent(bearer(second.token), "mcp"))).toBe(true);
    (await revokeMcpConnections("owner")); expect((await hasConsent(bearer(second.token), "mcp"))).toBe(false);
  });
  it("blocks expired, legacy anonymous, outdated and suspended credentials", async () => {
    const issued = (await createMcpConnection("owner", "One"));
    expect((await mcpConnection(bearer(issued.token), Date.now() + 31 * DAY))).toBeNull();
    (await db().prepare("UPDATE consents SET version='old'").run()); expect((await hasConsent(bearer(issued.token), "mcp"))).toBe(false);
    (await db().prepare("UPDATE consents SET version=?").run(TERMS_VERSION));
    (await db().prepare("INSERT INTO settings VALUES('account-disabled:owner','1')").run()); expect((await hasConsent(bearer(issued.token), "mcp"))).toBe(false);
    (await db().prepare("DELETE FROM settings").run()); (await db().prepare("DELETE FROM mcp_connections").run());
    expect((await hasConsent(bearer(issued.token), "mcp"))).toBe(false);
  });
  it("bounds active connections and rotation without resetting account usage", async () => {
    const first = (await createMcpConnection("owner", "One"));
    for (let i = 0; i < 4; i++) (await createMcpConnection("owner", `Other ${i}`));
    await expect(async () => (await createMcpConnection("owner", "Sixth"))).rejects.toThrow("five");
    for (let i = 0; i < 5; i++) (await createMcpConnection("owner", "Replacement", first.id));
    await expect(async () => (await createMcpConnection("owner", "Too many", first.id))).rejects.toThrow("allowance");
    expect((await db().prepare("SELECT SUM(amount) AS n FROM usage WHERE subject='owner' AND action='mcp-issue'").get())?.n).toBe(10);
  });
  it("allows revocation after terms change and cascades deletion to consent records", async () => {
    const issued = (await createMcpConnection("owner", "One"));
    (await db().prepare("UPDATE accounts SET terms='old' WHERE id='owner'").run());
    expect((await POST(req({ action: "revoke", id: issued.id }))).status).toBe(200);
    (await db().prepare("UPDATE accounts SET terms=? WHERE id='owner'").run(TERMS_VERSION));
    (await createMcpConnection("owner", "One", issued.id));
    expect((await accountPost(req({ action: "delete", confirm: "DELETE" }))).status).toBe(200);
    expect((await listMcpConnections("owner"))).toEqual([]);
    expect((await db().prepare("SELECT COUNT(*) AS n FROM consents WHERE account='owner'").get())?.n).toBe(0);
  });
  it("prunes retired acceptance records without deleting a newly rotated connection", async () => {
    const old = (await createMcpConnection("owner", "One", undefined, Date.now() - 91 * DAY));
    (await createMcpConnection("owner", "One", old.id));
    (await prune(db())); expect((await listMcpConnections("owner"))).toHaveLength(1);
    expect((await db().prepare("SELECT COUNT(*) AS n FROM consents WHERE account='owner'").get())?.n).toBe(1);
  });
  it("does not expose connections for guessed identifiers or anonymous listing", async () => {
    expect((await GET(req(undefined, "missing"))).status).toBe(401);
    expect((await POST(req({ action: "revoke", id: randomUUID() }))).status).toBe(404);
  });
  it("protects passkey removal with ownership, recent verification and a last-key safeguard", async () => {
    for (const [id, owner] of [["first", "owner"], ["second", "owner"], ["foreign", "other"]]) (await db().prepare("INSERT INTO credentials VALUES(?,?,?,0,'[]')").run(id, owner, new Uint8Array([1])));
    expect((await accountPost(req({ action: "remove-passkey", id: "foreign" }))).status).toBe(404);
    (await db().prepare("UPDATE sessions SET verified=? WHERE account='owner'").run(Date.now() - DAY));
    expect((await accountPost(req({ action: "remove-passkey", id: "first" }))).status).toBe(401);
    (await db().prepare("UPDATE sessions SET verified=? WHERE account='owner'").run(Date.now()));
    (await db().prepare("INSERT INTO sessions VALUES(?,?,?,?)").run(hashToken("other-device"), "owner", Date.now() + DAY, Date.now()));
    expect((await accountPost(req({ action: "remove-passkey", id: "first" }))).status).toBe(200);
    expect((await db().prepare("SELECT COUNT(*) AS n FROM sessions WHERE account='owner'").get())?.n).toBe(1);
    expect((await accountPost(req({ action: "remove-passkey", id: "second" }))).status).toBe(409);
  });
});
