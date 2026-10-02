/** Decorative map geometry from the project's existing Census county outlines. No network calls. */
import { readFileSync, writeFileSync } from "node:fs";
import { merge } from "topojson-client";
import type { Topology, GeometryCollection, Polygon, MultiPolygon } from "topojson-specification";
import { outlinePaths, type Geometry } from "../lib/research/geometry";
import { featuresFrom } from "../lib/geo/stateBoundaries";
import { interiorPoint } from "../lib/geo/interiorPoint";
import { loadTractData } from "../lib/data/tracts";
import { entryHeatField } from "./entry-heat-field";

const topology = JSON.parse(readFileSync("public/boundaries/counties.json", "utf8")) as Topology;
type CountyProperties = { GEOID: string };
const counties = (topology.objects.counties as GeometryCollection<CountyProperties>).geometries.filter((g): g is Polygon<CountyProperties> | MultiPolygon<CountyProperties> => g.type === "Polygon" || g.type === "MultiPolygon");
const states = [...new Set(counties.map((g) => String(g.properties?.GEOID).slice(0, 2)))].filter((id) => !["02", "15", "60", "66", "69", "72", "78"].includes(id)).sort();
const stateFeatures = states.map((id) => ({ id, geometry: merge(topology, counties.filter((g) => String(g.properties?.GEOID).startsWith(id))) as Geometry }));
const paths = outlinePaths(stateFeatures, 1000, 620);
writeFileSync("lib/content/entryMap.json", JSON.stringify(paths.map(({ id, path }) => ({ id, path }))));
console.log(`Published ${paths.length} decorative state outlines from existing Census geometry.`);

// Schematic population lights, not remotely sensed nighttime radiance. Reuse the
// registered Census sources already published locally; never fetch at runtime.
const { payload, lookups } = loadTractData();
const population = payload.columns.get("population")!;
const populationByTract = new Map(payload.geoids.map((id, index) => [id, population.get(index)]));
const markers: Array<{ id: string; geometry: Geometry }> = [];
for (const state of states) {
  const file = JSON.parse(readFileSync(`public/boundaries/tracts/${state}.json`, "utf8"));
  for (const feature of featuresFrom(file, "tracts")) {
    const id = String(feature.properties.GEOID), count = populationByTract.get(id);
    if (count == null || !Number.isFinite(count) || count <= 0) continue;
    const point = interiorPoint(feature.geometry as Geometry);
    if (point) markers.push({ id, geometry: { type: "Polygon", coordinates: [[point, point, point, point]] } });
  }
}
// The same extent and projection as the state outlines. Aggregate into small
// cells to bound asset size, with population-weighted positions inside each cell.
const cells = new Map<string, { population: number; x: number; y: number }>();
for (const marker of outlinePaths([...stateFeatures, ...markers], 1000, 620).slice(stateFeatures.length)) {
  const match = /^M(-?[\d.]+),(-?[\d.]+)/.exec(marker.path)!;
  const x = Number(match[1]), y = Number(match[2]), count = populationByTract.get(marker.id)!;
  const key = `${Math.floor(x / 5)},${Math.floor(y / 5)}`;
  const cell = cells.get(key) ?? { population: 0, x: 0, y: 0 };
  cell.population += count; cell.x += x * count; cell.y += y * count; cells.set(key, cell);
}
const bands = Array.from({ length: 5 }, () => [] as string[]);
for (const cell of cells.values()) {
  const band = [5000, 20000, 80000, 250000].filter((threshold) => cell.population >= threshold).length;
  bands[band].push(`M${(cell.x / cell.population).toFixed(1)},${(cell.y / cell.population).toFixed(1)}h.01`);
}
const lights = bands.map((points, i) => {
  const d = points.join("");
  return `<g><path d="${d}" stroke="#66bbdf" stroke-width="${i > 2 ? 10 + i : 9 + i * 3}" opacity="${(i > 2 ? .07 : .025 + i * .025).toFixed(3)}"/><path d="${d}" stroke="${i > 2 ? "#ffe8bd" : "#a7d2e5"}" stroke-width="${(i > 2 ? 4 + i * .45 : 3.5 + i * 1.2).toFixed(1)}" opacity="${(.10 + i * .16).toFixed(2)}"/></g>`;
}).join("");
// Sum nearby populations into one smooth field before applying the color ramp.
// This avoids drawing brighter circles over the softer background.
const cores = `<image width="1000" height="620" href="data:image/png;base64,${entryHeatField(cells.values())}"/>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 620"><title>Illustrative population glow, contiguous United States</title><desc>Derived from U.S. Census Bureau 2020–2024 ACS tract population estimates and Census boundaries. Public domain. Not satellite imagery, measured nighttime light, eligibility, or an investment signal. Missing population values are omitted. Small cells aggregate tract representative points; not the locations of people or buildings. Smoothing is decorative and does not classify urban or rural areas.</desc><defs><filter id="soft" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="2.2"/></filter><clipPath id="land">${paths.map(({ path }) => `<path d="${path}" fill-rule="evenodd"/>`).join("")}</clipPath></defs><g clip-path="url(#land)" fill="none" stroke-linecap="round"><g filter="url(#soft)">${lights}</g>${cores}</g></svg>`;
writeFileSync("public/entry-population-lights.svg", svg);
console.log(`Published ${cells.size} population-light cells from ${markers.length} populated tracts (${Math.round(Buffer.byteLength(svg) / 1024)} KB SVG).`);

