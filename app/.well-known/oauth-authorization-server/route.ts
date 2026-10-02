import { failure, json, origin } from "@/lib/access/http";
import { oauthEnabled } from "@/lib/access/oauth";
export async function GET(req: Request) {
  try { oauthEnabled(); const base = origin(req); return json({ issuer: base, authorization_endpoint: `${base}/oauth/authorize`, token_endpoint: `${base}/oauth/token`, registration_endpoint: `${base}/oauth/register`, revocation_endpoint: `${base}/oauth/revoke`, response_types_supported: ["code"], grant_types_supported: ["authorization_code"], token_endpoint_auth_methods_supported: ["none"], code_challenge_methods_supported: ["S256"], scopes_supported: ["research:read"] }, 200, { "Access-Control-Allow-Origin": "*" }); } catch (error) { return failure(error); }
}
