import { parseFilters, NO_FILTERS, type Filters } from "@/lib/explore/filter";
import { MEASURES } from "./measures";
import { STATE_FIPS } from "@/lib/geo/states";

export const RESEARCH_COLUMNS: readonly string[] = [...new Set(MEASURES.map((m) => m.column))];
export interface Specification { version: 1; state: string; filters: Filters; sort: string; geoids: string[]; columns: string[]; format: "zip" | "json" }
export interface LocalProject { id: string; title: string; notes: string; updated: string; datasetVersion?: string; spec: Specification }
export const EMPTY_SPEC: Specification = { version: 1, state: "", filters: NO_FILTERS, sort: "geoid", geoids: [], columns: ["population", "median_household_income", "median_home_value"], format: "zip" };
export function specification(input: unknown): Specification {
  if (!input || typeof input !== "object") throw new Error("Invalid research specification.");
  const v = input as Record<string, unknown>;
  if (v.version !== 1 || typeof v.state !== "string" || (v.state && !Object.values(STATE_FIPS).includes(v.state))) throw new Error("Unsupported research version or state.");
  if (!Array.isArray(v.geoids) || v.geoids.length > 500 || v.geoids.some((id) => typeof id !== "string" || !/^\d{11}$/.test(id))) throw new Error("Choose up to 500 valid tract identifiers.");
  if (!Array.isArray(v.columns) || !v.columns.length || v.columns.some((key) => !RESEARCH_COLUMNS.includes(key))) throw new Error("Choose supported columns.");
  const sorts = ["geoid", "median_home_value:asc", "median_home_value:desc", "median_household_income:asc", "median_household_income:desc", "population:desc"];
  if (typeof v.sort !== "string" || !sorts.includes(v.sort) || !["zip", "json"].includes(String(v.format))) throw new Error("Unsupported ordering or format.");
  return { version: 1, state: v.state, filters: parseFilters(JSON.stringify(v.filters)), sort: v.sort, geoids: [...new Set(v.geoids as string[])], columns: [...new Set(v.columns as string[])], format: v.format as "zip" | "json" };
}
export function readProjects(text: string): LocalProject[] {
  if (text.length > 500_000) throw new Error("Local project storage is too large.");
  const items: unknown = JSON.parse(text);
  if (!Array.isArray(items) || items.length > 20) throw new Error("Unsupported project collection.");
  return items.map((raw) => { const p = raw as LocalProject; if (!p || typeof p.id !== "string" || typeof p.title !== "string" || typeof p.notes !== "string" || typeof p.updated !== "string") throw new Error("Invalid local project."); return { id: p.id.slice(0, 80), title: p.title.slice(0, 80), notes: p.notes.slice(0, 4000), updated: p.updated, ...(typeof p.datasetVersion === "string" ? { datasetVersion: p.datasetVersion.slice(0, 80) } : {}), spec: specification(p.spec) }; });
}
export function parseTractList(text: string) {
  if (text.length > 64_000) throw new Error("Choose a one-column tract list smaller than 64 KB.");
  const cells = text.replace(/^\uFEFF/, "").split(/[\r\n,;\t]+/).map((v) => v.trim().replace(/^"|"$/g, "")).filter(Boolean);
  if (/^(geoid|tract|tract_id)$/i.test(cells[0] ?? "")) cells.shift();
  if (cells.length > 500) throw new Error("A list can contain at most 500 entries. Split larger lists explicitly.");
  const valid = cells.filter((v) => /^\d{11}$/.test(v));
  return { geoids: [...new Set(valid)], duplicates: valid.length - new Set(valid).size, invalid: cells.filter((v) => !/^\d{11}$/.test(v)) };
}
export function sharedSpecification(spec: Specification): string {
  const clean = specification(spec);
  if (clean.geoids.length > 25) throw new Error("Shared links support up to 25 tract selections. Narrow the selection explicitly; exports support larger lists.");
  return `#spec=${encodeURIComponent(JSON.stringify(clean))}`;
}
export interface ReleaseFile { manifest: { datasetVersion: string; sha256OfRowsJson?: string; filters?: unknown; state?: unknown; sort?: unknown }; rows: Array<Record<string, string | number | boolean | null>>; dictionary?: unknown[]; sources?: unknown[] }
export function parseRelease(text: string): ReleaseFile {
  if (text.length > 10_000_000) throw new Error("Release file exceeds 10 MB.");
  const v = JSON.parse(text);
  if (!v?.manifest || typeof v.manifest.datasetVersion !== "string" || !Array.isArray(v.rows) || v.rows.length > 500) throw new Error("Choose an exported area-research JSON file with up to 500 rows.");
  const keys = ["geoid", "county", "state", "designation_2027", "eligible_2027", "rural_2027", ...RESEARCH_COLUMNS];
  const seen = new Set<string>();
  for (const r of v.rows) {
    if (!r || typeof r !== "object" || !/^\d{11}$/.test(r.geoid) || seen.has(r.geoid)) throw new Error("Invalid or duplicate tract identifier in release.");
    seen.add(r.geoid);
    if (Object.keys(r).some((key) => !keys.includes(key)) || Object.values(r).some((x) => (typeof x === "number" && !Number.isFinite(x)) || (x !== null && !["string", "number", "boolean"].includes(typeof x)))) throw new Error("Unsupported release fields.");
  }
  return { manifest: { datasetVersion: v.manifest.datasetVersion, sha256OfRowsJson: v.manifest.sha256OfRowsJson, filters: v.manifest.filters, state: v.manifest.state, sort: v.manifest.sort }, rows: v.rows, dictionary: Array.isArray(v.dictionary) ? v.dictionary : [], sources: Array.isArray(v.sources) ? v.sources : [] };
}
export function releaseChanges(before: ReleaseFile, after: ReleaseFile) {
  const a = new Map(before.rows.map((r) => [r.geoid, r])); const b = new Map(after.rows.map((r) => [r.geoid, r]));
  const changed: Array<{ geoid: string; field: string; before: unknown; after: unknown; kind: string }> = [];
  for (const [id, row] of b) { const old = a.get(id); if (!old) { changed.push({ geoid: String(id), field: "row", before: null, after: "Present", kind: "Added to this file" }); continue; }
    for (const key of new Set([...Object.keys(old), ...Object.keys(row)])) if (old[key] !== row[key]) changed.push({ geoid: String(id), field: key, before: old[key], after: row[key], kind: !(key in old) || !(key in row) ? "Column coverage changed" : old[key] == null || row[key] == null ? "Missing-value coverage changed" : "Published value changed" });
  }
  for (const [id] of a) if (!b.has(id)) changed.push({ geoid: String(id), field: "row", before: "Present", after: null, kind: "Absent from this file" });
  return { changed, sourcesChanged: JSON.stringify(before.sources) !== JSON.stringify(after.sources), definitionsChanged: JSON.stringify(before.dictionary) !== JSON.stringify(after.dictionary), scopeChanged: JSON.stringify([before.manifest.state, before.manifest.filters, before.manifest.sort]) !== JSON.stringify([after.manifest.state, after.manifest.filters, after.manifest.sort]) };
}
