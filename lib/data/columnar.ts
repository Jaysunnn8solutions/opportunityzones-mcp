/**
 * The committed tract payload.
 *
 * atl-mcp ships 600 tracts as JSON and parses the lot on every cold start. At
 * 85,000 tracts and ~60 fields that approach costs roughly 90 MB of JSON and
 * several hundred milliseconds of parsing per serverless instance, which is the
 * whole request budget. So the payload is columnar instead: one typed array per
 * field, quantized to the precision the field actually carries, with a JSON
 * header describing the layout. Decoding is a handful of typed-array views over
 * one buffer — no per-tract object allocation until something asks for a tract.
 *
 * Quantization is explicit per field rather than uniform, because the fields
 * carry genuinely different precision. A share is a number in [0,1] that nobody
 * needs beyond four decimals, so it fits a u16. A z-score lives in roughly
 * [-6,6]. A dollar median needs its integer value. Storing all of them as f64
 * would triple the payload to buy precision the inputs do not have — ACS
 * estimates come with margins of error far wider than the rounding.
 *
 * Nulls are preserved, not zeroed. A suppressed ACS estimate has to stay
 * distinguishable from a real zero: a tract with no median income reported is
 * not a tract where the median income is $0, and the statutory eligibility test
 * turns on exactly that difference.
 */

const MAGIC = "OZTRACT1";
const MAGIC_BYTES = 8;

/**
 * How a column is stored on disk.
 *
 * - `f32`   floating point, null as NaN. For values with real dynamic range.
 * - `u16`   integer 0..65534, null as 65535. With `scale`, for shares and rates.
 * - `i16`   integer -32767..32767, null as -32768. With `scale`, for z-scores.
 * - `u32`   integer 0..4294967294, null as 4294967295. For counts and dollars.
 * - `u8`    integer 0..254, null as 255. For small enumerations and flags.
 */
export type ColumnType = "f32" | "u16" | "i16" | "u32" | "u8";

export interface ColumnSpec {
  name: string;
  type: ColumnType;
  /**
   * Stored value is `Math.round(real / scale)`. Omit for an identity mapping.
   * A share stored as u16 with scale 1e-4 resolves to 0.0001.
   */
  scale?: number;
  /** Human-readable unit, carried through to the API and tool output. */
  unit?: string;
  /** One line on what the column means and where it came from. */
  description?: string;
}

export interface PayloadHeader {
  magic: string;
  version: 1;
  /** Number of tracts; every column has exactly this many values. */
  count: number;
  /**
   * Sorted tract GEOIDs, delta-encoded. Sorting means the deltas are small and
   * compress hard, and it lets lookup be a binary search instead of a Map of
   * 85,000 string keys.
   */
  geoidDeltas: number[];
  columns: ColumnSpec[];
  /** Byte offset of each column's data, relative to the start of the body. */
  offsets: number[];
}

const NULLS = {
  u8: 255,
  u16: 65535,
  u32: 4294967295,
  i16: -32768,
} as const;

const BYTES: Record<ColumnType, number> = { f32: 4, u16: 2, i16: 2, u32: 4, u8: 1 };

const LIMITS: Record<Exclude<ColumnType, "f32">, { min: number; max: number }> = {
  u8: { min: 0, max: 254 },
  u16: { min: 0, max: 65534 },
  u32: { min: 0, max: 4294967294 },
  i16: { min: -32767, max: 32767 },
};

/** Encode one column's values into its typed array. */
export function encodeColumn(spec: ColumnSpec, values: readonly (number | null)[]): ArrayBuffer {
  const scale = spec.scale ?? 1;
  const n = values.length;

  if (spec.type === "f32") {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const v = values[i];
      out[i] = v == null ? Number.NaN : v / scale;
    }
    return out.buffer;
  }

  const limit = LIMITS[spec.type];
  const nullValue = NULLS[spec.type];
  const out =
    spec.type === "u8"
      ? new Uint8Array(n)
      : spec.type === "u16"
        ? new Uint16Array(n)
        : spec.type === "i16"
          ? new Int16Array(n)
          : new Uint32Array(n);

  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (v == null || !Number.isFinite(v)) {
      out[i] = nullValue;
      continue;
    }
    const q = Math.round(v / scale);
    if (q < limit.min || q > limit.max) {
      throw new Error(
        `Column "${spec.name}" value ${v} quantizes to ${q}, outside ${spec.type} range ` +
          `[${limit.min}, ${limit.max}]. Widen the type or change the scale.`
      );
    }
    out[i] = q;
  }
  return out.buffer;
}

