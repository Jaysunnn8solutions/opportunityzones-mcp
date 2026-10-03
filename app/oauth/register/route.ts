import { json, networkSubject } from "@/lib/access/http";
import { consume, DAY } from "@/lib/access/store";
import { registerClient } from "@/lib/access/oauth";
import { oauthBody, oauthFailure, oauthHeaders, oauthOptions } from "@/lib/access/oauthHttp";
export const OPTIONS = oauthOptions;
export async function POST(req: Request) {
  try { (await consume([{ subject: (await networkSubject(req)), action: "oauth-register", limit: 10, window: DAY }, { subject: "oauth-service", action: "oauth-register", limit: 100, window: DAY }])); return json((await registerClient(await oauthBody(req))), 201, oauthHeaders); } catch (error) { return oauthFailure(error, "invalid_client_metadata"); }
}
