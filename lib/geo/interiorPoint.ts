/**
 * A point guaranteed to be inside a tract's polygon, for looking up site data
 * (flood, earthquake, wildfire, nearby sites) when no address was given.
 *
 * The centroid of the largest part is used when it falls inside that part;
 * for crescent- or ring-shaped tracts it does not, so the widest inside span
 * of the horizontal line through it is taken instead. Holes are respected.
 */

type Ring = number[][];
type Polygon = Ring[];

function ringArea(r: Ring): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
  return a / 2;
}

function insidePolygon(x: number, y: number, poly: Polygon): boolean {
  let hit = false;
  for (const ring of poly) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
  }
  return hit;
}

export function pointInGeometry(point: [number, number], geometry: { type: string; coordinates: unknown }): boolean {
  const polygons: Polygon[] = geometry.type === "Polygon" ? [geometry.coordinates as Polygon] : geometry.type === "MultiPolygon" ? geometry.coordinates as Polygon[] : [];
  return polygons.some((polygon) => insidePolygon(point[0], point[1], polygon));
}

function centroid(r: Ring): [number, number] {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const f = r[j][0] * r[i][1] - r[i][0] * r[j][1];
    a += f;
    cx += (r[j][0] + r[i][0]) * f;
    cy += (r[j][1] + r[i][1]) * f;
  }
  if (a === 0) return [r[0][0], r[0][1]];
  return [cx / (3 * a), cy / (3 * a)];
}

/** Midpoint of the widest inside span along y, or null if the line misses. */
function widestSpan(poly: Polygon, y: number): [number, number] | null {
  const xs: number[] = [];
  for (const ring of poly) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y) xs.push(((xj - xi) * (y - yi)) / (yj - yi) + xi);
    }
  }
  xs.sort((a, b) => a - b);
  let best: [number, number] | null = null;
  let width = -1;
  for (let k = 0; k + 1 < xs.length; k += 2) {
    if (xs[k + 1] - xs[k] > width) {
      width = xs[k + 1] - xs[k];
      best = [(xs[k] + xs[k + 1]) / 2, y];
    }
  }
  return best;
}

export function interiorPoint(geometry: { type: string; coordinates: unknown }): [number, number] | null {
  const polys: Polygon[] =
    geometry.type === "Polygon" ? [geometry.coordinates as Polygon] : geometry.type === "MultiPolygon" ? (geometry.coordinates as Polygon[]) : [];
  const largest = polys.filter((p) => p[0]?.length >= 4).sort((a, b) => Math.abs(ringArea(b[0])) - Math.abs(ringArea(a[0])))[0];
  if (!largest) return null;
  const c = centroid(largest[0]);
  if (insidePolygon(c[0], c[1], largest)) return c;
  const ys = largest[0].map((p) => p[1]);
  const [lo, hi] = [Math.min(...ys), Math.max(...ys)];
  // Try the centroid's latitude first, then a few others, nudged off vertices.
  for (const t of [0.5, 0.35, 0.65, 0.2, 0.8]) {
    const y = c[1] !== lo && c[1] !== hi && t === 0.5 ? c[1] + 1e-9 : lo + (hi - lo) * t + 1e-9;
    const p = widestSpan(largest, y);
    if (p && insidePolygon(p[0], p[1], largest)) return p;
  }
  return null;
}