/** A decoded column: values in tract order, with nulls restored. */
export interface Column {
  spec: ColumnSpec;
  /** Raw stored values; use `get` unless you need the quantized form. */
  raw: Float32Array | Uint8Array | Uint16Array | Int16Array | Uint32Array;
  /** Real value at index i, or null. */
  get(i: number): number | null;
}

function viewColumn(spec: ColumnSpec, body: ArrayBuffer, offset: number, count: number): Column {
  const scale = spec.scale ?? 1;
  let raw: Column["raw"];
  let isNull: (v: number) => boolean;

  switch (spec.type) {
    case "f32":
      raw = new Float32Array(body, offset, count);
      isNull = Number.isNaN;
      break;
    case "u8":
      raw = new Uint8Array(body, offset, count);
      isNull = (v) => v === NULLS.u8;
      break;
    case "u16":
      raw = new Uint16Array(body, offset, count);
      isNull = (v) => v === NULLS.u16;
      break;
    case "i16":
      raw = new Int16Array(body, offset, count);
      isNull = (v) => v === NULLS.i16;
      break;
    case "u32":
      raw = new Uint32Array(body, offset, count);
      isNull = (v) => v === NULLS.u32;
      break;
  }

  return {
    spec,
    raw,
    get(i: number) {
      const v = raw[i];
      if (v === undefined || isNull(v)) return null;
      // Rounding here undoes float error from the divide, so a share stored at
      // 1e-4 reads back as 0.0523 rather than 0.052300000000000001.
      return scale === 1 ? v : Math.round(v * scale * 1e9) / 1e9;
    },
  };
}

export interface EncodeInput {
  /** Tract GEOIDs. Sorted internally; column order must match the input order. */
  geoids: readonly string[];
  columns: readonly { spec: ColumnSpec; values: readonly (number | null)[] }[];
}

/**
 * Build the payload buffer. Callers pass tracts in any order; this sorts by
 * GEOID and permutes every column to match, so the reader can binary search.
 */
export function encodePayload(input: EncodeInput): Buffer {
  const { geoids, columns } = input;
  const count = geoids.length;
  for (const c of columns) {
    if (c.values.length !== count) {
      throw new Error(
        `Column "${c.spec.name}" has ${c.values.length} values but there are ${count} tracts`
      );
    }
  }
  const names = new Set<string>();
  for (const c of columns) {
    if (names.has(c.spec.name)) throw new Error(`Duplicate column name "${c.spec.name}"`);
    names.add(c.spec.name);
  }

  const order = Array.from({ length: count }, (_, i) => i).sort((a, b) =>
    geoids[a] < geoids[b] ? -1 : geoids[a] > geoids[b] ? 1 : 0
  );
  const sortedGeoids = order.map((i) => geoids[i]);
  for (let i = 1; i < count; i++) {
    if (sortedGeoids[i] === sortedGeoids[i - 1]) {
      throw new Error(`Duplicate tract GEOID ${sortedGeoids[i]}`);
    }
  }

  // Delta-encode the sorted GEOIDs. An 11-digit GEOID is under 2^53, so exact
  // in a double; consecutive tracts differ by small amounts, which brotli then
  // crushes.
  const geoidDeltas: number[] = [];
  let prev = 0;
  for (const g of sortedGeoids) {
    const n = Number(g);
    if (!Number.isInteger(n) || n < 0) throw new Error(`GEOID "${g}" is not a non-negative integer`);
    geoidDeltas.push(n - prev);
    prev = n;
  }

  const bodies: ArrayBuffer[] = [];
  const offsets: number[] = [];
  let at = 0;
  for (const c of columns) {
    const permuted = order.map((i) => c.values[i]);
    const buf = encodeColumn(c.spec, permuted);
    // Align each column to its element size so typed-array views are legal.
    const align = BYTES[c.spec.type];
    const pad = (align - (at % align)) % align;
    if (pad > 0) {
      bodies.push(new ArrayBuffer(pad));
      at += pad;
    }
    offsets.push(at);
    bodies.push(buf);
    at += buf.byteLength;
  }

  const header: PayloadHeader = {
    magic: MAGIC,
    version: 1,
    count,
    geoidDeltas,
    columns: columns.map((c) => c.spec),
    offsets,
  };
  const headerJson = Buffer.from(JSON.stringify(header), "utf8");

  // Pad the header so the body starts 8-byte aligned, which keeps every
  // typed-array view valid regardless of header length.
  const prefix = MAGIC_BYTES + 4;
  const headerPad = (8 - ((prefix + headerJson.length) % 8)) % 8;
  const lengthField = Buffer.alloc(4);
  lengthField.writeUInt32LE(headerJson.length + headerPad, 0);

  return Buffer.concat([
    Buffer.from(MAGIC, "ascii"),
    lengthField,
    headerJson,
    Buffer.alloc(headerPad, 0x20),
    ...bodies.map((b) => Buffer.from(b)),
  ]);
}

