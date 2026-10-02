"use client";
import { useResearchState } from "./ResearchSession";
import { NO_FILTERS, type Filters } from "@/lib/explore/filter";
import { DEFAULT_MEASURES, type MeasureKey } from "@/lib/research/measures";
import { specification, readProjects, type LocalProject, type Specification } from "@/lib/research/workbench";

export const PROJECT_STORAGE = "oz-research-projects-v1";
export function useResearchRecipe() {
  const [state, setState] = useResearchState("explore-state", "");
  const [filters, setFilters] = useResearchState<Filters>("explore-filters", NO_FILTERS);
  const [sort, setSort] = useResearchState("explore-sort", "geoid");
  const [comparison] = useResearchState<string[]>("comparison", []);
  const [selection, setIds] = useResearchState<string[] | null>("workspace-tracts", null);
  const ids = selection ?? comparison;
  const [keys, setKeys] = useResearchState<MeasureKey[]>("comparison-measures", DEFAULT_MEASURES);
  const [format, setFormat] = useResearchState<"zip" | "json">("workspace-format", "zip");
  const [title, setTitle] = useResearchState("project-title", "Untitled research");
  const [notes, setNotes] = useResearchState("project-notes", "");
  const [activeId, setActiveId] = useResearchState("project-id", "");
  const [saved, setSaved] = useResearchState("project-saved-fingerprint", "");
  const [savedVersion, setSavedVersion] = useResearchState("project-dataset-version", "");
  const spec: Specification = { version: 1, state, filters, sort, geoids: ids, columns: keys, format };
  let fingerprint = "";
  try { fingerprint = JSON.stringify([specification(spec), title, notes]); } catch { /* Invalid drafts cannot be marked saved. */ }
  function apply(input: Specification) {
    const clean = specification(input);
    setState(clean.state); setFilters(clean.filters); setSort(clean.sort); setIds(clean.geoids); setKeys(clean.columns as MeasureKey[]); setFormat(clean.format);
  }
  function openProject(project: LocalProject) {
    apply(project.spec); setTitle(project.title); setNotes(project.notes); setActiveId(project.id);
    setSaved(JSON.stringify([project.spec, project.title, project.notes])); setSavedVersion(project.datasetVersion ?? "");
  }
  function save(version: string, asNew = false) {
    const projects = readProjects(localStorage.getItem(PROJECT_STORAGE) ?? "[]");
    const id = asNew || !activeId ? crypto.randomUUID() : activeId;
    const existing = projects.some((p) => p.id === id);
    if (!existing && projects.length >= 20) throw new Error("This device has 20 saved projects. Remove a saved copy before adding another.");
    const clean = specification(spec);
    const name = title.trim() || "Untitled research";
    const project: LocalProject = { id, title: name, notes, updated: new Date().toISOString(), datasetVersion: version, spec: clean };
    localStorage.setItem(PROJECT_STORAGE, JSON.stringify([...projects.filter((p) => p.id !== id), project]));
    setActiveId(id); setTitle(name); setSaved(JSON.stringify([clean, name, notes])); setSavedVersion(version);
    window.dispatchEvent(new Event("research-projects-changed"));
  }
  return { state, setState, filters, setFilters, sort, setSort, ids, setIds, keys, setKeys, format, setFormat, title, setTitle, notes, setNotes, activeId, setActiveId, spec, apply, openProject, save, savedVersion, saved: !!activeId && !!saved && saved === fingerprint };
}
