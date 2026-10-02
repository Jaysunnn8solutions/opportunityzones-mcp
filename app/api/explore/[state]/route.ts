import { comparisonLimit } from "@/lib/research/comparisonLimits";
import { stateStatus } from "@/lib/data/status";
import { authorizeFilters, searchPage } from "@/lib/access/search";
import { failure, json, limitRequest, readBody, sameOrigin, session } from "@/lib/access/http";
import { AccessError } from "@/lib/access/store";

/** Minimal public map flags only. Filtered numeric research is served by the protected POST below. */
export async function GET(_req: Request, { params }: { params: Promise<{ state: string }> }) {
  const { state } = await params;
  if (!/^\d{2}$/.test(state)) return Response.json({ error: "state must be a 2-digit FIPS code" }, { status: 400 });
  const status = stateStatus(state);
  if (!Object.keys(status).length) return Response.json({ error: "no tracts for that state" }, { status: 404 });
  return Response.json({ measures: [], rows: Object.entries(status).map(([geoid, bits]) => [geoid, bits]) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: Request, { params }: { params: Promise<{ state: string }> }) {
  try {
    sameOrigin(req); const account = session(req); limitRequest(req, "read", account);
    const body = await readBody(req, 8000); const { state } = await params;
    if (body.geoids != null && (!Array.isArray(body.geoids) || body.geoids.length > (comparisonLimit(!!account)) || body.geoids.some((id: unknown) => typeof id !== "string" || !/^\d{11}$/.test(id)))) throw new AccessError("Choose valid tract identifiers within your comparison allowance.", 400);
    const filters = authorizeFilters(body.filters, !!account);
    if (!account && body.sort && body.sort !== "geoid") throw new AccessError("Numeric sorting requires a free account.", 401);
    return json(searchPage(state, filters, body.sort ?? "geoid", body.page ?? 0, !!account, body.geoids));
  } catch (error) { return failure(error); }
}
