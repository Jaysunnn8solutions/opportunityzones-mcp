import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as boundaries } from "./boundaries/[layer]/[z]/[x]/[y]/route";
import { GET as counties } from "./counties/route";
import { POST as geocode } from "./geocode/route";
import { POST as site } from "./site/route";
import { GET as status } from "./status/[state]/route";
import { GET as tract } from "./tract/[geoid]/route";

// Route handlers against the committed data/; outbound calls stubbed.
afterEach(() => {
  vi.unstubAllGlobals();
});

const params = <T,>(p: T) => ({ params: Promise.resolve(p) });
const req = new Request("http://localhost/x");

describe("/api/boundaries", () => {
  it("proxies a tract tile from TIGERweb, keeps GEOIDs only, and caches publicly", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: [
            { type: "Feature", properties: { GEOID: "13121003500", EXTRA: "x" }, geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } },
            { type: "Feature", properties: { GEOID: "bad" }, geometry: { type: "Polygon", coordinates: [] } },
          ],
        })
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await boundaries(req, params({ layer: "tracts", z: "12", x: "1083", y: "1638" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toMatch(/public/);
    const body = (await res.json()) as { features: Array<{ properties: Record<string, string> }> };
    expect(body.features).toHaveLength(1);
    expect(body.features[0].properties).toEqual({ GEOID: "13121003500" });
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/tigerweb\.geo\.census\.gov/);
  });

  it("refuses tract tiles outside the served zooms, without calling out", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await boundaries(req, params({ layer: "tracts", z: "4", x: "3", y: "5" }))).status).toBe(400);
    expect((await boundaries(req, params({ layer: "roads", z: "9", x: "1", y: "1" }))).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports an upstream failure without caching it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));
    const res = await boundaries(req, params({ layer: "counties", z: "5", x: "8", y: "12" }));
    expect(res.status).toBe(502);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("/api/status and /api/counties", () => {
  it("returns flag bits for a state's tracts", async () => {
    const body = (await (await status(req, params({ state: "10" }))).json()) as Record<string, number>;
    expect(Object.keys(body).every((g) => g.startsWith("10"))).toBe(true);
    expect(Object.values(body).some((b) => (b & 1) === 1)).toBe(true);
  });

  it("returns tract, eligible, designated and pending counts per county", async () => {
    const body = (await (await counties()).json()) as Record<string, [number, number, number, number]>;
    const [tracts, eligible, designated, pending] = body["13121"];
    expect(tracts).toBeGreaterThan(eligible);
    // Nothing is published yet, so every eligible tract is pending.
    expect(designated).toBe(0);
    expect(pending).toBe(eligible);
  });
});

describe("/api/tract", () => {
  it("returns a profile with the disclaimer, and 404 for an unknown tract", async () => {
    const ok = await tract(req, params({ geoid: "13121003500" }));
    expect(((await ok.json()) as { disclaimer: string }).disclaimer).toMatch(/not investment/);
    expect((await tract(req, params({ geoid: "00000000000" }))).status).toBe(404);
  });
});

describe("/api/geocode", () => {
  it("takes the address from a POST body and never caches the answer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            result: {
              addressMatches: [
                { matchedAddress: "X", coordinates: { x: -84.39, y: 33.75 }, geographies: { "Census Tracts": [{ GEOID: "13121003500" }] } },
              ],
            },
          })
        )
      )
    );
    const res = await geocode(
      new Request("http://localhost/api/geocode", { method: "POST", body: JSON.stringify({ address: "55 Trinity Ave SW, Atlanta, GA" }) })
    );
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(((await res.json()) as { matches: Array<{ geoid: string }> }).matches[0].geoid).toBe("13121003500");
  });

  it("reports the geocoder refusing a request as unavailable, not as a bad address", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Forbidden", { status: 403 })));
    const res = await geocode(
      new Request("http://localhost/api/geocode", { method: "POST", body: JSON.stringify({ address: "55 Trinity Ave SW, Atlanta, GA" }) })
    );
    expect(res.status).toBe(502);
  });

  it("rejects a missing or oversized address", async () => {
    const bad = await geocode(new Request("http://localhost/api/geocode", { method: "POST", body: JSON.stringify({ address: "x" }) }));
    expect(bad.status).toBe(400);
  });
});

describe("/api/site", () => {
  const post = (body: unknown) => new Request("http://localhost/api/site", { method: "POST", body: JSON.stringify(body) });

  it("finds a tract's interior point from the boundary files and reports each source on its own", async () => {
    // Every live source fails: each item says so, and the response still succeeds.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));
    const res = await site(post({ geoid: "13121003500" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = (await res.json()) as { basis: string; items: Array<{ key: string; headline: string | null; unavailable?: string }> };
    expect(body.basis).toBe("tract");
    expect(body.items.map((i) => i.key)).toEqual(["flood", "earthquake", "wildfire", "epa", "traffic", "amenities"]);
    for (const i of body.items) expect(i.headline == null && typeof i.unavailable === "string").toBe(true);
  });

  it("uses an exact point when one is given, and rejects anything else", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));
    expect(((await (await site(post({ lat: 33.749, lon: -84.388 }))).json()) as { basis: string }).basis).toBe("address");
    expect((await site(post({ geoid: "13" }))).status).toBe(400);
    expect((await site(post({ geoid: "99999999999" }))).status).toBe(404);
  });
});
