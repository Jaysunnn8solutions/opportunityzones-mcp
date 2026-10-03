import { z } from "zod";
import { CONSENT_COOKIE, createMcpConnection, hasConsent, recordConsent, revokeConsent } from "@/lib/access/consent";
import { failure, json, limitRequest, origin, readBody, requireMember, sameOrigin, setCookie } from "@/lib/access/http";
import { AccessError, consume, DAY, db } from "@/lib/access/store";
import { TERMS_VERSION } from "@/lib/content/siteTerms";
import { CONSENT_UNAVAILABLE } from "@/lib/client/termsConsent";

export const runtime = "nodejs";
const acceptance = z.object({ accepted: z.literal(true), version: z.literal(TERMS_VERSION), channel: z.enum(["web", "mcp"]) }).strict();
function consentFailure(error: unknown) {
  if (!(error instanceof AccessError) || error.status === 503) return json({ error: CONSENT_UNAVAILABLE }, 503, { "Retry-After": "60" });
  return failure(error);
}
export async function GET(req: Request) {
  try {
    // Check readiness even without a receipt, before inviting acceptance.
    origin(req);
    (await db().prepare("SELECT 1").get());
    return json({ accepted: (await hasConsent(req, "web")), version: TERMS_VERSION });
  }
  catch (error) { return consentFailure(error); }
}
export async function POST(req: Request) {
  try {
    // Validate the website request before parsing or recording acceptance.
    sameOrigin(req); (await limitRequest(req, "auth", null));
    const parsed = acceptance.safeParse(await readBody(req, 2048));
    if (!parsed.success) throw new AccessError("Explicit acceptance of the current terms is required.", 400);
    (await consume([{ subject: "service", action: "consent", limit: 10_000, window: DAY }]));
    if (parsed.data.channel === "mcp") return json({ accepted: true, ...(await createMcpConnection((await requireMember(req)).id, "MCP connection")) });
    const receipt = (await recordConsent("web"));
    return json({ accepted: true, expires: receipt.expires, version: receipt.version }, 200, { "Set-Cookie": setCookie(CONSENT_COOKIE, receipt.token, 7 * 86400, req) });
  } catch (error) { return consentFailure(error); }
}
export async function DELETE(req: Request) {
  try {
    sameOrigin(req); (await limitRequest(req, "auth", null));
    const channel = req.headers.has("authorization") ? "mcp" : "web";
    (await revokeConsent(req, channel));
    return json({ revoked: true }, 200, channel === "web" ? { "Set-Cookie": setCookie(CONSENT_COOKIE, "", 0, req) } : {});
  } catch (error) { return consentFailure(error); }
}
