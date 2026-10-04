import { db, AccessError } from "@/lib/access/store";
import { failure, limitRequest, readBody, requireMember, sameOrigin } from "@/lib/access/http";

export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const account = await requireMember(req);
    await limitRequest(req, "download", account);
    const body = await readBody(req, 1024);
    if (typeof body.id !== "string" || !/^[\w-]{16,80}$/.test(body.id)) throw new AccessError("Choose a recent download.", 400);
    const file = await db().prepare("SELECT body,filename,mime FROM exports WHERE id=? AND account=? AND at>? AND body IS NOT NULL").get(body.id, account.id, Date.now() - 3_600_000) as { body: Uint8Array; filename: string; mime: string } | undefined;
    if (!file) throw new AccessError("This file has expired or is unavailable. Prepare a new export from your research selection.", 404);
    return new Response(new Uint8Array(file.body), { headers: { "Content-Type": file.mime, "Content-Disposition": `attachment; filename="${file.filename}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return failure(error); }
}
