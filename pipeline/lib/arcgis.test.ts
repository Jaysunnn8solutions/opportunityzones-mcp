import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Point the pipeline cache at a throwaway folder so the test never touches the
// real cache.
const cacheDir = mkdtempSync(path.join(tmpdir(), "arcgis-test-"));
vi.mock("../config", () => ({ CACHE_DIR: cacheDir }));

const { queryAllAttributes } = await import("./arcgis");

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  rmSync(cacheDir, { recursive: true, force: true });
});

describe("queryAllAttributes", () => {
  it("advances by the rows a capped page actually returns, not by the requested size", async () => {
    const total = 5;
    // The layer caps pages at 2 rows although 4 are requested.
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const u = new URL(url);
      if (u.searchParams.get("returnCountOnly")) return new Response(JSON.stringify({ count: total }));
      const offset = Number(u.searchParams.get("resultOffset"));
      const ids = [offset, offset + 1].filter((i) => i < total);
      return new Response(JSON.stringify({ features: ids.map((i) => ({ attributes: { id: i } })), exceededTransferLimit: true }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const rows = await queryAllAttributes({
      layer: "https://example.test/FeatureServer/0",
      outFields: ["id"],
      pageSize: 4,
      cacheKey: `capped-${Date.now()}`,
    });
    expect(rows.map((r) => r.id)).toEqual([0, 1, 2, 3, 4]);
  });
});
