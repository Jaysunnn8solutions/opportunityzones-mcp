import { hashToken, json, networkSubject } from "@/lib/access/http";
import { consume, db } from "@/lib/access/store";
import { oauthBody, oauthFailure, oauthHeaders, oauthOptions } from "@/lib/access/oauthHttp";
export const OPTIONS = oauthOptions;
export async function POST(req: Request) {
  try {
    consume([{ subject: networkSubject(req), action: "oauth-revoke", limit: 30, window: 60_000 }]);
    const value = await oauthBody(req, true) as Record<string, unknown>;
    if (typeof value.token === "string" && /^[A-Za-z0-9_-]{43}$/.test(value.token) && typeof value.client_id === "string") db().prepare("UPDATE consents SET revoked=1 WHERE hash IN (SELECT hash FROM oauth_access WHERE hash=? AND client=?)").run(hashToken(value.token), value.client_id);
    return json({}, 200, oauthHeaders);
  } catch (error) { return oauthFailure(error); }
}
