import { z } from "zod";
import { failure, json, readBody, sameOrigin } from "@/lib/access/http";
import { AccessError } from "@/lib/access/store";
import { operate, operationsStatus, requireOperator } from "@/lib/access/operations";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try { await requireOperator(req); return json(await operationsStatus()); } catch (error) { return failure(error); }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req); const account = await requireOperator(req);
    const body = z.discriminatedUnion("action", [
      z.object({ action: z.literal("pause"), service: z.enum(["exports", "signup", "mcp"]) }).strict(),
      z.object({ action: z.literal("resume"), service: z.enum(["exports", "signup", "mcp"]) }).strict(),
      ...["suspend", "restore", "revoke"].map((action) => z.object({ action: z.literal(action), target: z.string().regex(/^[\w-]{1,64}$/), confirm: z.literal("CONFIRM") }).strict()),
    ]).safeParse(await readBody(req, 2048));
    if (!body.success) throw new AccessError("Choose an operator action and confirm account changes.", 400);
    const input = body.data;
    await operate(account.id, input.action as "pause" | "resume" | "suspend" | "restore" | "revoke", "target" in input ? input.target : undefined, "service" in input ? input.service : undefined);
    return json(await operationsStatus());
  } catch (error) { return failure(error); }
}
