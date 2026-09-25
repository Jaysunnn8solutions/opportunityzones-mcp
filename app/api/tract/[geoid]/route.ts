import { getTract } from "@/lib/data/tracts";

/** The published profile of one tract, as JSON. Public data about a place; cached. */
export async function GET(_req: Request, { params }: { params: Promise<{ geoid: string }> }) {
  const { geoid } = await params;
  const t = getTract(geoid);
  if (!t) return Response.json({ error: "no such tract" }, { status: 404 });
  return Response.json(
    { ...t, disclaimer: "Informational only, not investment, tax or legal advice." },
    { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } }
  );
}
