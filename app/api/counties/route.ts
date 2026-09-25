import { countySummary } from "@/lib/data/status";

/** Per-county tract and eligible-tract counts, for the zoomed-out map. Public data; cached. */
export async function GET() {
  return Response.json(countySummary(), { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } });
}
