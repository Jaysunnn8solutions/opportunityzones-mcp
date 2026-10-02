import { createHash, createHmac, randomBytes } from "node:crypto";
import { AccessError, consume, DAY, db, type Budget } from "./store";
import { TERMS_VERSION } from "@/lib/content/siteTerms";

export const hashToken = (value: string) => createHash("sha256").update(value).digest("hex");
export const token = () => randomBytes(32).toString("base64url");
export function cookie(req: Request, name: string) { return req.headers.get("cookie")?.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1) ?? ""; }
export function origin(req: Request) {
  const configured = process.env.OZ_ORIGIN;
  if (configured) return new URL(configured).origin;
  const url = new URL(req.url);
  if (process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(url.hostname)) {
    // Next's dev server may normalize req.url to localhost even when the
    // browser used 127.0.0.1. Only the two explicit loopback hosts are accepted.
    const host = req.headers.get("host");
    if (!host) return url.origin;
    if (!/^(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(host)) throw new AccessError("Use a local development address.", 403);
    const local = new URL(`${url.protocol}//${host}`);
    if (local.port !== url.port) throw new AccessError("Use the same development port.", 403);
    return local.origin;
  }
  throw new AccessError("The production origin is not configured.", 503);
}
export function sameOrigin(req: Request) {
  const expected = origin(req);
  const received = req.headers.get("origin");
  if (received === expected) return;
  // Some embedded development browsers omit the port from Origin. Allow only
  // that exact loopback discrepancy, corroborated by both browser headers.
  // Never use this exception on a deployed or explicitly configured origin.
  if (process.env.NODE_ENV === "development" && !process.env.OZ_ORIGIN) {
    const local = new URL(expected);
    if (["localhost", "127.0.0.1"].includes(local.hostname) && local.port &&
        received === `${local.protocol}//${local.hostname}` && req.headers.get("sec-fetch-site") === "same-origin") {
      try { if (new URL(req.headers.get("referer") ?? "").origin === expected) return; } catch { /* Invalid or missing referrers fail closed. */ }
    }
  }
  throw new AccessError("Open this action from the research website.", 403);
}
export async function readBody(req: Request, max = 32_000) {
  if (Number(req.headers.get("content-length") ?? 0) > max) throw new AccessError("Request too large.", 413);
  const reader = req.body?.getReader();
  if (!reader) throw new AccessError("A JSON request is required.", 400);
  let size = 0; const chunks: Uint8Array[] = [];
  while (true) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > max) { await reader.cancel(); throw new AccessError("Request too large.", 413); } chunks.push(next.value); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new AccessError("Invalid JSON request.", 400); }
}
export function session(req: Request) {
  const raw = cookie(req, "oz_session");
  if (!raw || raw.length > 100) return null;
  return db().prepare("SELECT a.id, a.terms, s.verified FROM sessions s JOIN accounts a ON a.id=s.account WHERE s.hash=? AND s.expires>? AND NOT EXISTS (SELECT 1 FROM settings WHERE key='account-disabled:' || a.id AND value='1')").get(hashToken(raw), Date.now()) as { id: string; terms: string; verified: number } | undefined ?? null;
}
export function requireMember(req: Request, recent = false) {
  const account = session(req);
  if (!account) throw new AccessError("Sign in to your free research account to continue.", 401);
  if (account.terms !== TERMS_VERSION) throw new AccessError("Review the current terms in your account before downloading.", 403);
  if (recent && Date.now() - account.verified > 10 * 60_000) throw new AccessError("Sign in again before changing account security.", 401);
  return account;
}
export function setCookie(name: string, value: string, seconds: number, req: Request) { return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${origin(req).startsWith("https:") ? "; Secure" : ""}`; }
export function json(value: unknown, status = 200, headers: HeadersInit = {}) { return Response.json(value, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", ...headers } }); }
export function failure(error: unknown) {
  if (error instanceof AccessError) return json({ error: error.message, retryAfter: error.retryAfter }, error.status, { "Retry-After": String(error.retryAfter) });
  return json({ error: "This service is temporarily unavailable. Your research is still here." }, 503, { "Retry-After": "60" });
}
/** Only trust a header explicitly configured at a proxy that strips the client's supplied value. */
export function networkSubject(req: Request) {
  const store = db();
  store.prepare("INSERT OR IGNORE INTO settings(key,value) VALUES('network-secret',?)").run(token());
  const secret = (store.prepare("SELECT value FROM settings WHERE key='network-secret'").get() as { value: string }).value;
  const header = process.env.OZ_TRUSTED_IP_HEADER;
  const address = header ? req.headers.get(header)?.slice(0, 200) ?? "shared" : "shared";
  // A conservative shared bucket is used when the hosting proxy is not configured.
  return `network:${createHmac("sha256", secret).update(`${Math.floor(Date.now() / DAY)}:${address}`).digest("hex")}`;
}
export function limitRequest(req: Request, action: "read" | "address" | "site" | "auth" | "download", account = session(req)) {
  const limits = { read: [300, 1200, 60_000], address: [10, 100, DAY], site: [2, 10, DAY], auth: [20, 20, 600_000], download: [10, 60, 60_000] } as const;
  const [publicLimit, memberLimit, window] = limits[action];
  const network = networkSubject(req);
  const budgets: Budget[] = [{ subject: network, action, limit: action === "address" ? 300 : action === "site" ? 50 : memberLimit * 5, window }];
  if (account) budgets.push({ subject: account.id, action, limit: memberLimit, window });
  else budgets.push({ subject: network, action: `${action}:public`, limit: publicLimit, window });
  consume(budgets);
}
