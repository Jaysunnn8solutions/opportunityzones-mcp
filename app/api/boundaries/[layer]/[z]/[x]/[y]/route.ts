import { isValidTile } from "@/lib/geo/tiles";
import { SourceError } from "@/lib/sources/http";
import { fetchBoundaries, LAYERS, type BoundaryLayer } from "@/lib/sources/tigerweb/boundaries";

/**
 * Census tract or county boundaries for one map tile, proxied from TIGERweb.
 * Terms-protected response. Shared caches must not bypass acceptance checks.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ layer: string; z: string; x: string; y: string }> }) {
  const p = await params;
  const layer = p.layer as BoundaryLayer;
  const [z, x, y] = [p.z, p.x, p.y].map(Number);
  if (!(layer in LAYERS)) return Response.json({ error: "unknown layer" }, { status: 404 });
  const { minZoom, maxZoom } = LAYERS[layer];
  if (!isValidTile(z, x, y) || z < minZoom || z > maxZoom) {
    return Response.json({ error: `tile out of range; ${layer} are served at zoom ${minZoom}-${maxZoom}` }, { status: 400 });
  }
  try {
    const fc = await fetchBoundaries(layer, z, x, y);
    return Response.json(fc, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    const message = err instanceof SourceError ? err.message : "boundary service unavailable";
    return Response.json({ error: message }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
