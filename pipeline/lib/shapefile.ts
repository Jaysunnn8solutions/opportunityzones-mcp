/**
 * Just enough of the ESRI shapefile format to read polygon vertices and one
 * attribute. The pipeline needs tract adjacency and nothing else from geometry
 * here, so a full GIS dependency would be dead weight.
 *
 * .shp: 100-byte header, then records of [big-endian record header][little-
 * endian shape]. Polygon (5) records hold a bbox, part offsets, and points.
 * .dbf: fixed-width dBASE III table.
 */

export interface ShpPolygon {
  /** Rings as flat [x0, y0, x1, y1, ...] arrays. */
  rings: Float64Array[];
}

export function readShpPolygons(buf: Uint8Array): Array<ShpPolygon | null> {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (view.getInt32(0, false) !== 9994) throw new Error("Not a shapefile (bad file code)");
  const out: Array<ShpPolygon | null> = [];
  let at = 100;
  while (at + 8 <= buf.byteLength) {
    const contentBytes = view.getInt32(at + 4, false) * 2;
    const rec = at + 8;
    const type = view.getInt32(rec, true);
    if (type === 0) {
      out.push(null);
    } else if (type === 5 || type === 15 || type === 25) {
      const numParts = view.getInt32(rec + 36, true);
      const numPoints = view.getInt32(rec + 40, true);
      const partsAt = rec + 44;
      const pointsAt = partsAt + numParts * 4;
      const starts: number[] = [];
      for (let p = 0; p < numParts; p++) starts.push(view.getInt32(partsAt + p * 4, true));
      starts.push(numPoints);
      const rings: Float64Array[] = [];
      for (let p = 0; p < numParts; p++) {
        const n = starts[p + 1] - starts[p];
        const ring = new Float64Array(n * 2);
        for (let k = 0; k < n; k++) {
          const off = pointsAt + (starts[p] + k) * 16;
          ring[k * 2] = view.getFloat64(off, true);
          ring[k * 2 + 1] = view.getFloat64(off + 8, true);
        }
        rings.push(ring);
      }
      out.push({ rings });
    } else {
      throw new Error(`Unsupported shape type ${type}; expected polygons`);
    }
    at = rec + contentBytes;
  }
  return out;
}

/** One text column from a .dbf, in record order. */
export function readDbfColumn(buf: Uint8Array, column: string): string[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const records = view.getUint32(4, true);
  const headerLen = view.getUint16(8, true);
  const recordLen = view.getUint16(10, true);
  const decoder = new TextDecoder("latin1");

  let fieldAt = 32;
  let offset = 1; // each record starts with a deletion flag byte
  let found: { offset: number; length: number } | null = null;
  const names: string[] = [];
  while (buf[fieldAt] !== 0x0d && fieldAt < headerLen) {
    const name = decoder.decode(buf.subarray(fieldAt, fieldAt + 11)).replace(/\0.*$/, "").trim();
    const length = buf[fieldAt + 16];
    names.push(name);
    if (name.toUpperCase() === column.toUpperCase()) found = { offset, length };
    offset += length;
    fieldAt += 32;
  }
  if (!found) throw new Error(`DBF has no column ${column}; columns are ${names.join(", ")}`);

  const out: string[] = [];
  for (let r = 0; r < records; r++) {
    const start = headerLen + r * recordLen + found.offset;
    out.push(decoder.decode(buf.subarray(start, start + found.length)).trim());
  }
  return out;
}
