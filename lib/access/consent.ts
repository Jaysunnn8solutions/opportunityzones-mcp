import { securityEvent } from "./securityEvents";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { TERMS_VERSION, DISCLAIMER_SECTIONS, TERMS_SECTIONS, PRIVACY_SECTIONS, LEGAL_OPERATOR } from "@/lib/content/siteTerms";
import { cookie } from "./http";
import { withMcpAllowance } from "./mcpAllowance";
import { AccessError, DAY, db, transaction, checkBudgets, recordBudgets } from "./store";

export const CONSENT_COOKIE = "oz_consent";
const document = JSON.stringify({ version: TERMS_VERSION, operator: LEGAL_OPERATOR, disclaimer: DISCLAIMER_SECTIONS, terms: TERMS_SECTIONS, privacy: PRIVACY_SECTIONS });
export const CONSENT_DIGEST = createHash("sha256").update(document).digest("hex");
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export type ConsentChannel = "web" | "mcp";
export function consentToken(req: Request, channel: ConsentChannel) {
  return channel === "web" ? cookie(req, CONSENT_COOKIE) : /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(req.headers.get("authorization") ?? "")?.[1] ?? "";
}
export async function hasConsent(req: Request, channel: ConsentChannel, now = Date.now()) {
  if (channel === "mcp") return !!(await mcpConnection(req, now));
  const raw = consentToken(req, channel);
  if (!/^[A-Za-z0-9_-]{43}$/.test(raw)) return false;
  return !!(await db().prepare("SELECT 1 FROM consents WHERE hash=? AND version=? AND digest=? AND channel=? AND expires>? AND revoked=0").get(hash(raw), TERMS_VERSION, CONSENT_DIGEST, channel, now));
}
export async function requireConsent(req: Request, channel: ConsentChannel) {
  if (!(await hasConsent(req, channel))) throw new AccessError(channel === "mcp" ? "Review and accept the current terms at /use-with-claude, then supply your MCP access token in the Authorization header." : "Review and accept the current terms before using the research service.", 401);
}
/** No identity, IP, user agent, search, or tool arguments are included in the receipt. */
export async function recordConsent(channel: ConsentChannel, now = Date.now()) {
  if (channel === "mcp") throw new AccessError("Sign in and create an account-owned MCP connection.", 401);
  const raw = randomBytes(32).toString("base64url"), store = db();
  const expires = now + 7 * DAY;
  (await transaction(store, async () => {
    (await store.prepare("INSERT OR IGNORE INTO consent_documents(digest,version,document) VALUES(?,?,?)").run(CONSENT_DIGEST, TERMS_VERSION, document));
    (await store.prepare("INSERT INTO consents(hash,version,digest,channel,accepted,expires) VALUES(?,?,?,?,?,?)").run(hash(raw), TERMS_VERSION, CONSENT_DIGEST, channel, now, expires));
  }));
  return { token: raw, expires, version: TERMS_VERSION };
}

export type McpConnectionSummary = { id: string; label: string; created: number; accepted: number; expires: number; lastUsed: number | null; version: string; digest: string; status: "active" | "revoked" | "expired" | "terms-changed" };
export async function listMcpConnections(account: string, now = Date.now()): Promise<McpConnectionSummary[]> {
  const rows = (await db().prepare('SELECT c.id,c.label,c.created,c.last_used AS "lastUsed",r.accepted,r.expires,r.version,r.digest,r.revoked FROM mcp_connections c JOIN consents r ON r.hash=c.consent_hash WHERE c.account=? ORDER BY (r.revoked=0 AND r.expires>?) DESC, c.created DESC LIMIT 100').all(account, now)) as Array<Omit<McpConnectionSummary, "status"> & { revoked: number }>;
  return rows.map(({ revoked, ...row }) => ({ ...row, status: revoked ? "revoked" : row.expires <= now ? "expired" : row.version !== TERMS_VERSION || row.digest !== CONSENT_DIGEST ? "terms-changed" : "active" }));
}