export interface Payload {
  count: number;
  /** Sorted tract GEOIDs. */
  geoids: string[];
  columns: Map<string, Column>;
  /** Row index for a GEOID, or -1. Binary search over the sorted list. */
  indexOf(geoid: string): number;
  /** One field for one tract, by GEOID. */
  value(geoid: string, column: string): number | null;
}

/** Read a payload buffer. Typed-array views, so no per-value copying. */
export function decodePayload(buf: Buffer): Payload {
  const magic = buf.subarray(0, MAGIC_BYTES).toString("ascii");
  if (magic !== MAGIC) {
    throw new Error(`Not an OZ tract payload (magic "${magic}"); rebuild with npm run pipeline`);
  }
  const headerLength = buf.readUInt32LE(MAGIC_BYTES);
  const headerStart = MAGIC_BYTES + 4;
  const header = JSON.parse(
    buf.subarray(headerStart, headerStart + headerLength).toString("utf8")
  ) as PayloadHeader;
  if (header.version !== 1) {
    throw new Error(`Payload version ${header.version} is not supported`);
  }

  const bodyStart = headerStart + headerLength;
  // Copy the body into its own buffer so offsets are relative and alignment
  // holds even when the file was read into a pooled Node Buffer.
  const body = buf.buffer.slice(
    buf.byteOffset + bodyStart,
    buf.byteOffset + buf.byteLength
  ) as ArrayBuffer;

  const geoidNumbers = new Array<number>(header.count);
  let running = 0;
  for (let i = 0; i < header.count; i++) {
    running += header.geoidDeltas[i];
    geoidNumbers[i] = running;
  }
  // GEOIDs are zero-padded to 11 characters; leading zeros matter (Alabama is
  // state 01) and are lost in the numeric delta encoding.
  const geoids = geoidNumbers.map((n) => String(n).padStart(11, "0"));

  const columns = new Map<string, Column>();
  header.columns.forEach((spec, i) => {
    columns.set(spec.name, viewColumn(spec, body, header.offsets[i], header.count));
  });

  function indexOf(geoid: string): number {
    let lo = 0;
    let hi = header.count - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const g = geoids[mid];
      if (g === geoid) return mid;
      if (g < geoid) lo = mid + 1;
      else hi = mid - 1;
    }
    return -1;
  }

  return {
    count: header.count,
    geoids,
    columns,
    indexOf,
    value(geoid, column) {
      const i = indexOf(geoid);
      if (i < 0) return null;
      return columns.get(column)?.get(i) ?? null;
    },
  };
}
