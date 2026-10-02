import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { POST, GET } from "@/app/api/mcp-connections/route";
import { POST as consentPost } from "@/app/api/consent/route";
import { POST as accountPost } from "@/app/api/account/route";
import { createMcpConnection, hasConsent, listMcpConnections, markMcpConnectionUsed, mcpConnection, recordConsent, revokeMcpConnections } from "./consent";
import { db, DAY, prune } from "./store";
import { hashToken } from "./http";
import { TERMS_VERSION } from "@/lib/content/siteTerms";

beforeEach(() => {
  db().exec("DELETE FROM accounts; DELETE FROM consents; DELETE FROM usage; DELETE FROM settings;");
  for (const id of ["owner", "other"]) {
    db().prepare("INSERT INTO accounts VALUES(?,?,?)").run(id, TERMS_VERSION, Date.now());
    db().prepare("INSERT INTO sessions VALUES(?,?,?,?)").run(hashToken(id), id, Date.now() + DAY, Date.now());
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
    expect(() => recordConsent("mcp")).toThrow();
    expect(db().prepare("SELECT COUNT(*) AS n FROM mcp_connections").get()?.n).toBe(0);
  });
  it("logs account, time, connection and exact document, without storing or listing usable tokens", async () => {
    const response = await POST(req(accepted));
    expect(response.status).toBe(200);
    const issued = await response.json();
    expect(hasConsent(bearer(issued.token), "mcp")).toBe(true);
    const row = db().prepare("SELECT * FROM consents WHERE account='owner'").get()!;
    expect(row.connection_id).toBe(issued.id); expect(row.accepted).toBeGreaterThan(0);
    expect(JSON.stringify(row)).not.toContain(issued.token);
    expect(db().prepare("SELECT document FROM consent_documents WHERE digest=?").get(row.digest!)?.document).toContain("MCP connections require");
    const listed = await GET(req()); expect(listed.headers.get("Cache-Control")).toContain("no-store");
    expect(JSON.stringify(await listed.json())).not.toContain(issued.token);
    expect((await (await GET(req(undefined, "other"))).json()).connections).toEqual([]);
    markMcpConnectionUsed(issued.id); expect(listMcpConnections("owner")[0].lastUsed).toBeGreaterThan(0);
  });
  it("isolates owners, rotates atomically and revokes single/all tokens", async () => {
    const first = createMcpConnection("owner", "One"), second = createMcpConnection("owner", "Two");
    expect((await POST(req({ ...accepted, replace: first.id }, "other"))).status).toBe(404);
    expect((await POST(req({ action: "revoke", id: first.id }, "other"))).status).toBe(404);
    const next = createMcpConnection("owner", "One", first.id);
    expect(hasConsent(bearer(first.token), "mcp")).toBe(false); expect(hasConsent(bearer(next.token), "mcp")).toBe(true);
    expect(db().prepare("SELECT COUNT(*) AS n FROM consents WHERE account='owner'").get()?.n).toBe(3);
    revokeMcpConnections("owner", first.id);
    expect(hasConsent(bearer(next.token), "mcp")).toBe(false); expect(hasConsent(bearer(second.token), "mcp")).toBe(true);
    revokeMcpConnections("owner"); expect(hasConsent(bearer(second.token), "mcp")).toBe(false);
  });
  it("blocks expired, legacy anonymous, outdated and suspended credentials", () => {
    const issued = createMcpConnection("owner", "One");
    expect(mcpConnection(bearer(issued.token), Date.now() + 31 * DAY)).toBeNull();
    db().prepare("UPDATE consents SET version='old'").run(); expect(hasConsent(bearer(issued.token), "mcp")).toBe(false);
    db().prepare("UPDATE consents SET version=?").run(TERMS_VERSION);
    db().prepare("INSERT INTO settings VALUES('account-disabled:owner','1')").run(); expect(hasConsent(bearer(issued.token), "mcp")).toBe(false);
    db().prepare("DELETE FROM settings").run(); db().prepare("DELETE FROM mcp_connections").run();
    expect(hasConsent(bearer(issued.token), "mcp")).toBe(false);
  });
  it("bounds active connections and rotation without resetting account usage", () => {
    const first = createMcpConnection("owner", "One");
    for (let i = 0; i < 4; i++) createMcpConnection("owner", `Other ${i}`);
    expect(() => createMcpConnection("owner", "Sixth")).toThrow("five");
    for (let i = 0; i < 5; i++) createMcpConnection("owner", "Replacement", first.id);
    expect(() => createMcpConnection("owner", "Too many", first.id)).toThrow("allowance");
    expect(db().prepare("SELECT SUM(amount) AS n FROM usage WHERE subject='owner' AND action='mcp-issue'").get()?.n).toBe(10);
  });
  it("allows revocation after terms change and cascades deletion to consent records", async () => {
    const issued = createMcpConnection("owner", "One");
    db().prepare("UPDATE accounts SET terms='old' WHERE id='owner'").run();
    expect((await POST(req({ action: "revoke", id: issued.id }))).status).toBe(200);
    db().prepare("UPDATE accounts SET terms=? WHERE id='owner'").run(TERMS_VERSION);
    createMcpConnection("owner", "One", issued.id);
    expect((await accountPost(req({ action: "delete", confirm: "DELETE" }))).status).toBe(200);
    expect(listMcpConnections("owner")).toEqual([]);
    expect(db().prepare("SELECT COUNT(*) AS n FROM consents WHERE account='owner'").get()?.n).toBe(0);
  });
  it("prunes retired acceptance records without deleting a newly rotated connection", () => {
    const old = createMcpConnection("owner", "One", undefined, Date.now() - 91 * DAY);
    createMcpConnection("owner", "One", old.id);
    prune(db()); expect(listMcpConnections("owner")).toHaveLength(1);
    expect(db().prepare("SELECT COUNT(*) AS n FROM consents WHERE account='owner'").get()?.n).toBe(1);
  });
  it("does not expose connections for guessed identifiers or anonymous listing", async () => {
    expect((await GET(req(undefined, "missing"))).status).toBe(401);
    expect((await POST(req({ action: "revoke", id: randomUUID() }))).status).toBe(404);
  });
  it("protects passkey removal with ownership, recent verification and a last-key safeguard", async () => {
    for (const [id, owner] of [["first", "owner"], ["second", "owner"], ["foreign", "other"]]) db().prepare("INSERT INTO credentials VALUES(?,?,?,0,'[]')").run(id, owner, new Uint8Array([1]));
    expect((await accountPost(req({ action: "remove-passkey", id: "foreign" }))).status).toBe(404);
    db().prepare("UPDATE sessions SET verified=? WHERE account='owner'").run(Date.now() - DAY);
    expect((await accountPost(req({ action: "remove-passkey", id: "first" }))).status).toBe(401);
    db().prepare("UPDATE sessions SET verified=? WHERE account='owner'").run(Date.now());
    db().prepare("INSERT INTO sessions VALUES(?,?,?,?)").run(hashToken("other-device"), "owner", Date.now() + DAY, Date.now());
    expect((await accountPost(req({ action: "remove-passkey", id: "first" }))).status).toBe(200);
    expect(db().prepare("SELECT COUNT(*) AS n FROM sessions WHERE account='owner'").get()?.n).toBe(1);
    expect((await accountPost(req({ action: "remove-passkey", id: "second" }))).status).toBe(409);
  });
});
