import { tractPoint } from "@/lib/geo/tractPoint";
import { siteSnapshot } from "@/lib/site/snapshot";

/**
 * Live site snapshot for a tract page: at an exact point (from an address the
 * visitor searched) or at the tract's interior point. POST only, so a point
 * never enters a URL the host logs; never cached, never logged.
 */
export async function POST(req: Request) {
  const noStore = { "Cache-Control": "no-store" };
  let body: { geoid?: unknown; lat?: unknown; lon?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "expected a JSON body" }, { status: 400, headers: noStore });
  }
  const { geoid, lat, lon } = body;
  let point: [number, number] | null = null;
  let basis: "address" | "tract" = "tract";
  if (typeof lat === "number" && typeof lon === "number" && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
    point = [lon, lat];
    basis = "address";
  } else if (typeof geoid === "string" && /^\d{11}$/.test(geoid)) {
    point = tractPoint(geoid);
  } else {
    return Response.json({ error: "expected a tract GEOID or a point" }, { status: 400, headers: noStore });
  }
  if (!point) return Response.json({ error: "no point for this tract" }, { status: 404, headers: noStore });
  const items = await siteSnapshot(point[0], point[1]);
  return Response.json({ basis, items, disclaimer: "Informational only, not investment, tax or legal advice." }, { headers: noStore });
}