// Fixed geographic samples demonstrate navigation, never comparative merit.
// Geometry alone selects a visible polygon: no status or socioeconomic values.
const samples = [["53061", "Pacific Northwest"], ["06067", "Pacific Coast"], ["20173", "Central Plains"], ["55025", "Upper Midwest"], ["37183", "Southeast"], ["25017", "Northeast"]];
const scenes = samples.map(([county, name]) => {
  const file = JSON.parse(readFileSync(`public/boundaries/tracts/${county.slice(0, 2)}.json`, "utf8"));
  const features = featuresFrom(file, "tracts").filter((f) => String(f.properties.GEOID).startsWith(county)).map((f) => ({ id: String(f.properties.GEOID), geometry: f.geometry as Geometry }));
  const center = (geometry: Geometry) => { const points = geometry.type === "Polygon" ? geometry.coordinates.flat() : geometry.coordinates.flat(2); return [points.reduce((n, p) => n + p[0], 0) / points.length, points.reduce((n, p) => n + p[1], 0) / points.length]; };
  const centers = features.map((f) => center(f.geometry));
  const middle = [centers.reduce((n, p) => n + p[0], 0) / centers.length, centers.reduce((n, p) => n + p[1], 0) / centers.length];
  const nearest = features.sort((a, b) => { const aa = center(a.geometry), bb = center(b.geometry); return Math.hypot(aa[0] - middle[0], aa[1] - middle[1]) - Math.hypot(bb[0] - middle[0], bb[1] - middle[1]); }).slice(0, 80);
  const detail = outlinePaths(nearest, 1000, 620).map(({ id, path }) => ({ id, path }));
  const boxes = detail.map((f) => { const values = [...f.path.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]); const xs = values.map((p) => p[0]), ys = values.map((p) => p[1]); const w = Math.min(...xs), e = Math.max(...xs), s = Math.min(...ys), n = Math.max(...ys); return { ...f, x: (w + e) / 2, y: (s + n) / 2, area: (e - w) * (n - s) }; });
  const visible = boxes.filter((b) => b.area > 1600 && b.area < 40000);
  const selected = (visible.length ? visible : boxes).sort((a, b) => Math.hypot(a.x - 480, a.y - 300) - Math.hypot(b.x - 480, b.y - 300))[0];
  const marker: Geometry = { type: "Polygon", coordinates: [[middle, middle, middle, middle]] };
  const projected = outlinePaths([...stateFeatures, { id: "focus", geometry: marker }], 1000, 620).at(-1)!;
  const focus = /^M(-?[\d.]+),(-?[\d.]+)/.exec(projected.path)!;
  return { name, focus: { x: Number(focus[1]), y: Number(focus[2]) }, selected, tracts: detail };
});
writeFileSync("lib/content/entryTracts.json", JSON.stringify(scenes));
console.log(`Published ${scenes.length} illustrative regional zooms with ${scenes.reduce((n, s) => n + s.tracts.length, 0)} Census tract outlines.`);
const facts = Object.fromEntries(scenes.map(({ selected }) => {
  const index = payload.geoids.indexOf(selected.id);
  return [selected.id, {
    county: lookups.counties[selected.id.slice(0, 5)]?.name ?? "Census tract",
    population: index < 0 ? null : population.get(index),
    medianHouseholdIncome: index < 0 ? null : payload.columns.get("median_household_income")?.get(index) ?? null,
  }];
}));
writeFileSync("lib/content/entryTractFacts.json", JSON.stringify({ period: "2020–2024", incomeDollarYear: 2024, source: "U.S. Census Bureau, ACS 5-year estimates", variables: { population: "B01003_001E", medianHouseholdIncome: "B19013_001E" }, tracts: facts }));
console.log("Published the six selected tracts' Census estimates for the entry preview.");
