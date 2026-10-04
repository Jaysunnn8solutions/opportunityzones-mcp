import { servicePaused } from "@/lib/access/serviceControl";
import { loadTractData } from "@/lib/data/tracts";
export const runtime = "nodejs";
let cache: { at: number; value: unknown } | undefined;
/** Coarse local status only. Does not probe providers or expose accounts/configuration. */
export async function GET() {
  const now = Date.now();
  if (!cache || now - cache.at > 60_000) {
    try {
      const { manifest } = loadTractData();
      cache = { at: now, value: { checked: now, datasetBuilt: manifest.generated, database: "reachable", services: { exports: await servicePaused("exports") ? "paused" : "accepting requests", signup: await servicePaused("signup") ? "paused" : "accepting requests", mcp: await servicePaused("mcp") ? "paused" : "accepting requests" } } };
    } catch { cache = { at: now, value: { checked: now, database: "unavailable", services: { exports: "unavailable", signup: "unavailable", mcp: "unavailable" } } }; }
  }
  return Response.json(cache.value, { headers: { "Cache-Control": "public, max-age=30", "X-Content-Type-Options": "nosniff" } });
}
