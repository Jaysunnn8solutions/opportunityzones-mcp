import { geocodeAddress } from "@/lib/sources/censusGeocoder/client";
import { failure, limitRequest, readBody, sameOrigin } from "@/lib/access/http";
import { SourceError } from "@/lib/sources/http";
import { AccessError } from "@/lib/access/store";

/**
 * Address to candidate tracts, via the Census Geocoder.
 *
 * POST only: the address travels in the body, never the URL, because request
 * URLs are logged by the host. Never cached, never logged; the response goes
 * only to the requester (docs/ARCHITECTURE.md).
 */
export async function POST(req: Request) {
  try { sameOrigin(req); } catch (error) { return failure(error); }
  const noStore = { "Cache-Control": "no-store" };
  let address: unknown;
  try {
    address = ((await readBody(req, 2000)) as { address?: unknown }).address;
  } catch {
    return Response.json({ error: "expected a JSON body with an address" }, { status: 400, headers: noStore });
  }
  if (typeof address !== "string" || address.trim().length < 5 || address.length > 200) {
    return Response.json({ error: "address must be 5-200 characters" }, { status: 400, headers: noStore });
  }
  try { (await limitRequest(req, "address")); } catch (error) { return failure(error); }
  try {
    const matches = await geocodeAddress(address);
    return Response.json(
      { matches: matches.map((m) => ({ geoid: m.geoid, lon: m.lon, lat: m.lat, label: m.matchedAddress ?? null })) },
      { headers: noStore }
    );
  } catch (error) {
    if (error instanceof SourceError && error.kind === "limited") return failure(new AccessError("Address lookup capacity is temporarily unavailable. Try again after the allowance resets; your input is preserved.", 429, error.retryAfter));
    // The address was validated above, so any failure here is the Census Geocoder's
    // (down, or refusing requests), not the user's input: 502, never 400.
    return Response.json({ error: "address lookup failed" }, { status: 502, headers: noStore });
  }
}