/** Called only after explicit acceptance and session verification by a route. */
export async function createMcpConnection(account: string, label: string, replace?: string, now = Date.now(), lifetime = 30 * DAY) {
  if (!label.trim() || label.length > 60 || /[\u0000-\u001f\u007f]/.test(label)) throw new AccessError("Use a connection name of 1–60 characters.", 400);
  const store = db();
  return (await transaction(store, async () => {
    if (!(await store.prepare("SELECT 1 FROM accounts WHERE id=? AND terms=? AND NOT EXISTS (SELECT 1 FROM settings WHERE key='account-disabled:' || accounts.id AND value='1')").get(account, TERMS_VERSION))) throw new AccessError("Sign in and accept the current account terms.", 401);
    const previous = replace ? (await store.prepare("SELECT consent_hash FROM mcp_connections WHERE id=? AND account=?").get(replace, account)) as { consent_hash: string } | undefined : undefined;
    if (replace && !previous) throw new AccessError("Connection not found.", 404);
    const count = (await store.prepare("SELECT COUNT(*) AS n FROM mcp_connections c JOIN consents r ON r.hash=c.consent_hash WHERE c.account=? AND r.revoked=0 AND r.expires>?").get(account, now)) as { n: number };
    const replacingActive = previous && (await store.prepare("SELECT 1 FROM consents WHERE hash=? AND revoked=0 AND expires>?").get(previous.consent_hash, now));
    if (count.n - (replacingActive ? 1 : 0) >= 5) throw new AccessError("You can have five active MCP connections. Revoke one before creating another.", 409);
    const budgets = await withMcpAllowance([{ subject: account, action: "mcp-issue", limit: 10, window: DAY }], account, now);
    (await checkBudgets(store, budgets, now));
    const id = replace ?? randomUUID(), raw = randomBytes(32).toString("base64url"), digest = hash(raw), expires = now + Math.min(30 * DAY, Math.max(60_000, lifetime));
    (await store.prepare("INSERT OR IGNORE INTO consent_documents(digest,version,document) VALUES(?,?,?)").run(CONSENT_DIGEST, TERMS_VERSION, document));
    (await store.prepare("INSERT INTO consents(hash,version,digest,channel,accepted,expires,account,connection_id) VALUES(?,?,?,'mcp',?,?,?,?)").run(digest, TERMS_VERSION, CONSENT_DIGEST, now, expires, account, id));
    if (previous) {
      (await store.prepare("UPDATE consents SET revoked=1 WHERE hash=?").run(previous.consent_hash));
      (await store.prepare("UPDATE mcp_connections SET consent_hash=?,label=?,last_used=NULL WHERE id=? AND account=?").run(digest, label.trim(), id, account));
    } else (await store.prepare("INSERT INTO mcp_connections(id,account,label,consent_hash,created) VALUES(?,?,?,?,?)").run(id, account, label.trim(), digest, now));
    (await recordBudgets(store, budgets, now));
    await securityEvent(account, "mcp-created", now);
    return { id, token: raw, expires, version: TERMS_VERSION };
  }));
}

export async function revokeMcpConnections(account: string, id?: string) {
  const store = db();
  if (id && !(await store.prepare("SELECT 1 FROM mcp_connections WHERE id=? AND account=?").get(id, account))) throw new AccessError("Connection not found.", 404);
  (await store.prepare(`UPDATE consents SET revoked=1 WHERE account=? AND channel='mcp'${id ? " AND connection_id=?" : ""}`).run(...(id ? [account, id] : [account])));
}

export async function mcpConnection(req: Request, now = Date.now()) {
  const raw = consentToken(req, "mcp");
  if (!/^[A-Za-z0-9_-]{43}$/.test(raw)) return null;
  return (await db().prepare(`SELECT c.id,c.account FROM mcp_connections c
    JOIN consents r ON r.hash=c.consent_hash AND r.account=c.account AND r.connection_id=c.id
    JOIN accounts a ON a.id=c.account WHERE r.hash=? AND r.channel='mcp' AND r.version=? AND r.digest=?
    AND r.expires>? AND r.revoked=0 AND a.terms=?
    AND NOT EXISTS (SELECT 1 FROM settings WHERE key='account-disabled:' || a.id AND value='1')`).get(hash(raw), TERMS_VERSION, CONSENT_DIGEST, now, TERMS_VERSION)) as { id: string; account: string } | undefined ?? null;
}

export async function markMcpConnectionUsed(id: string, now = Date.now()) {
  // Coarse operational timestamp only; no queries or tool arguments.
  (await db().prepare("UPDATE mcp_connections SET last_used=? WHERE id=? AND (last_used IS NULL OR last_used<?)").run(now, id, now - 60_000));
}
export async function revokeConsent(req: Request, channel: ConsentChannel) {
  const raw = consentToken(req, channel);
  if (/^[A-Za-z0-9_-]{43}$/.test(raw)) (await db().prepare("UPDATE consents SET revoked=1 WHERE hash=? AND channel=?").run(hash(raw), channel));
}
