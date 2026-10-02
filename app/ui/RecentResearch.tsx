"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { readProjects, type LocalProject } from "@/lib/research/workbench";
import { useResearchRecipe, PROJECT_STORAGE } from "./useResearchRecipe";
import { dateLabel } from "@/lib/client/presentation";
export default function RecentResearch() {
  const recipe = useResearchRecipe();
  const [projects, setProjects] = useState<LocalProject[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    const read = () => { try { setProjects(readProjects(localStorage.getItem(PROJECT_STORAGE) ?? "[]").sort((a, b) => b.updated.localeCompare(a.updated))); setError(false); } catch { setError(true); } };
    const frame = requestAnimationFrame(read);
    window.addEventListener("research-projects-changed", read); window.addEventListener("storage", read);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("research-projects-changed", read); window.removeEventListener("storage", read); };
  }, []);
  if (!projects.length && !error) return null;
  return <section className="recent-research"><h2>Continue your research</h2>{error ? <p>Saved projects could not be read. <Link href="/workbench#tab=projects">Review local storage in your workspace.</Link></p> : <><p className="hint">Saved on this device. Opening a recipe uses current published data.</p><ul>{projects.slice(0, 3).map((p) => <li key={p.id}><Link href="/workbench#tab=projects" onClick={() => recipe.openProject(p)}>{p.title}</Link><span>Saved {dateLabel(p.updated)} · {p.spec.geoids.length ? `${p.spec.geoids.length} selected tracts` : "Filtered geography"}</span></li>)}</ul><Link href="/workbench#tab=projects">View all saved projects →</Link></>}</section>;
}
