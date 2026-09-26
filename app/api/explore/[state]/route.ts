import { exploreState } from "@/lib/data/explore";

/** Status flags and neighbours' averages for every tract in one state (2-digit FIPS), for the map's Find areas panel. Public data; cached. */
export async function GET(_req: Request, { params }: { params: Promise<{ state: string }> }) {
  const { state } = await params;
  if (!/^\d{2}$/.test(state)) return Response.json({ error: "state must be a 2-digit FIPS code" }, { status: 400 });
  const data = exploreState(state);
  if (!data) return Response.json({ error: "no tracts for that state" }, { status: 404 });
  return Response.json(data, { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } });
}
