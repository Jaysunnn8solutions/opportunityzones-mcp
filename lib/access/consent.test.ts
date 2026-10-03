import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { GET, POST, DELETE } from "@/app/api/consent/route";
import { CONSENT_COOKIE, createMcpConnection, hasConsent, recordConsent, revokeConsent } from "./consent";
import { assertStorageConfiguration, db, DAY } from "./store";
import { CONSENT_UNAVAILABLE } from "@/lib/client/termsConsent";
import { TERMS_VERSION } from "@/lib/content/siteTerms";

beforeEach(async () => { (await db().exec("DELETE FROM consents; DELETE FROM usage;")); });
afterEach(() => vi.unstubAllEnvs());
const website = (raw: string, path = "/map") => new NextRequest(`http://localhost:3000${path}`, { headers: { Cookie: `${CONSENT_COOKIE}=${raw}` } });
const mcp = (raw: string) => new Request("http://localhost:3000/mcp", { headers: { Authorization: `Bearer ${raw}` } });

describe("server-enforced terms acceptance", () => {
  it("detects missing production origin before offering acceptance without exposing configuration", async () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("OZ_ORIGIN", "");
    const response = await GET(new Request("https://research.example/api/consent"));
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ error: CONSENT_UNAVAILABLE });
    expect((await db().prepare("SELECT * FROM consents").all())).toHaveLength(0);
  });
  it("rejects ephemeral Vercel SQLite even if the single-host flag and temporary path are supplied", () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("VERCEL", "1");
    vi.stubEnv("OZ_SINGLE_HOST", "1"); vi.stubEnv("OZ_STORAGE_PATH", "/tmp/access.sqlite");
    expect(() => assertStorageConfiguration()).toThrow(/not supported on Vercel/);
    vi.stubEnv("VERCEL", ""); expect(() => assertStorageConfiguration()).not.toThrow();
    vi.stubEnv("OZ_STORAGE_PATH", ""); expect(() => assertStorageConfiguration()).toThrow(/persistent storage/);
    vi.stubEnv("VERCEL", "1"); vi.stubEnv("DATABASE_URL", "postgresql://test@localhost/test");
    expect(() => assertStorageConfiguration()).not.toThrow();
  });
  it("checks storage for anonymous readiness and returns a recoverable service error on failure", async () => {
    const prepare = vi.spyOn(db(), "prepare").mockImplementationOnce(() => { throw new Error("private database path"); });
    try {
      const response = await GET(new Request("http://localhost:3000/api/consent"));
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: CONSENT_UNAVAILABLE });
    } finally { prepare.mockRestore(); }
    expect((await GET(new Request("http://localhost:3000/api/consent"))).status).toBe(200);
  });
  it("rejects forged, expired, revoked, old-version, and wrong-channel receipts", async () => {
    const receipt = (await recordConsent("web"));
    expect((await hasConsent(website("true"), "web"))).toBe(false);
    expect((await hasConsent(website(receipt.token), "web"))).toBe(true);
    expect((await hasConsent(mcp(receipt.token), "mcp"))).toBe(false);
    expect((await hasConsent(website(receipt.token), "web", Date.now() + 8 * DAY))).toBe(false);
    (await db().prepare("UPDATE consents SET version='old'").run());
    expect((await hasConsent(website(receipt.token), "web"))).toBe(false);
    (await db().prepare("UPDATE consents SET version=?").run(TERMS_VERSION));
    (await revokeConsent(website(receipt.token), "web"));
    expect((await hasConsent(website(receipt.token), "web"))).toBe(false);
  });
  it("records only a hashed credential, legal document, channel, and timestamps", async () => {
    (await db().prepare("INSERT OR IGNORE INTO accounts(id,terms,created) VALUES('consent-test',?,?)").run(TERMS_VERSION, Date.now()));
    const receipt = (await createMcpConnection("consent-test", "Test app"));
    expect((await hasConsent(mcp(receipt.token), "mcp"))).toBe(true);
    expect((await hasConsent(website(receipt.token), "web"))).toBe(false);
    const row = (await db().prepare("SELECT * FROM consents").get())!;
    expect(Object.keys(row).sort()).toEqual(["hash", "version", "digest", "channel", "accepted", "expires", "revoked", "account", "connection_id"].sort());
    expect(row.account).toBe("consent-test");
    expect(JSON.stringify(row)).not.toContain(receipt.token);
    expect((await db().prepare("SELECT document FROM consent_documents WHERE digest=?").get(String(row.digest)))).toBeTruthy();
  });
  it("requires an explicit current-version same-origin acceptance and supports revocation", async () => {
    const request = (body: unknown, origin = "http://localhost:3000") => new Request("http://localhost:3000/api/consent", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    expect((await POST(request({ accepted: false, version: TERMS_VERSION, channel: "web" }))).status).toBe(400);
    expect((await POST(request({ accepted: true, version: "old", channel: "web" }))).status).toBe(400);
    expect((await POST(request({ accepted: true, version: TERMS_VERSION, channel: "web" }, "https://elsewhere.example"))).status).toBe(403);
    const result = await POST(request({ accepted: true, version: TERMS_VERSION, channel: "web" }));
    expect(result.status).toBe(200);
    expect(result.headers.get("set-cookie")).toContain("HttpOnly; SameSite=Strict");
    const cookie = result.headers.get("set-cookie")!.split(";")[0];
    expect((await hasConsent(new Request("http://localhost:3000/map", { headers: { Cookie: cookie } }), "web"))).toBe(true);
    const revoked = await DELETE(new Request("http://localhost:3000/api/consent", { method: "DELETE", headers: { Origin: "http://localhost:3000", Cookie: cookie } }));
    expect(revoked.status).toBe(200);
    expect((await hasConsent(new Request("http://localhost:3000/map", { headers: { Cookie: cookie } }), "web"))).toBe(false);
  });
  it("records consent from any local page when the embedded browser omits the Origin port", async () => {
    vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("OZ_ORIGIN", "");
    for (const page of ["/entry", "/entry/agreement?next=%2F", "/legal", "/use-with-claude"]) {
      const result = await POST(new Request("http://localhost:3000/api/consent", {
        method: "POST",
        headers: { Host: "127.0.0.1:3000", Origin: "http://127.0.0.1", Referer: `http://127.0.0.1:3000${page}`, "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json" },
        body: JSON.stringify({ accepted: true, version: TERMS_VERSION, channel: "web" }),
      }));
      expect(result.status).toBe(200);
      const cookie = result.headers.get("set-cookie")!.split(";")[0];
      expect((await hasConsent(new Request("http://127.0.0.1:3000/map", { headers: { Cookie: cookie } }), "web"))).toBe(true);
    }
  });
  it("protects direct pages, RSC, APIs, and map data even with a login cookie", async () => {
    for (const path of ["/", "/map", "/tract/53061041400", "/map?_rsc=123"]) {
      const response = (await proxy(new NextRequest(`http://localhost:3000${path}`, { headers: { Cookie: "oz_session=pretend-member", RSC: "1" } })));
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toContain("/entry?");
    }
    for (const path of ["/api/counties", "/api/status/53", "/boundaries/tracts/53.json"]) expect((await proxy(website("", path))).status).toBe(401);
    expect((await proxy(website((await recordConsent("web")).token))).headers.get("x-middleware-next")).toBe("1");
    for (const path of ["/entry", "/entry/agreement", "/legal", "/accessibility", "/use-with-claude", "/api/consent", "/entry-population-lights.svg"]) expect((await proxy(website("", path))).headers.get("x-middleware-next")).toBe("1");
  });
});
