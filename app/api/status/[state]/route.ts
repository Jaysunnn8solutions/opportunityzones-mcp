import { stateStatus } from "@/lib/data/status";

/** Tract status flags for one state (2-digit FIPS). Public data; cached. */
export async function GET(_req: Request, { params }: { params: Promise<{ state: string }> }) {
  const { state } = await params;
  if (!/^\d{2}$/.test(state)) return Response.json({ error: "state must be a 2-digit FIPS code" }, { status: 400 });
  const status = stateStatus(state);
  if (Object.keys(status).length === 0) return Response.json({ error: "no tracts for that state" }, { status: 404 });
  return Response.json(status, { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } });
}
