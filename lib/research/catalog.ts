import { getTract, loadTractData } from "@/lib/data/tracts";
import { SOURCES, type SourceId } from "@/pipeline/sources";
import { RESEARCH_COLUMNS } from "./workbench";
import { MEASURES } from "./measures";

export function researchCatalog() {
  const { manifest, lookups } = loadTractData();
  return { version: manifest.generated, states: Object.entries(lookups.states).map(([fips, name]) => ({ fips, name })), columns: manifest.columns.filter((c) => RESEARCH_COLUMNS.includes(c.name)).map((column) => {
    const source = SOURCES[column.source as SourceId];
    return { ...column, label: MEASURES.find((m) => m.column === column.name)?.label ?? column.description ?? column.name, sourceName: source?.name ?? column.source, publisher: source?.publisher ?? "Unknown", vintage: source?.vintage ?? "Unavailable", geography: source?.geography ?? "Unavailable", url: source?.homepage ?? "", license: source?.license ?? "Unavailable", attribution: source?.attribution ?? "Unavailable", method: source?.notes ?? "See published source methodology.", rationale: source?.rationale ?? "", moe: manifest.columns.some((c) => c.name === `${column.name}_moe`) ? `${column.name}_moe` : null };
  }) };
}
export type ResearchCatalog = ReturnType<typeof researchCatalog>;
export function coverage(column: string, state = "") {
  const { payload, lookups } = loadTractData(); const values = payload.columns.get(column);
  const groups = new Map<string, { id: string; name: string; total: number; available: number }>();
  payload.geoids.forEach((id, i) => { if (state && !id.startsWith(state)) return; const key = id.slice(0, state ? 5 : 2); const group = groups.get(key) ?? { id: key, name: state ? lookups.counties[key]?.name ?? key : lookups.states[key] ?? key, total: 0, available: 0 }; group.total++; if (values?.get(i) != null) group.available++; groups.set(key, group); });
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}
export function baseline(column: string, geoid: string, scope: "tract" | "county" | "state" | "selection", selected: string[]) {
  const { payload, lookups } = loadTractData(); const values = payload.columns.get(column); const profile = getTract(geoid); if (!profile) throw new Error("Tract is unavailable.");
  const ids = new Set(selected); const prefix = scope === "county" ? geoid.slice(0, 5) : geoid.slice(0, 2);
  const indices = payload.geoids.flatMap((id, i) => (scope === "tract" ? id === geoid : scope === "selection" ? ids.has(id) : id.startsWith(prefix)) ? [i] : []);
  const absentSelection = scope === "selection" ? [...ids].filter((id) => payload.indexOf(id) < 0) : [];
  const present = indices.map((i) => values?.get(i)).filter((v): v is number => v != null).sort((a, b) => a - b);
  const middle = Math.floor(present.length / 2); const median = present.length ? present.length % 2 ? present[middle] : (present[middle - 1] + present[middle]) / 2 : null;
  const value = profile.measures[column]?.value ?? null; const moe = profile.measures[`${column}_moe`]?.value ?? null;
  return { scope, label: scope === "tract" ? `Tract ${geoid}` : scope === "county" ? profile.county : scope === "state" ? lookups.states[prefix] : "Explicitly selected tracts", total: indices.length + absentSelection.length, available: present.length, missing: indices.length + absentSelection.length - present.length, absentSelection, median, min: present[0] ?? null, max: present.at(-1) ?? null, value, moe, sum: ["population", "jobs_2023", "built_2020_or_later"].includes(column) && indices.length > 0 && !absentSelection.length && present.length === indices.length ? present.reduce((s, n) => s + n, 0) : null, permits: scope === "county" ? profile.countyPermits : null };
}
