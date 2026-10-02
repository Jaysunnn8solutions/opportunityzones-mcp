import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/access/store";
import { providerBackoff, providerPermit } from "./gateway";
import { publicGeographyCache } from "./publicCache";
import { fetchText } from "./http";

vi.unmock("@/lib/sources/gateway");
beforeEach(() => { db().exec("DELETE FROM usage; DELETE FROM settings"); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("shared source protection", () => {
  it("enforces concurrent leases and records attempts once across both rolling windows", () => {
    vi.stubEnv("OZ_SOURCE_CENSUSGEOCODER_DAILY", "3");
    const a = providerPermit("censusGeocoder"); const b = providerPermit("censusGeocoder");
    expect(() => providerPermit("censusGeocoder")).toThrow(/busy/);
    a(); providerPermit("censusGeocoder")(); b();
    expect(() => providerPermit("censusGeocoder")).toThrow(/allowance/);
    expect(db().prepare("SELECT * FROM usage WHERE subject='provider:censusGeocoder'").all()).toHaveLength(3);
  });
  it("fails closed for unknown production quotas, invalid budgets, and operator pauses", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => providerPermit("censusGeocoder")).toThrow(/operator budget/);
    vi.stubEnv("OZ_SOURCE_CENSUSGEOCODER_DAILY", "4"); providerPermit("censusGeocoder")();
    vi.stubEnv("OZ_SOURCE_CENSUSGEOCODER_DAILY", "NaN"); expect(() => providerPermit("censusGeocoder")).toThrow();
    vi.stubEnv("OZ_LIVE_PAUSED", "1"); expect(() => providerPermit("blsLaus")).toThrow();
  });
  it("honors Retry-After across requests and does not retry a provider 429", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-27T12:00:00Z"));
    vi.stubEnv("OZ_SOURCE_CENSUSGEOCODER_DAILY", "5");
    const network = vi.fn().mockResolvedValue(new Response("limited", { status: 429, headers: { "Retry-After": "120" } })); vi.stubGlobal("fetch", network);
    await expect(fetchText("https://source.invalid/private-query", { sourceId: "censusGeocoder", retries: 2 })).rejects.toMatchObject({ kind: "limited", retryAfter: 120 });
    providerBackoff("censusGeocoder", "10"); // A shorter later response cannot shorten the shared cooldown.
    expect(() => providerPermit("censusGeocoder")).toThrow(/cooling down/);
    expect(network).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(121_000); providerPermit("censusGeocoder")();
  });
});

describe("public geography cache", () => {
  it("shares a concurrent request, preserves check time, and expires it", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-27T12:00:00Z"));
    const loader = vi.fn(async () => ({ count: 0 }));
    const [a, b] = await Promise.all([publicGeographyCache("laus:10001:test", 1000, loader), publicGeographyCache("laus:10001:test", 1000, loader)]);
    expect(a).toEqual(b); expect(loader).toHaveBeenCalledTimes(1);
    await publicGeographyCache("laus:10001:test", 1000, loader); expect(loader).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1001); await publicGeographyCache("laus:10001:test", 1000, loader); expect(loader).toHaveBeenCalledTimes(2);
  });
  it("rejects personal lookup keys and never caches failed checks", async () => {
    const loader = vi.fn(async () => ({ unavailable: true }));
    await expect(publicGeographyCache("site:55 Main Street", 1000, loader)).rejects.toThrow(/Invalid/);
    await expect(publicGeographyCache("site:33.75,-84.39", 1000, loader)).rejects.toThrow(/Invalid/);
    await publicGeographyCache("site:10001040100:test", 1000, loader, () => false);
    await publicGeographyCache("site:10001040100:test", 1000, loader, () => false);
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
