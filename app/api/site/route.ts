import { tractPoint, tractContainsPoint } from "@/lib/geo/tractPoint";
import { canResearchTract } from "@/lib/data/researchScope";
import { RESEARCH_SCOPE_NOTICE } from "@/lib/oz/researchScope";
import { siteSnapshot, type SnapshotItem } from "@/lib/site/snapshot";
import { failure, limitRequest, readBody, sameOrigin } from "@/lib/access/http";
import { publicGeographyCache } from "@/lib/sources/publicCache";

/**
 * Live site snapshot for a tract page: at an exact point (from an address the
 * visitor searched) or at the tract's interior point. POST only, so a point
 * never enters a URL the host logs. Exact site queries are never cached or logged;
 * canonical public tract readings may be cached by GEOID.
 */
export async function POST(req: Request) {
  try { sameOrigin(req); } catch (error) { return failure(error); }
  const noStore = { "Cache-Control": "no-store" };
  let body: { geoid?: unknown; lat?: unknown; lon?: unknown; source?: unknown };
  try {
    body = (await readBody(req, 2000)) as typeof body;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid body");
  } catch {
    return Response.json({ error: "expected a JSON body" }, { status: 400, headers: noStore });
  }
  const { geoid, lat, lon } = body;
  if (typeof geoid !== "string" || !canResearchTract(geoid)) return Response.json({ error: RESEARCH_SCOPE_NOTICE }, { status: 403, headers: noStore });
  const keys = ["flood", "earthquake", "wildfire", "epa", "traffic", "amenities"];
  if (body.source != null && (typeof body.source !== "string" || !keys.includes(body.source))) return Response.json({ error: "unknown source" }, { status: 400, headers: noStore });
  let point: [number, number] | null = null;
  let basis: "address" | "tract" = "tract";
  if (typeof lat === "number" && typeof lon === "number" && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
    if (!tractContainsPoint(geoid, [lon, lat])) return Response.json({ error: "This point could not be verified inside the selected eligible or designated tract. Use tract-level context instead." }, { status: 403, headers: noStore });
    point = [lon, lat];
    basis = "address";
  } else if (typeof geoid === "string" && /^\d{11}$/.test(geoid)) {
    point = tractPoint(geoid);
  } else {
    return Response.json({ error: "expected a tract GEOID or a point" }, { status: 400, headers: noStore });
  }
  if (!point) return Response.json({ error: "no point for this tract" }, { status: 404, headers: noStore });
  try { limitRequest(req, "site"); } catch (error) { return failure(error); }
  try {
    const only = body.source as SnapshotItem["key"] | undefined;
    const items = basis === "tract" ? await Promise.all((only ? [only] : keys as SnapshotItem["key"][]).map(async (key) => {
      const cached = await publicGeographyCache(`site:${geoid}:${key}`, 86_400_000, async () => (await siteSnapshot(point![0], point![1], key))[0], (item) => !item.unavailable);
      return { ...cached.value, checkedAt: cached.checkedAt };
    })) : (await siteSnapshot(point[0], point[1], only)).map((item) => ({ ...item, checkedAt: Date.now() }));
    return Response.json({ basis, items, disclaimer: "Informational only, not investment, tax or legal advice." }, { headers: noStore });
  } catch (error) { return failure(error); }
}
