import { countySummary } from "@/lib/data/status";

/** Per-county [tracts, eligible, designated, pending] counts, for the zoomed-out map. Public data; cached. */
export async function GET() {
  return Response.json(countySummary(), { headers: { "Cache-Control": "private, no-store" } });
}
