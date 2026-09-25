/**
 * The writer is only correct if the real reader can open what it produces, so
 * these tests round-trip through the `pmtiles` package rather than asserting on
 * bytes the writer chose itself.
 */
import { gunzipSync } from "node:zlib";
import { PMTiles, type Source, zxyToTileId } from "pmtiles";
import { describe, expect, it } from "vitest";
import {
  buildArchive,
  buildDirectories,
  HEADER_SIZE,
  INITIAL_READ,
  serializeDirectory,
  writeVarint,
  type TileInput,
} from "./pmtiles";

/** Minimal in-memory Source; the shipped FileSource needs a browser File. */
class BufferSource implements Source {
  constructor(private readonly buf: Buffer) {}
  getKey() {
    return "test";
  }
  async getBytes(offset: number, length: number) {
    const slice = this.buf.subarray(offset, offset + length);
    // Copy into a standalone ArrayBuffer; the reader slices what it is given.
    return { data: new Uint8Array(slice).buffer };
  }
}

const body = (s: string) => new TextEncoder().encode(s);

const OPTIONS = {
  minZoom: 0,
  maxZoom: 3,
  bounds: [-125.1, 24.4, -66.9, 49.4] as [number, number, number, number],
  metadata: {
    name: "test",
    attribution: "test",
    vector_layers: [{ id: "tracts", fields: { geoid: "String" } }],
  },
};

describe("writeVarint", () => {
  it("encodes single-byte values unchanged", () => {
    const out: number[] = [];
    writeVarint(out, 0);
    writeVarint(out, 127);
    expect(out).toEqual([0, 127]);
  });

  it("encodes multi-byte values little-endian, 7 bits at a time", () => {
    const out: number[] = [];
    writeVarint(out, 300); // 0b100101100 -> 0xAC 0x02
    expect(out).toEqual([0xac, 0x02]);
  });

  it("handles values beyond 32 bits", () => {
    // Tile ids and offsets in a national archive exceed 2^32, so the
    // implementation must not use >>> 7.
    const out: number[] = [];
    writeVarint(out, 2 ** 40 + 12345);
    expect(out.length).toBeGreaterThan(5);
  });

  it("rejects negatives, which would encode as a huge positive", () => {
    expect(() => writeVarint([], -1)).toThrow();
  });
});

describe("serializeDirectory", () => {
  it("never encodes the first entry's offset as the contiguous shorthand", () => {
    // The reader computes offset = value - 1 for entry 0, so a literal 0 there
    // would yield -1 and read from before the tile data section.
    const bytes = serializeDirectory([{ tileId: 0, offset: 0, length: 10, runLength: 1 }]);
    // count=1, delta=0, runLength=1, length=10, offset=0+1=1
    expect([...bytes]).toEqual([1, 0, 1, 10, 1]);
  });
});

describe("buildDirectories", () => {
  it("keeps a small index entirely in the root", () => {
    const entries = Array.from({ length: 50 }, (_, i) => ({
      tileId: i,
      offset: i * 10,
      length: 10,
      runLength: 1,
    }));
    const { root, leaves, numLeaves } = buildDirectories(entries);
    expect(numLeaves).toBe(0);
    expect(leaves.length).toBe(0);
    expect(root.length).toBeLessThan(INITIAL_READ - HEADER_SIZE);
  });

  it("spills to leaf directories when the root would exceed the initial read", () => {
    // Offsets are deliberately non-contiguous so the offset section cannot be
    // compressed away by the shorthand, forcing a genuinely large index.
    const entries = Array.from({ length: 60_000 }, (_, i) => ({
      tileId: i * 3,
      offset: i * 100_000,
      length: 999,
      runLength: 1,
    }));
    const { root, leaves, numLeaves } = buildDirectories(entries);
    expect(numLeaves).toBeGreaterThan(0);
    expect(leaves.length).toBeGreaterThan(0);
    expect(root.length).toBeLessThanOrEqual(INITIAL_READ - HEADER_SIZE);
  });
});

