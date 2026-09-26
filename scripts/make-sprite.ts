/**
 * Writes the map's own sprite: the diagonal hatch drawn over rural tracts.
 *
 *   npx tsx scripts/make-sprite.ts
 *
 * Output (committed): public/sprites/oz.{json,png} and oz@2x.{json,png}, a
 * standard MapLibre sprite merged into every basemap (lib/geo/basemaps.ts).
 * Written as a tiny PNG by hand, so no image dependency is needed.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { crc32, deflateSync } from "node:zlib";

/** Ink colour of the hatch lines (RGBA). Keep in step with HATCH_INK in app/ui/MapApp.tsx. */
const INK: [number, number, number, number] = [6, 40, 29, 217];

function png(width: number, height: number, rgba: Uint8Array): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    Buffer.from(rgba.subarray(y * width * 4, (y + 1) * width * 4)).copy(raw, y * (width * 4 + 1) + 1);
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** A seamless tile of 45-degree lines: a pixel is ink when it lies on the anti-diagonal band. */
export function hatch(size: number, lineWidth: number): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if ((x + y) % size < lineWidth) out.set(INK, (y * size + x) * 4);
    }
  }
  return out;
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  const dir = path.resolve(import.meta.dirname, "..", "public", "sprites");
  for (const [suffix, ratio] of [["", 1], ["@2x", 2]] as const) {
    const size = 8 * ratio;
    writeFileSync(path.join(dir, `oz${suffix}.png`), png(size, size, hatch(size, 2 * ratio)));
    writeFileSync(
      path.join(dir, `oz${suffix}.json`),
      JSON.stringify({ "rural-hatch": { x: 0, y: 0, width: size, height: size, pixelRatio: ratio } })
    );
  }
  console.log("wrote public/sprites/oz{,@2x}.{json,png}");
}
