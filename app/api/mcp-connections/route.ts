import { z } from "zod";
import { createMcpConnection, listMcpConnections, revokeMcpConnections } from "@/lib/access/consent";
import { failure, json, limitRequest, readBody, requireMember, sameOrigin, session } from "@/lib/access/http";
import { AccessError } from "@/lib/access/store";
import { TERMS_VERSION } from "@/lib/content/siteTerms";

export const runtime = "nodejs";
const issue = z.object({ action: z.literal("create"), label: z.string().trim().min(1).max(60), accepted: z.literal(true), version: z.literal(TERMS_VERSION), replace: z.string().uuid().optional() }).strict();
const revoke = z.discriminatedUnion("action", [z.object({ action: z.literal("revoke"), id: z.string().uuid() }).strict(), z.object({ action: z.literal("revoke-all") }).strict()]);
export async function GET(req: Request) {
  try {
    const account = session(req); if (!account) throw new AccessError("Sign in to manage MCP connections.", 401);
    limitRequest(req, "read", account);
    return json({ connections: listMcpConnections(account.id) });
  } catch (error) { return failure(error); }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const account = session(req); if (!account) throw new AccessError("Sign in or create a free account to continue.", 401);
    limitRequest(req, "auth", account);
    const body = await readBody(req, 2048);
    const removal = revoke.safeParse(body);
    if (removal.success) { revokeMcpConnections(account.id, removal.data.action === "revoke" ? removal.data.id : undefined); return json({ revoked: true }); }
    const parsed = issue.safeParse(body);
    if (!parsed.success) throw new AccessError("Review and explicitly accept the current terms before creating or replacing a connection.", 400);
    requireMember(req);
    return json(createMcpConnection(account.id, parsed.data.label, parsed.data.replace));
  } catch (error) { return failure(error); }
}
