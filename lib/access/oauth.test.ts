import { createHash } from "node:crypto";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { approveAuthorization, authorizeParameters, exchangeCode, registerClient, validRedirect } from "./oauth";
import { db } from "./store";
import { mcpConnection, revokeMcpConnections } from "./consent";
import { TERMS_VERSION } from "@/lib/content/siteTerms";
import { POST as approvePost } from "@/app/api/oauth/approve/route";
const resource = "http://localhost:3000/mcp";
const verifier = "a".repeat(64);
beforeEach(async () => { vi.stubEnv("OZ_OAUTH_ENABLED", "1"); (await db().exec("DELETE FROM consents; DELETE FROM oauth_codes; DELETE FROM oauth_clients; DELETE FROM usage;")); (await db().prepare("INSERT OR IGNORE INTO accounts VALUES('oauth-test',?,?)").run(TERMS_VERSION, Date.now())); });
afterEach(() => vi.unstubAllEnvs());
async function request() {
  const client = (await registerClient({ client_name: "Test research app", redirect_uris: ["https://client.example/callback"] }));
  return { client_id: client.client_id, redirect_uri: client.redirect_uris[0], response_type: "code", code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", resource, state: "state-01234567890123456789", scope: "research:read" };
}
it("requires exact registered redirects, resource, S256 and explicit signed-in approval", async () => {
  const args = (await request());
  await expect(async () => (await authorizeParameters({ ...args, redirect_uri: "https://attacker.example/callback" }, resource))).rejects.toThrow();
  await expect(async () => (await authorizeParameters({ ...args, code_challenge_method: "plain" }, resource))).rejects.toThrow();
  await expect(async () => (await authorizeParameters({ ...args, resource: "https://other.example/mcp" }, resource))).rejects.toThrow();
  expect(validRedirect("javascript:alert(1)")).toBe(false); expect(validRedirect("https://name:secret@client.example/callback")).toBe(false); expect(validRedirect("http://127.0.0.1:8080/callback")).toBe(true);
  const response = await approvePost(new Request("http://localhost:3000/api/oauth/approve", { method: "POST", headers: { Origin: "http://localhost:3000", "Content-Type": "application/json" }, body: JSON.stringify({ parameters: args, accepted: true, version: TERMS_VERSION }) }));
  expect(response.status).toBe(401); expect((await db().prepare("SELECT * FROM oauth_codes").all())).toHaveLength(0);
});
it("exchanges a one-time PKCE code for a hashed, expiring, revocable account connection", async () => {
  const args = (await request()); const redirect = new URL((await approveAuthorization("oauth-test", args, resource)));
  expect(redirect.origin).toBe("https://client.example"); expect(redirect.searchParams.get("state")).toBe(args.state);
  const body = { grant_type: "authorization_code", code: redirect.searchParams.get("code"), client_id: args.client_id, redirect_uri: args.redirect_uri, resource, code_verifier: verifier };
  await expect(async () => (await exchangeCode({ ...body, code_verifier: "b".repeat(64) }, resource))).rejects.toThrow();
  const result = (await exchangeCode(body, resource)); expect(result.expires_in).toBeLessThanOrEqual(3600);
  const authenticated = new Request(resource, { headers: { Authorization: `Bearer ${result.access_token}` } });
  expect((await mcpConnection(authenticated))?.account).toBe("oauth-test");
  expect(JSON.stringify((await db().prepare("SELECT * FROM consents").all()))).not.toContain(result.access_token);
  await expect(async () => (await exchangeCode(body, resource))).rejects.toThrow();
  (await revokeMcpConnections("oauth-test")); expect((await mcpConnection(authenticated))).toBeNull();
});
it("rejects expired approvals and supports deployment opt-in", async () => {
  const args = (await request()); const code = new URL((await approveAuthorization("oauth-test", args, resource))).searchParams.get("code");
  (await db().prepare("UPDATE oauth_codes SET expires=0").run());
  await expect(async () => (await exchangeCode({ grant_type: "authorization_code", code, client_id: args.client_id, redirect_uri: args.redirect_uri, resource, code_verifier: verifier }, resource))).rejects.toThrow();
  vi.stubEnv("OZ_OAUTH_ENABLED", "0"); await expect(async () => (await authorizeParameters(args, resource))).rejects.toThrow(/not enabled/);
});
