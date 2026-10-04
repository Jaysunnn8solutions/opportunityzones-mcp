import { withMcpAllowance } from "@/lib/access/mcpAllowance";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { compareTractConfig, compareTractHandler } from "@/lib/tools/compareTract";
import { getTractConfig, getTractHandler } from "@/lib/tools/getTract";
import { listTractsConfig, listTractsHandler } from "@/lib/tools/listTracts";
import { comparePlacesConfig, comparePlacesHandler, describeResearchConfig, describeResearchHandler, getRulesConfig, getRulesHandler, lookupGeographyConfig, lookupGeographyHandler } from "@/lib/tools/researchAccess";
import { oz1FindingsConfig, oz1FindingsHandler } from "@/lib/tools/oz1Findings";
import { DISCLAIMER, text } from "@/lib/tools/shared";
import { failure, json, origin } from "@/lib/access/http";
import { AccessError, consume, DAY } from "@/lib/access/store";
import { mcpConnection, markMcpConnectionUsed } from "@/lib/access/consent";
import { mcpContext, mcpEvent, MCP_LIMITS, mcpTransport, protectedMcpTool, safeMcpInput } from "@/lib/access/mcpPolicy";
import { researchExtensions, tool } from "@/lib/tools/researchExtensions";
import { hashToken } from "@/lib/access/http";
import { db } from "@/lib/access/store";

const hostedList = listTractsConfig.inputSchema.omit({ sortBy: true, order: true }).extend({ state: z.string().regex(/^(?:[A-Za-z]{2}|\d{2})$/), limit: z.number().int().min(1).max(25).optional() }).strict();
const existing = [
  tool("describe_research", describeResearchConfig.title, describeResearchConfig.description, describeResearchConfig.inputSchema, describeResearchHandler),
  tool("lookup_geography", lookupGeographyConfig.title, lookupGeographyConfig.description, lookupGeographyConfig.inputSchema, lookupGeographyHandler),
  tool("get_rules", getRulesConfig.title, getRulesConfig.description, getRulesConfig.inputSchema, getRulesHandler),
  tool("compare_places", comparePlacesConfig.title, comparePlacesConfig.description, comparePlacesConfig.inputSchema, comparePlacesHandler, 2),
  tool("get_tract", getTractConfig.title, getTractConfig.description, getTractConfig.inputSchema, getTractHandler, 1),
  tool("list_tracts", "List published tracts", "Return up to 25 tracts in tract-number order using explicit status filters. No numeric sorting, scoring, or recommendations.", hostedList, (args) => listTractsHandler({ ...args, limit: args.limit ?? 25 }), (args) => args.limit ?? 25),
  tool("compare_tract", compareTractConfig.title, compareTractConfig.description, compareTractConfig.inputSchema, compareTractHandler, 1),
  tool("oz1_findings", oz1FindingsConfig.title, oz1FindingsConfig.description, oz1FindingsConfig.inputSchema, oz1FindingsHandler, 50),
];
const definitions = [...existing, ...researchExtensions];
definitions.push(tool("research_capabilities", "Available research capabilities", "Discover effective tool names, access limits, source boundaries and website export requirements.", z.object({}).strict(), () => text("# Research capabilities\n" + definitions.map((item) => `- ${item.name}: ${item.config.title}`).join("\n") + "\nAll hosted tools require an account-owned connection and recorded terms acceptance. No live providers or model calls. Export previews require a separate website confirmation to download.", [], { tools: definitions.map((item) => ({ name: item.name, title: item.config.title })), limits: MCP_LIMITS })));
const hostedTools = new Map(definitions.map((item) => [item.name, item]));
const handler = createMcpHandler((server) => {
  for (const definition of definitions) server.registerTool(definition.name, definition.config, async (args) => (await protectedMcpTool(definition.name, definition.rows(args), () => definition.run(args))));
}, { serverInfo: { name: "opportunityzones-mcp", version: "0.3.0" }, verboseLogs: false });

