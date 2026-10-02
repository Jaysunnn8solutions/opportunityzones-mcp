import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { AccessError, consume, DAY, db, prune, transaction } from "./store";
import { hashToken, origin, token } from "./http";
import { CONSENT_DIGEST, createMcpConnection } from "./consent";
import { TERMS_VERSION } from "@/lib/content/siteTerms";

export function oauthEnabled() { if (process.env.OZ_OAUTH_ENABLED !== "1") throw new AccessError("Browser MCP connection setup is not enabled on this deployment. Use a private connection token.", 503); }
export function oauthResource(req: Request) { return `${origin(req)}/mcp`; }
export function validRedirect(raw: string) {
  try { const url = new URL(raw); return raw.length <= 1000 && !url.hash && !url.username && !url.password && (url.protocol === "https:" || (url.protocol === "http:" && ["127.0.0.1", "[::1]"].includes(url.hostname))); } catch { return false; }
}
const registration = z.object({ client_name: z.string().trim().min(1).max(60).regex(/^[^\u0000-\u001f\u007f]+$/), redirect_uris: z.array(z.string().refine(validRedirect)).min(1).max(5), token_endpoint_auth_method: z.literal("none").default("none"), grant_types: z.array(z.literal("authorization_code")).length(1).default(["authorization_code"]), response_types: z.array(z.literal("code")).length(1).default(["code"]) }).strict();
export function registerClient(raw: unknown) {
  oauthEnabled(); const parsed = registration.safeParse(raw); if (!parsed.success) throw new AccessError("Use a public PKCE client with exact HTTPS or loopback redirect URIs.", 400);
  return transaction(db(), () => {
    prune(db()); const count = (db().prepare("SELECT COUNT(*) AS n FROM oauth_clients").get() as { n: number }).n;
    if (count >= 500) throw new AccessError("Client registration is temporarily full.", 503);
    const id = token(); const created = Date.now(); db().prepare("INSERT INTO oauth_clients VALUES(?,?,?,?)").run(id, parsed.data.client_name, JSON.stringify(parsed.data.redirect_uris), created);
    return { ...parsed.data, client_id: id, client_id_issued_at: Math.floor(created / 1000) };
  });
}
export const authorizationSchema = z.object({ client_id: z.string().regex(/^[A-Za-z0-9_-]{43}$/), redirect_uri: z.string().max(1000), response_type: z.literal("code"), code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/), code_challenge_method: z.literal("S256"), resource: z.string().max(1000), scope: z.literal("research:read").default("research:read"), state: z.string().min(16).max(512).regex(/^[^\u0000-\u001f\u007f]+$/) }).strict();
export function authorizeParameters(raw: unknown, resource: string) {
  oauthEnabled(); const parsed = authorizationSchema.safeParse(raw); if (!parsed.success) throw new AccessError("Invalid authorization parameters. Restart the connection from your chat client.", 400);
  const args = parsed.data;
  const client = db().prepare("SELECT id,name,redirects FROM oauth_clients WHERE id=?").get(args.client_id) as { id: string; name: string; redirects: string } | undefined;
  if (!client || !(JSON.parse(client.redirects) as string[]).includes(args.redirect_uri) || args.resource !== resource) throw new AccessError("The client, callback, or resource is not registered for this request.", 400);
  return { args, client: { id: client.id, name: client.name }, destination: new URL(args.redirect_uri).origin };
}
export function approveAuthorization(account: string, raw: unknown, resource: string) {
  const { args } = authorizeParameters(raw, resource); const now = Date.now();
  consume([{ subject: account, action: "oauth-approve", limit: 10, window: DAY }]);
  const code = token();
  db().prepare("INSERT INTO oauth_codes VALUES(?,?,?,?,?,?,?,?,?,?)").run(hashToken(code), args.client_id, account, args.redirect_uri, args.code_challenge, args.resource, now, TERMS_VERSION, CONSENT_DIGEST, now + 120_000);
  const destination = new URL(args.redirect_uri); destination.searchParams.set("code", code); destination.searchParams.set("state", args.state); destination.searchParams.set("iss", resource.slice(0, -4));
  return destination.href;
}
const exchangeSchema = z.object({ grant_type: z.literal("authorization_code"), client_id: z.string().regex(/^[A-Za-z0-9_-]{43}$/), code: z.string().regex(/^[A-Za-z0-9_-]{43}$/), redirect_uri: z.string().max(1000), resource: z.string().max(1000), code_verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/) }).strict();
export function exchangeCode(raw: unknown, resource: string) {
  oauthEnabled(); const parsed = exchangeSchema.safeParse(raw); if (!parsed.success) throw new AccessError("Invalid token request.", 400);
  const args = parsed.data;
  const approved = transaction(db(), () => {
    const row = db().prepare("SELECT * FROM oauth_codes WHERE hash=?").get(hashToken(args.code)) as { client: string; account: string; redirect: string; challenge: string; resource: string; accepted: number; version: string; digest: string; expires: number } | undefined;
    const actual = createHash("sha256").update(args.code_verifier).digest("base64url");
    if (!row || row.expires <= Date.now() || row.client !== args.client_id || row.redirect !== args.redirect_uri || row.resource !== resource || args.resource !== resource || row.version !== TERMS_VERSION || row.digest !== CONSENT_DIGEST || row.challenge.length !== actual.length || !timingSafeEqual(Buffer.from(row.challenge), Buffer.from(actual))) throw new AccessError("Authorization code is invalid, expired, or already used.", 400);
    db().prepare("DELETE FROM oauth_codes WHERE hash=?").run(hashToken(args.code)); return row;
  });
  const client = db().prepare("SELECT name FROM oauth_clients WHERE id=?").get(args.client_id) as { name: string };
  const issued = createMcpConnection(approved.account, client.name, undefined, approved.accepted, 3_600_000);
  db().prepare("INSERT INTO oauth_access VALUES(?,?,?,?)").run(hashToken(issued.token), args.client_id, resource, "research:read");
  return { access_token: issued.token, token_type: "Bearer", expires_in: Math.max(0, Math.floor((issued.expires - Date.now()) / 1000)), scope: "research:read" };
}
