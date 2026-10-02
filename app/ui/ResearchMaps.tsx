"use client";
import { useEffect, useState } from "react";
import { featuresFrom } from "@/lib/geo/stateBoundaries";
import { outlinePaths, type Geometry, type Outline } from "@/lib/research/geometry";

export function BoundaryHistoryMap({ pairs }: { pairs: Array<[string, string, number, number, number]> }) {
  const [features, setFeatures] = useState<Outline[]>([]); const [message, setMessage] = useState(""); const [mode, setMode] = useState("overlay");
  const key = JSON.stringify(pairs.map((p) => p.slice(0, 2)));
  useEffect(() => {
    const controller = new AbortController(); const ids = JSON.parse(key) as string[][];
    const requests = ["2010", "2020"].flatMap((vintage, i) => [...new Set(ids.map((p) => p[i].slice(0, 2)))].map(async (state) => {
      const response = await fetch(`/boundaries/${vintage === "2010" ? "tracts2010" : "tracts"}/${state}.json`, { signal: controller.signal }); if (!response.ok) return [];
      const selected = new Set(ids.map((p) => p[i]));
      return featuresFrom(await response.json(), "tracts").filter((f) => selected.has(String(f.properties.GEOID))).map((f) => ({ id: String(f.properties.GEOID), vintage, geometry: f.geometry as Geometry }));
    }));
    Promise.all(requests).then((sets) => { if (!controller.signal.aborted) { const next = sets.flat(); setFeatures(next); const expected = new Set(ids.map((p) => p[0])).size + new Set(ids.map((p) => p[1])).size; setMessage(next.length < expected ? "Some historical or current outlines are unavailable. The relationship table remains available." : ""); } }).catch(() => { if (!controller.signal.aborted) setMessage("Cartographic outlines could not be loaded."); });
    return () => controller.abort();
  }, [key]);
  const paths = outlinePaths(features);
  return <div className="research-map"><div className="answer-actions" role="group" aria-label="Boundary vintage">{[["overlay", "Overlay both"], ["2010", "2010 boundaries"], ["2020", "2020 boundaries"]].map(([id, label]) => <button type="button" className="button secondary" aria-pressed={mode === id} key={id} onClick={() => setMode(id)}>{label}</button>)}</div><svg viewBox="0 0 900 400" role="img" aria-label="Selected tract relationships on a shared cartographic extent"><rect width="900" height="400" fill="var(--wash)" />{paths.filter((p) => mode === "overlay" || mode === p.vintage).map((p) => <path key={`${p.vintage}:${p.id}`} d={p.path} fill={p.vintage === "2010" ? "#c47a3020" : "#3c80b420"} fillRule="evenodd" stroke={p.vintage === "2010" ? "#c47a30" : "#3c80b4"} strokeWidth="2" strokeDasharray={p.vintage === "2010" ? "6 3" : undefined}><title>{p.vintage} tract {p.id}</title></path>)}</svg><p className="hint">Dashed amber: 2010. Solid blue: 2020 tract geography in the current cartographic file. Shared extent in every mode. Generalized Census outlines, not parcel boundaries; differences can include cartographic generalization. {message}</p></div>;
}
export function CoverageMap({ groups, state }: { groups: Array<{ id: string; name: string; total: number; available: number }>; state: string }) {
  const [features, setFeatures] = useState<Outline[]>([]);
  useEffect(() => { const controller = new AbortController(); fetch("/boundaries/counties.json", { signal: controller.signal }).then((r) => { if (!r.ok) throw new Error(); return r.json(); }).then((data) => { if (!controller.signal.aborted) setFeatures(featuresFrom(data, "counties").map((f) => ({ id: String(f.properties.GEOID), geometry: f.geometry as Geometry }))); }).catch(() => {}); return () => controller.abort(); }, []);
  const lookup = new Map(groups.map((g) => [g.id, g]));
  const paths = outlinePaths(features.filter((f) => state ? f.id.startsWith(state) : !["02", "15", "60", "66", "69", "72", "78"].includes(f.id.slice(0, 2))));
  if (!paths.length) return <p className="hint">Map outlines unavailable; the coverage tiles below contain the same counts.</p>;
  return <div className="research-map"><svg viewBox="0 0 900 400" role="img" aria-label={state ? "County data coverage map" : "Contiguous United States coverage map"}>{paths.map((p) => { const g = lookup.get(state ? p.id : p.id.slice(0, 2)); return <path key={p.id} d={p.path} fill={g ? "var(--accent)" : "var(--muted)"} fillOpacity={g?.total ? .15 + .85 * g.available / g.total : .12} fillRule="evenodd" stroke="var(--paper)" strokeWidth=".4"><title>{g ? `${g.name}: ${g.available} of ${g.total} tract values available` : "No coverage record"}</title></path>; })}</svg><p className="hint">Darker shade means more complete data coverage, not a preferred area. {state ? "County detail." : "Map shows the contiguous U.S.; select a state or territory to view it individually. All jurisdictions appear in the tiles below."} Boundaries: U.S. Census Bureau.</p></div>;
}
