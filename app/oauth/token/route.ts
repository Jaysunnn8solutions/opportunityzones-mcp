import { json, networkSubject } from "@/lib/access/http";
import { consume } from "@/lib/access/store";
import { exchangeCode, oauthResource } from "@/lib/access/oauth";
import { oauthBody, oauthFailure, oauthHeaders, oauthOptions } from "@/lib/access/oauthHttp";
export const OPTIONS = oauthOptions;
export async function POST(req: Request) {
  try { (await consume([{ subject: (await networkSubject(req)), action: "oauth-token", limit: 30, window: 60_000 }, { subject: "oauth-service", action: "oauth-token", limit: 500, window: 60_000 }])); return json((await exchangeCode(await oauthBody(req, true), oauthResource(req))), 200, oauthHeaders); } catch (error) { return oauthFailure(error, "invalid_grant"); }
}
