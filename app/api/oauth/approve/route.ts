import { browserAllowance } from "@/lib/access/browserAllowance";
import { bindMcpAllowance } from "@/lib/access/mcpAllowance";
import { approveAuthorization, authorizeParameters, oauthResource } from "@/lib/access/oauth";
import { AccessError } from "@/lib/access/store";
import { failure, json, limitRequest, requireMember, sameOrigin } from "@/lib/access/http";
import { oauthBody } from "@/lib/access/oauthHttp";
import { TERMS_VERSION } from "@/lib/content/siteTerms";
export async function POST(req: Request) {
  try {
    sameOrigin(req); (await limitRequest(req, "auth"));
    const body = await oauthBody(req);
    const validated = (await authorizeParameters(body?.parameters, oauthResource(req)));
    if (body?.preview === true) return json({ client: validated.client, destination: validated.destination });
    const account = (await requireMember(req));
    if (body?.accepted !== true || body?.version !== TERMS_VERSION) throw new AccessError("Read and explicitly accept the current terms to authorize this connection.", 400);
    const browser = await browserAllowance(req, true);
    await bindMcpAllowance(account.id, browser.subject);
    return json({ redirect: (await approveAuthorization(account.id, body.parameters, oauthResource(req))) }, 200, { "Set-Cookie": browser.cookie });
  } catch (error) { return failure(error); }
}
