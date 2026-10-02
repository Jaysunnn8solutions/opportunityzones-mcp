import { AccessError } from "./store";
import { failure } from "./http";
export const oauthHeaders = { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store", "Pragma": "no-cache" };
export function oauthOptions() { return new Response(null, { status: 204, headers: { ...oauthHeaders, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } }); }
export async function oauthBody(req: Request, form = false) {
  const reader = req.body?.getReader(); if (!reader) throw new AccessError("A request body is required.", 400);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { void reader.cancel(); reject(new AccessError("Request body timed out.", 408)); }, 5000); });
  const parts: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) { const part = await Promise.race([reader.read(), deadline]); if (part.done) break; bytes += part.value.length; if (bytes > 8000) throw new AccessError("Request too large.", 413); parts.push(part.value); }
    const text = Buffer.concat(parts).toString("utf8");
    if (form) { const params = new URLSearchParams(text); if ([...params.keys()].some((key) => params.getAll(key).length !== 1)) throw new AccessError("Duplicate parameters are not accepted.", 400); return Object.fromEntries(params); }
    try { return JSON.parse(text); } catch { throw new AccessError("Invalid JSON.", 400); }
  } finally { clearTimeout(timer); void reader.cancel(); }
}
export function oauthFailure(reason: unknown, code = "invalid_request") { const result = failure(reason); return Response.json({ error: reason instanceof AccessError && reason.status === 429 ? "temporarily_unavailable" : code, error_description: reason instanceof AccessError ? reason.message : "Authorization is temporarily unavailable." }, { status: result.status, headers: { ...oauthHeaders, "Retry-After": result.headers.get("retry-after") ?? "60" } }); }
