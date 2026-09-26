/**
 * Web-mercator tile arithmetic for the boundary proxy and the map client.
 * Tiles are the unit of caching: every viewer of an area asks for the same
 * tile URLs, so the CDN can answer the second one.
 */

export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

function lonOf(x: number, z: number): number {
  return (x / 2 ** z) * 360 - 180;
}

function latOf(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

export function tileBounds(z: number, x: number, y: number): Bounds {
  return { west: lonOf(x, z), east: lonOf(x + 1, z), north: latOf(y, z), south: latOf(y + 1, z) };
}

export function isValidTile(z: number, x: number, y: number): boolean {
  const n = 2 ** z;
  return [z, x, y].every(Number.isInteger) && z >= 0 && z <= 22 && x >= 0 && x < n && y >= 0 && y < n;
}

/** Tile containing a point at zoom z. */
export function tileOf(lon: number, lat: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const rad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
  return { x: Math.min(n - 1, Math.max(0, x)), y: Math.min(n - 1, Math.max(0, y)) };
}

/** Every tile at zoom z covering a bounding box. */
export function tilesCovering(b: Bounds, z: number): Array<{ x: number; y: number }> {
  const a = tileOf(b.west, b.north, z);
  const c = tileOf(b.east, b.south, z);
  const out: Array<{ x: number; y: number }> = [];
  for (let x = a.x; x <= c.x; x++) for (let y = a.y; y <= c.y; y++) out.push({ x, y });
  return out;
}

/**
 * Geometry generalisation for a zoom, in degrees: about half a screen pixel, so
 * shapes lose no visible detail but carry no more vertices than can be seen.
 */
export function toleranceForZoom(z: number): number {
  return 360 / (256 * 2 ** z) / 2;
}
