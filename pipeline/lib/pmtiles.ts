/**
 * A PMTiles v3 writer.
 *
 * Tippecanoe is the usual way to make vector tiles, but it has no Windows build
 * and would put a C++ toolchain (or Docker) between this repo and a data
 * refresh. The `pmtiles` npm package is reader-only. So tiles are produced with
 * geojson-vt (the same tiler MapLibre uses internally) plus vt-pbf, and packed
 * here. Pure JavaScript, so `npm run tiles` works the same on a laptop and in
 * CI.
 *
 * Every layout rule below is taken from the reader in
 * `node_modules/pmtiles/dist/esm/index.js`, because that is what has to consume
 * the output. Three of its behaviors constrain the writer and are easy to get
 * wrong:
 *
 *  - The reader opens an archive with a single `getBytes(0, 16384)` and slices
 *    the root directory out of that buffer, so the root directory must end
 *    within the first 16 KB. Anything bigger has to spill into leaf
 *    directories, which is why `buildDirectories` iterates on leaf size.
 *  - `defaultDecompress` implements only "none" and "gzip". Declaring brotli
 *    makes the reader throw "Compression method not supported", so tiles and
 *    directories are gzipped even though brotli would be smaller.
 *  - Offsets are delta-coded, where 0 means "immediately after the previous
 *    entry". Entry 0 has no previous entry, so it must always write offset + 1;
 *    emitting 0 there makes the reader compute an offset of -1.
 */

import { gzipSync } from "node:zlib";
import { Compression, TileType, zxyToTileId } from "pmtiles";

export const HEADER_SIZE = 127;

/** The reader's initial read. The root directory has to fit inside it. */
export const INITIAL_READ = 16_384;
const MAX_ROOT_BYTES = INITIAL_READ - HEADER_SIZE;

export interface TileInput {
  z: number;
  x: number;
  y: number;
  /** Uncompressed tile body; gzipped by the writer. */
  data: Uint8Array;
}

interface Entry {
  tileId: number;
  offset: number;
  length: number;
  runLength: number;
}

export interface ArchiveMetadata {
  name: string;
  description?: string;
  attribution: string;
  /** TileJSON vector_layers, so MapLibre knows the layer and its fields. */
  vector_layers: Array<{
    id: string;
    description?: string;
    minzoom?: number;
    maxzoom?: number;
    fields: Record<string, string>;
  }>;
  [key: string]: unknown;
}

export interface ArchiveOptions {
  minZoom: number;
  maxZoom: number;
  /** [minLon, minLat, maxLon, maxLat] */
  bounds: [number, number, number, number];
  center?: [number, number, number];
  metadata: ArchiveMetadata;
}

// --- varint ------------------------------------------------------------------

/** Protobuf-style varint, matching the reader's `readVarint`. */
export function writeVarint(out: number[], value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`varint needs a non-negative integer, got ${value}`);
  }
  let v = value;
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80);
    // Not `>>>= 7`: tile IDs and offsets exceed 32 bits in a large archive.
    v = Math.floor(v / 128);
  }
  out.push(v);
}

// --- directories -------------------------------------------------------------

/**
 * Directories and metadata are stored under the header's `internalCompression`.
 * Gzip is the only algorithm besides "none" that the reader's `defaultDecompress`
 * implements, so declaring anything else makes it throw.
 */
function deflate(bytes: Uint8Array): Uint8Array {
  return gzipSync(bytes, { level: 9 });
}

/**
 * Serialize entries in the reader's five-section layout: count, tile-id deltas,
 * run lengths, lengths, then offsets.
 */
export function serializeDirectory(entries: readonly Entry[]): Uint8Array {
  const out: number[] = [];
  writeVarint(out, entries.length);

  let lastId = 0;
  for (const e of entries) {
    writeVarint(out, e.tileId - lastId);
    lastId = e.tileId;
  }
  for (const e of entries) writeVarint(out, e.runLength);
  for (const e of entries) writeVarint(out, e.length);
  for (const [i, e] of entries.entries()) {
    const prev = entries[i - 1];
    // 0 is the "contiguous with the previous entry" shorthand, unavailable to
    // the first entry because the reader would compute offset = -1.
    if (i > 0 && prev && e.offset === prev.offset + prev.length) writeVarint(out, 0);
    else writeVarint(out, e.offset + 1);
  }
  return new Uint8Array(out);
}