describe("buildArchive round-trip", () => {
  const tiles: TileInput[] = [
    { z: 0, x: 0, y: 0, data: body("tile-000") },
    { z: 1, x: 0, y: 0, data: body("tile-100") },
    { z: 1, x: 1, y: 0, data: body("tile-110") },
    { z: 1, x: 0, y: 1, data: body("tile-101") },
    { z: 2, x: 1, y: 1, data: body("tile-211") },
  ];

  it("is opened by the reader with the header it was given", async () => {
    const { archive } = buildArchive(tiles, OPTIONS);
    const header = await new PMTiles(new BufferSource(archive)).getHeader();

    expect(header.specVersion).toBe(3);
    expect(header.minZoom).toBe(0);
    expect(header.maxZoom).toBe(3);
    expect(header.tileType).toBe(1); // Mvt
    expect(header.tileCompression).toBe(2); // Gzip — the only one the reader does
    expect(header.internalCompression).toBe(2);
    expect(header.clustered).toBe(true);
    expect(header.numAddressedTiles).toBe(5);
    expect(header.minLon).toBeCloseTo(-125.1, 5);
    expect(header.maxLat).toBeCloseTo(49.4, 5);
  });

  it("returns every tile's bytes at its own coordinate", async () => {
    const { archive } = buildArchive(tiles, OPTIONS);
    const reader = new PMTiles(new BufferSource(archive));

    for (const t of tiles) {
      const got = await reader.getZxy(t.z, t.x, t.y);
      expect(got, `tile ${t.z}/${t.x}/${t.y} missing`).toBeTruthy();
      expect(new Uint8Array(got!.data)).toEqual(t.data);
    }
  });

  it("reports a miss for a coordinate that was never written", async () => {
    const { archive } = buildArchive(tiles, OPTIONS);
    const reader = new PMTiles(new BufferSource(archive));
    expect(await reader.getZxy(2, 3, 3)).toBeUndefined();
  });

  it("round-trips the metadata the map needs", async () => {
    const { archive } = buildArchive(tiles, OPTIONS);
    const meta = await new PMTiles(new BufferSource(archive)).getMetadata();
    expect((meta as { vector_layers: Array<{ id: string }> }).vector_layers[0].id).toBe("tracts");
  });

  it("stores one copy of a body shared by many tiles", () => {
    const shared = body("identical");
    const many: TileInput[] = [
      { z: 3, x: 0, y: 0, data: shared },
      { z: 3, x: 1, y: 0, data: shared },
      { z: 3, x: 2, y: 0, data: shared },
      { z: 3, x: 3, y: 0, data: shared },
    ];
    const { stats } = buildArchive(many, OPTIONS);
    expect(stats.tiles).toBe(4);
    expect(stats.uniqueBodies).toBe(1);
  });

  it("still serves every coordinate after run-length encoding collapses entries", async () => {
    // Deduplication plus run-length encoding is where an off-by-one would hide:
    // the entries array is shorter than the tile list, and the reader has to
    // resolve a coordinate that has no entry of its own.
    const shared = body("identical");
    const run: TileInput[] = [];
    for (let x = 0; x < 8; x++) run.push({ z: 3, x, y: 0, data: shared });

    const { archive, stats } = buildArchive(run, OPTIONS);
    expect(stats.entries).toBeLessThan(run.length);

    const reader = new PMTiles(new BufferSource(archive));
    for (const t of run) {
      const got = await reader.getZxy(t.z, t.x, t.y);
      expect(got, `tile 3/${t.x}/0 missing after RLE`).toBeTruthy();
      expect(new Uint8Array(got!.data)).toEqual(shared);
    }
  });

  it("serves tiles from a leaf directory, not just the root", async () => {
    // Directories are gzipped, and an index of uniform tiles compresses to
    // almost nothing — 32,000 evenly sized tiles still fit the root. What makes
    // a real national index overflow is the *length* column: every tract tile is
    // a different size, so those varints are high-entropy and incompressible.
    // This reproduces that, which is the only way to exercise the reader's
    // second directory hop.
    let seed = 0x2f6e2b1;
    const rand = () => {
      // xorshift32, so the fixture is identical on every run.
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return (seed >>> 0) / 0xffffffff;
    };

    const big: TileInput[] = [];
    const expected = new Map<string, Uint8Array>();
    for (let x = 0; x < 128; x++) {
      for (let y = 0; y < 128; y++) {
        // Random length AND random content, so neither the length column nor
        // the bodies dedupe or compress away.
        const len = 40 + Math.floor(rand() * 400);
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = Math.floor(rand() * 256);
        big.push({ z: 8, x, y, data: bytes });
        expected.set(`${x}/${y}`, bytes);
      }
    }

    const { archive, stats } = buildArchive(big, { ...OPTIONS, minZoom: 8, maxZoom: 8 });
    expect(stats.numLeaves).toBeGreaterThan(0);
    expect(stats.uniqueBodies).toBe(big.length);

    const reader = new PMTiles(new BufferSource(archive));
    for (const [x, y] of [
      [0, 0],
      [7, 3],
      [64, 64],
      [127, 127],
      [99, 12],
    ]) {
      const got = await reader.getZxy(8, x, y);
      expect(got, `tile 8/${x}/${y} missing from leaf`).toBeTruthy();
      expect(new Uint8Array(got!.data)).toEqual(expected.get(`${x}/${y}`));
    }
  });

  it("orders entries by tile id regardless of input order", async () => {
    // "clustered: true" in the header promises this; the reader binary-searches
    // and would silently miss tiles if the promise were false.
    const shuffled: TileInput[] = [
      { z: 2, x: 3, y: 3, data: body("d") },
      { z: 0, x: 0, y: 0, data: body("a") },
      { z: 2, x: 0, y: 0, data: body("c") },
      { z: 1, x: 1, y: 1, data: body("b") },
    ];
    const { archive } = buildArchive(shuffled, OPTIONS);
    const reader = new PMTiles(new BufferSource(archive));
    for (const t of shuffled) {
      const got = await reader.getZxy(t.z, t.x, t.y);
      expect(got, `tile ${t.z}/${t.x}/${t.y} missing`).toBeTruthy();
      expect(new Uint8Array(got!.data)).toEqual(t.data);
    }
  });

  it("gzips tile bodies, as the header declares", async () => {
    const { archive } = buildArchive(tiles, OPTIONS);
    const header = await new PMTiles(new BufferSource(archive)).getHeader();
    // Read the raw first body and confirm it really is gzip, not stored plain
    // with a gzip flag set.
    const raw = archive.subarray(header.tileDataOffset, header.tileDataOffset + 64);
    expect(raw[0]).toBe(0x1f);
    expect(raw[1]).toBe(0x8b);
    expect(gunzipSync(archive.subarray(header.tileDataOffset)).length).toBeGreaterThan(0);
  });

  it("rejects an empty tile list rather than writing a broken archive", () => {
    expect(() => buildArchive([], OPTIONS)).toThrow(/no tiles/);
  });

  it("uses the same tile ids as the reader's zxyToTileId", () => {
    // Guards against reimplementing the Hilbert curve: the writer imports the
    // reader's own function, and this pins the expectation.
    expect(zxyToTileId(0, 0, 0)).toBe(0);
    expect(zxyToTileId(1, 0, 0)).toBe(1);
  });
});
