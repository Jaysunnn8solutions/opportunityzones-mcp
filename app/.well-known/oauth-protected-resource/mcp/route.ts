import { failure, json, origin } from "@/lib/access/http";
import { oauthEnabled } from "@/lib/access/oauth";
export async function GET(req: Request) {
  try { oauthEnabled(); const base = origin(req); return json({ resource: `${base}/mcp`, authorization_servers: [base], scopes_supported: ["research:read"], bearer_methods_supported: ["header"], resource_name: "Opportunity Zone Research" }, 200, { "Access-Control-Allow-Origin": "*" }); } catch (error) { return failure(error); }
}