/**
 * Split entries into a root directory plus leaf directories small enough that
 * the root fits the reader's 16 KB initial read.
 *
 * A root entry with runLength 0 is a pointer to a leaf, which is how the reader
 * distinguishes the two. Both returned buffers are already compressed, and the
 * size test applies to the compressed root, because that is the length the
 * reader slices out of its initial 16 KB read.
 */
export function buildDirectories(entries: readonly Entry[]): {
  root: Uint8Array;
  leaves: Uint8Array;
  numLeaves: number;
} {
  const flat = deflate(serializeDirectory(entries));
  if (flat.length <= MAX_ROOT_BYTES) {
    return { root: flat, leaves: new Uint8Array(0), numLeaves: 0 };
  }

  // Grow the leaf size until the root index fits. Starting at 4096 entries per
  // leaf converges in one or two rounds for archives of this size.
  for (let leafSize = 4096; leafSize <= 262_144; leafSize *= 2) {
    const rootEntries: Entry[] = [];
    const leafChunks: Uint8Array[] = [];
    let leafOffset = 0;

    for (let i = 0; i < entries.length; i += leafSize) {
      const slice = entries.slice(i, i + leafSize);
      const leaf = deflate(serializeDirectory(slice));
      rootEntries.push({
        tileId: slice[0].tileId,
        offset: leafOffset,
        length: leaf.length,
        runLength: 0,
      });
      leafChunks.push(leaf);
      leafOffset += leaf.length;
    }

    const root = deflate(serializeDirectory(rootEntries));
    if (root.length <= MAX_ROOT_BYTES) {
      return { root, leaves: concat(leafChunks), numLeaves: rootEntries.length };
    }
  }
  throw new Error(
    `Cannot fit a root directory for ${entries.length} tiles in ${MAX_ROOT_BYTES} bytes. ` +
      `Lower the maximum zoom or split the archive.`
  );
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// --- header ------------------------------------------------------------------

function e7(deg: number): number {
  return Math.round(deg * 1e7);
}

function buildHeader(h: {
  rootOffset: number;
  rootLength: number;
  metadataOffset: number;
  metadataLength: number;
  leafOffset: number;
  leafLength: number;
  tileDataOffset: number;
  tileDataLength: number;
  numAddressedTiles: number;
  numTileEntries: number;
  numTileContents: number;
  minZoom: number;
  maxZoom: number;
  bounds: [number, number, number, number];
  center: [number, number, number];
}): Buffer {
  const buf = Buffer.alloc(HEADER_SIZE);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  buf.write("PMTiles", 0, "ascii");
  view.setUint8(7, 3);

  // JavaScript numbers hold integers to 2^53, far beyond any archive size here,
  // so uint64 fields are written as two uint32 halves.
  const u64 = (at: number, value: number) => {
    view.setUint32(at, value % 4294967296, true);
    view.setUint32(at + 4, Math.floor(value / 4294967296), true);
  };

  u64(8, h.rootOffset);
  u64(16, h.rootLength);
  u64(24, h.metadataOffset);
  u64(32, h.metadataLength);
  u64(40, h.leafOffset);
  u64(48, h.leafLength);
  u64(56, h.tileDataOffset);
  u64(64, h.tileDataLength);
  u64(72, h.numAddressedTiles);
  u64(80, h.numTileEntries);
  u64(88, h.numTileContents);

  view.setUint8(96, 1); // clustered: entries are in tile-id order
  view.setUint8(97, Compression.Gzip); // internal (directories + metadata)
  view.setUint8(98, Compression.Gzip); // tiles
  view.setUint8(99, TileType.Mvt);
  view.setUint8(100, h.minZoom);
  view.setUint8(101, h.maxZoom);

  view.setInt32(102, e7(h.bounds[0]), true);
  view.setInt32(106, e7(h.bounds[1]), true);
  view.setInt32(110, e7(h.bounds[2]), true);
  view.setInt32(114, e7(h.bounds[3]), true);

  view.setUint8(118, h.center[2]);
  view.setInt32(119, e7(h.center[0]), true);
  view.setInt32(123, e7(h.center[1]), true);

  return buf;
}

// --- archive -----------------------------------------------------------------

export interface ArchiveStats {
  /** Tiles handed in. */
  tiles: number;
  /** Directory entries, after run-length encoding. */
  entries: number;
  /** Distinct tile bodies actually stored. */
  uniqueBodies: number;
  /** Leaf directories, 0 when the root index fit the initial read. */
  numLeaves: number;
  bytes: number;
}

/**
 * Pack tiles into a PMTiles v3 archive.
 *
 * Identical tile bodies are stored once and referenced by every tile that
 * shares them. For a national tract choropleth that matters: ocean and
 * unpopulated interior tiles are byte-identical, and run-length encoding
 * collapses consecutive ones into a single entry.
 */
export function buildArchive(
  tiles: readonly TileInput[],
  options: ArchiveOptions
): { archive: Buffer; stats: ArchiveStats } {
  if (tiles.length === 0) throw new Error("Cannot build an archive with no tiles");

  // Deduplicate by content, then order by tile id, which is what "clustered"
  // asserts to the reader.
  const byHash = new Map<string, { offset: number; length: number }>();
  const bodies: Uint8Array[] = [];
  let tileDataLength = 0;

  const placed = tiles
    .map((t) => ({ tileId: zxyToTileId(t.z, t.x, t.y), data: t.data }))
    .sort((a, b) => a.tileId - b.tileId);

  const entries: Entry[] = [];
  for (const t of placed) {
    const gz = gzipSync(t.data, { level: 9 });
    const hash = hashBytes(gz);
    let at = byHash.get(hash);
    if (!at) {
      at = { offset: tileDataLength, length: gz.length };
      byHash.set(hash, at);
      bodies.push(gz);
      tileDataLength += gz.length;
    }

    const prev = entries.at(-1);
    // Run-length encode: consecutive tile ids pointing at the same bytes.
    if (
      prev &&
      prev.offset === at.offset &&
      prev.length === at.length &&
      prev.tileId + prev.runLength === t.tileId
    ) {
      prev.runLength += 1;
    } else {
      entries.push({ tileId: t.tileId, offset: at.offset, length: at.length, runLength: 1 });
    }
  }

  const { root, leaves, numLeaves } = buildDirectories(entries);
  const metadata = deflate(Buffer.from(JSON.stringify(options.metadata), "utf8"));

  const rootOffset = HEADER_SIZE;
  const metadataOffset = rootOffset + root.length;
  const leafOffset = metadataOffset + metadata.length;
  const tileDataOffset = leafOffset + leaves.length;

  if (metadataOffset + metadata.length > INITIAL_READ && root.length > MAX_ROOT_BYTES) {
    throw new Error("Root directory does not fit the reader's initial 16 KB read");
  }

  const header = buildHeader({
    rootOffset,
    rootLength: root.length,
    metadataOffset,
    metadataLength: metadata.length,
    leafOffset,
    leafLength: leaves.length,
    tileDataOffset,
    tileDataLength,
    numAddressedTiles: tiles.length,
    numTileEntries: entries.length,
    numTileContents: byHash.size,
    minZoom: options.minZoom,
    maxZoom: options.maxZoom,
    bounds: options.bounds,
    center:
      options.center ??
      [
        (options.bounds[0] + options.bounds[2]) / 2,
        (options.bounds[1] + options.bounds[3]) / 2,
        options.minZoom,
      ],
  });

  const archive = Buffer.concat([
    header,
    Buffer.from(root),
    metadata,
    Buffer.from(leaves),
    ...bodies.map((b) => Buffer.from(b)),
  ]);

  return {
    archive,
    stats: {
      tiles: tiles.length,
      entries: entries.length,
      uniqueBodies: byHash.size,
      numLeaves,
      bytes: archive.length,
    },
  };
}

/**
 * FNV-1a over the bytes. Only used to spot identical tile bodies within one
 * build, so speed matters and cryptographic strength does not; a collision
 * check on length guards the rare case.
 */
function hashBytes(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return `${h >>> 0}:${bytes.length}`;
}