async function boundedBody(req: Request) {
  if (Number(req.headers.get("content-length") ?? 0) > 32_000) throw new AccessError("Request too large.", 413);
  const reader = req.body?.getReader(); if (!reader) throw new AccessError("A JSON request is required.", 400);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { void reader.cancel(); reject(new AccessError("Request body timed out.", 408)); }, 5000); });
  const parts: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) { const next = await Promise.race([reader.read(), deadline]); if (next.done) break; bytes += next.value.length; if (bytes > 32_000) throw new AccessError("Request too large.", 413); parts.push(next.value); }
    try { return JSON.parse(Buffer.concat(parts).toString("utf8")); } catch { throw new AccessError("Invalid JSON request.", 400); }
  } finally { clearTimeout(timer); void reader.cancel(); }
}
const envelope = z.object({ jsonrpc: z.literal("2.0"), id: z.union([z.string().max(80), z.number().int().safe(), z.null()]).optional(), method: z.string().max(60), params: z.record(z.string(), z.unknown()).optional() }).strict();
const rpcError = (id: string | number | null, code: number, message: string) => json({ jsonrpc: "2.0", id, error: { code, message, data: { disclaimer: DISCLAIMER } } });
async function registeredOrigin(req: Request) {
  const received = req.headers.get("origin");
  if (!received) return null;
  if (received === origin(req)) return received;
  if (process.env.OZ_OAUTH_ENABLED !== "1") return null;
  const clients = (await db().prepare("SELECT redirects FROM oauth_clients LIMIT 500").all()) as Array<{ redirects: string }>;
  return clients.some((client) => (JSON.parse(client.redirects) as string[]).some((url) => new URL(url).origin === received)) ? received : null;
}
export async function POST(req: Request) {
  const response = await handlePost(req);
  try {
    const allowed = (await registeredOrigin(req));
    if (allowed) {
      response.headers.set("Access-Control-Allow-Origin", allowed);
      response.headers.set("Vary", "Origin");
      response.headers.set("Access-Control-Expose-Headers", "WWW-Authenticate, Retry-After, MCP-Protocol-Version");
    }
  } catch { /* A store failure must not expose an unverified origin. */ }
  return response;
}
async function handlePost(req: Request) {
  let subject: string | undefined;
  try {
    const network = (await mcpTransport(req)); subject = network;
    const connection = (await mcpConnection(req));
    if (!connection) { (await mcpEvent(subject, "invalid-token")); return json({ error: "Sign in, accept terms, and create an MCP connection at /use-with-claude.", disclaimer: DISCLAIMER }, 401, process.env.OZ_OAUTH_ENABLED === "1" ? { "WWW-Authenticate": `Bearer resource_metadata="${origin(req)}/.well-known/oauth-protected-resource/mcp"` } : {}); }
    const oauth = (await db().prepare("SELECT a.resource,a.scope,c.redirects FROM oauth_access a JOIN oauth_clients c ON c.id=a.client WHERE a.hash=?").get(hashToken((req.headers.get("authorization") ?? "").replace(/^Bearer /i, "")))) as { resource: string; scope: string; redirects: string } | undefined;
    if (oauth && (oauth.resource !== `${origin(req)}/mcp` || oauth.scope !== "research:read")) throw new AccessError("Token is not valid for this resource.", 401);
    const callerOrigin = req.headers.get("origin");
    if (callerOrigin && callerOrigin !== origin(req) && !(oauth && (JSON.parse(oauth.redirects) as string[]).some((url) => new URL(url).origin === callerOrigin))) throw new AccessError("Origin not allowed.", 403);
    (await mcpTransport(req, connection.account)); subject = connection.account;
    const body = await boundedBody(req);
    const parsed = safeMcpInput(body) && envelope.safeParse(body);
    if (!parsed || !parsed.success) { (await mcpEvent(subject, "invalid-request")); return rpcError(null, -32600, "Invalid or oversized MCP request."); }
    const value = parsed.data;
    if (!["initialize", "notifications/initialized", "ping", "tools/list", "tools/call"].includes(value.method)) { (await mcpEvent(subject, "invalid-request")); return rpcError(value.id ?? null, -32601, "Method not supported."); }
    if (value.method === "tools/call") {
      const call = z.object({ name: z.string().max(80), arguments: z.record(z.string(), z.unknown()).optional(), _meta: z.record(z.string(), z.unknown()).optional() }).strict().safeParse(value.params);
      const definition = call.success ? hostedTools.get(call.data.name) : undefined;
      if (!call.success || !definition || !definition.config.inputSchema.safeParse(call.data.arguments ?? {}).success) { (await mcpEvent(subject, "invalid-tool")); return rpcError(value.id ?? null, -32602, "Choose an advertised tool and supported arguments. No request text was retained."); }
    } else (await consume(await withMcpAllowance([{ subject: connection.account, action: "mcp-discovery", limit: 120, window: DAY }, { subject: "mcp-service", action: "mcp-discovery", limit: 4000, window: DAY }], connection.account)));
    (await markMcpConnectionUsed(connection.id));
    const forwarded = new Request(req.url, { method: "POST", headers: req.headers, body: JSON.stringify(value) });
    const response = await mcpContext.run({ account: connection.account, network }, () => handler(forwarded));
    response.headers.set("Cache-Control", "private, no-store");
    if (callerOrigin) { response.headers.set("Access-Control-Allow-Origin", callerOrigin); response.headers.set("Vary", "Origin"); response.headers.set("Access-Control-Expose-Headers", "WWW-Authenticate, Retry-After, MCP-Protocol-Version"); }
    return response;
  } catch (reason) {
    if (subject && reason instanceof AccessError && [400, 408, 413].includes(reason.status)) (await mcpEvent(subject, "invalid-request"));
    return failure(reason);
  }
}
export async function GET() { return json({ error: "Use MCP POST requests. Persistent event streams are not offered.", disclaimer: DISCLAIMER }, 405, { Allow: "POST" }); }
export async function OPTIONS(req: Request) {
  try {
    (await mcpTransport(req)); const received = (await registeredOrigin(req));
    if (!received) throw new AccessError("Origin not allowed.", 403);
    return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": received, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id", "Access-Control-Max-Age": "300", Vary: "Origin" } });
  } catch (reason) { return failure(reason); }
}
