import { geocodeAddress } from "@/lib/sources/censusGeocoder/client";
import { SourceError } from "@/lib/sources/http";

/**
 * Address to candidate tracts, via the Census Geocoder.
 *
 * POST only: the address travels in the body, never the URL, because request
 * URLs are logged by the host. Never cached, never logged; the response goes
 * only to the requester (docs/ARCHITECTURE.md).
 */
export async function POST(req: Request) {
  const noStore = { "Cache-Control": "no-store" };
  let address: unknown;
  try {
    address = ((await req.json()) as { address?: unknown }).address;
  } catch {
    return Response.json({ error: "expected a JSON body with an address" }, { status: 400, headers: noStore });
  }
  if (typeof address !== "string" || address.trim().length < 5 || address.length > 200) {
    return Response.json({ error: "address must be 5-200 characters" }, { status: 400, headers: noStore });
  }
  try {
    const matches = await geocodeAddress(address);
    return Response.json(
      { matches: matches.map((m) => ({ geoid: m.geoid, lon: m.lon, lat: m.lat, label: m.matchedAddress ?? null })) },
      { headers: noStore }
    );
  } catch (err) {
    const status = err instanceof SourceError && err.kind === "rejected" ? 400 : 502;
    return Response.json({ error: "address lookup failed" }, { status, headers: noStore });
  }
}
