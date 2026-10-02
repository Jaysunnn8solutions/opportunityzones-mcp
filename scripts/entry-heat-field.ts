import { zlibSync } from "fflate";

/** Build-time population kernel field. The browser receives only a cached image. */
export function entryHeatField(cells: Iterable<{ population: number; x: number; y: number }>): string {
  const width = 400, height = 248, scale = 2.5, sigma = 2.5, radius = 8;
  const density = new Float64Array(width * height);
  for (const cell of cells) {
    const x = cell.x / cell.population / scale, y = cell.y / cell.population / scale;
    for (let yy = Math.max(0, Math.floor(y) - radius); yy <= Math.min(height - 1, Math.ceil(y) + radius); yy++) {
      for (let xx = Math.max(0, Math.floor(x) - radius); xx <= Math.min(width - 1, Math.ceil(x) + radius); xx++) {
        density[yy * width + xx] += cell.population * Math.exp(-((xx - x) ** 2 + (yy - y) ** 2) / (2 * sigma ** 2));
      }
    }
  }
  const stops = [
    [0, 125, 185, 205, 0],
    [60_000, 125, 185, 205, 0],
    [180_000, 166, 208, 219, 75],
    [450_000, 222, 223, 199, 170],
    [1_000_000, 255, 237, 196, 235],
    [2_500_000, 255, 250, 230, 255],
  ];
  const stride = width * 4 + 1, pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const value = density[y * width + x];
    const upper = stops.findIndex((stop) => stop[0] >= value);
    const hi = upper < 0 ? stops.length - 1 : Math.max(1, upper), lo = hi - 1;
    const fraction = Math.min(1, (value - stops[lo][0]) / (stops[hi][0] - stops[lo][0]));
    const offset = y * stride + 1 + x * 4;
    for (let channel = 0; channel < 4; channel++) pixels[offset + channel] = Math.round(stops[lo][channel + 1] + fraction * (stops[hi][channel + 1] - stops[lo][channel + 1]));
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", Buffer.from(zlibSync(pixels))), chunk("IEND", Buffer.alloc(0))]).toString("base64");
}

function chunk(type: string, payload: Buffer) {
  const body = Buffer.concat([Buffer.from(type), payload]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const result = Buffer.alloc(payload.length + 12);
  result.writeUInt32BE(payload.length, 0); body.copy(result, 4); result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
  return result;
}
