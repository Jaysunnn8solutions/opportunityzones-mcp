import { getTract, loadTractData } from "@/lib/data/tracts";
import { tractPoint } from "@/lib/geo/tractPoint";
import { researchSources } from "@/lib/data/researchSources";
import { failure, limitRequest } from "@/lib/access/http";
import { canResearchTract } from "@/lib/data/researchScope";
import { RESEARCH_SCOPE_NOTICE } from "@/lib/oz/researchScope";
import { tractIndicators } from "@/lib/data/indicators";

/** The published profile of one tract, as JSON. Public data about a place; cached. */
export async function GET(_req: Request, { params }: { params: Promise<{ geoid: string }> }) {
  try { (await limitRequest(_req, "read")); } catch (error) { return failure(error); }
  const { geoid } = await params;
  const t = getTract(geoid);
  if (!t) return Response.json({ error: "no such tract" }, { status: 404 });
  if (!canResearchTract(geoid)) return Response.json({ error: RESEARCH_SCOPE_NOTICE, code: "tract_out_of_scope" }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
  return Response.json(
    { ...t, analysis: tractIndicators(t), sources: researchSources(), center: tractPoint(geoid), publishedAt: loadTractData().manifest.generated, disclaimer: "Informational only, not investment, tax or legal advice." },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
