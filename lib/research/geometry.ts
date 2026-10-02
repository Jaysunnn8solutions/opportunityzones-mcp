export type Geometry = { type: "Polygon"; coordinates: number[][][] } | { type: "MultiPolygon"; coordinates: number[][][][] };
export interface Outline { id: string; geometry: Geometry; vintage?: string }
/** Shared extent for comparative cartographic outlines; no property-level accuracy implied. */
export function outlinePaths(features: Outline[], width = 900, height = 400) {
  const rings = (g: Geometry) => g.type === "Polygon" ? g.coordinates : g.coordinates.flat();
  const points = features.flatMap((f) => rings(f.geometry).flat()); if (!points.length) return [];
  let minLongitude = Infinity, maxLongitude = -Infinity;
  for (const p of points) { minLongitude = Math.min(minLongitude, p[0]); maxLongitude = Math.max(maxLongitude, p[0]); }
  const wraps = maxLongitude - minLongitude > 180;
  const lon = (x: number) => wraps && x < 0 ? x + 360 : x;
  let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
  for (const p of points) { west = Math.min(west, lon(p[0])); east = Math.max(east, lon(p[0])); south = Math.min(south, p[1]); north = Math.max(north, p[1]); }
  const aspect = Math.max(.1, Math.cos((north + south) / 2 * Math.PI / 180));
  const scale = Math.min((width - 40) / Math.max((east - west) * aspect, .00001), (height - 40) / Math.max(north - south, .00001));
  const dx = (width - (east - west) * aspect * scale) / 2, dy = (height - (north - south) * scale) / 2;
  return features.map((f) => ({ ...f, path: rings(f.geometry).map((ring) => ring.map((p, i) => `${i ? "L" : "M"}${(dx + (lon(p[0]) - west) * aspect * scale).toFixed(2)},${(height - dy - (p[1] - south) * scale).toFixed(2)}`).join(" ") + " Z").join(" ") }));
}
