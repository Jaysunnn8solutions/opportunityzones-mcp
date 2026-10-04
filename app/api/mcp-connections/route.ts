import { z } from "zod";
import { createMcpConnection, listMcpConnections, revokeMcpConnections } from "@/lib/access/consent";
import { failure, json, limitRequest, readBody, requireMember, sameOrigin, session } from "@/lib/access/http";
import { AccessError } from "@/lib/access/store";
import { TERMS_VERSION } from "@/lib/content/siteTerms";
import { checkMcpCooldown, mcpPaused, usageStatus } from "@/lib/access/mcpPolicy";
import { browserAllowance } from "@/lib/access/browserAllowance";
import { bindMcpAllowance } from "@/lib/access/mcpAllowance";
import { securityEvent } from "@/lib/access/securityEvents";

export const runtime = "nodejs";
const issue = z.object({ action: z.literal("create"), label: z.string().trim().min(1).max(60), accepted: z.literal(true), version: z.literal(TERMS_VERSION), replace: z.string().uuid().optional() }).strict();
const revoke = z.discriminatedUnion("action", [z.object({ action: z.literal("revoke"), id: z.string().uuid() }).strict(), z.object({ action: z.literal("revoke-all") }).strict()]);
export async function GET(req: Request) {
  try {
    const account = (await session(req)); if (!account) throw new AccessError("Sign in to manage MCP connections.", 401);
    (await limitRequest(req, "read", account));
    return json({ connections: (await listMcpConnections(account.id)) });
  } catch (error) { return failure(error); }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const account = (await session(req)); if (!account) throw new AccessError("Sign in or create a free account to continue.", 401);
    (await limitRequest(req, "auth", account));
    const body = await readBody(req, 2048);
    if (body.action === "test") {
      if (typeof body.id !== "string" || !/^[\w-]{36}$/.test(body.id)) throw new AccessError("Choose a connection to check.", 400);
      const connection = (await listMcpConnections(account.id)).find((item) => item.id === body.id);
      if (!connection) throw new AccessError("Connection not found.", 404);
      if (connection.status !== "active") return json({ ready: false, message: `This connection is ${connection.status.replaceAll("-", " ")}. Replace its token and accept current terms before reconnecting.` });
      await requireMember(req);
      if (await mcpPaused()) return json({ ready: false, message: "MCP research is temporarily paused. Your connection is saved; try again later." });
      await checkMcpCooldown(account.id);
      const usage = await usageStatus(account.id);
      return json({ ready: usage.every((item) => item.remaining > 0), message: usage.some((item) => item.remaining === 0) ? "The connection is active, but an account allowance is exhausted. Check usage before retrying." : "Server checks passed: this connection is active, current terms are accepted, and account allowance is available. This does not verify your chat app configuration. Complete the connection in your chat app and ask it to run usage_status." });
    }
    const removal = revoke.safeParse(body);
    if (removal.success) { (await revokeMcpConnections(account.id, removal.data.action === "revoke" ? removal.data.id : undefined)); await securityEvent(account.id, "mcp-revoked"); return json({ revoked: true }); }
    const parsed = issue.safeParse(body);
    if (!parsed.success) throw new AccessError("Review and explicitly accept the current terms before creating or replacing a connection.", 400);
    (await requireMember(req));
    const browser = await browserAllowance(req, true);
    await bindMcpAllowance(account.id, browser.subject);
    return json((await createMcpConnection(account.id, parsed.data.label, parsed.data.replace)), 200, { "Set-Cookie": browser.cookie });
  } catch (error) { return failure(error); }
}
