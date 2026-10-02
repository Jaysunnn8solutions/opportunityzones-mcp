"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { filterDescription, filtersActive } from "@/lib/explore/filter";
import { selectedMeasures } from "@/lib/research/measures";
import { useResearchRecipe } from "./useResearchRecipe";

export default function ResearchBar({ version, states }: { version: string; states: Record<string, string> }) {
  const path = usePathname();
  const recipe = useResearchRecipe();
  const [message, setMessage] = useState("");
  if (["/legal", "/entry", "/accessibility", "/use-with-claude"].some((p) => path.startsWith(p))) return null;
  const hasResearch = !!recipe.state || !!recipe.ids.length || filtersActive(recipe.filters) || !!recipe.activeId;
  if (!hasResearch) return null;
  return <aside className="research-bar no-print" aria-label="Your research">
    <details><summary><strong>Your research</strong><span>{recipe.ids.length ? `Export scope: ${recipe.ids.length} selected tracts` : states[recipe.state] ?? "Choose geography"}</span><span>{recipe.saved ? "Saved on this device" : "Unsaved changes"}</span></summary>
      <dl><div><dt>Search geography</dt><dd>{states[recipe.state] ?? "No state selected"}{recipe.filters.county ? ` · County FIPS ${recipe.filters.county}` : ""}</dd></div><div><dt>Applied criteria</dt><dd>{filterDescription(recipe.filters)}</dd></div><div><dt>Measures</dt><dd>{selectedMeasures(recipe.keys).map((m) => m.label).join(" · ")}</dd></div><div><dt>Export scope</dt><dd>{recipe.ids.length ? `Explicit tract list (${recipe.ids.length}); filters do not remove entries from this list.` : "All matches in the selected state, subject to download limits."}</dd></div></dl>
      <p className="hint">Research stays in memory until you save it. Refreshing or closing this page can discard unsaved changes. Saved projects stay on this device.</p>
    </details>
    <div className="answer-actions"><button type="button" className="link" onClick={() => { try { recipe.save(version); setMessage("Research saved on this device."); } catch (error) { setMessage((error as Error).message); } }}>Save on this device</button><Link href="/workbench#tab=prepare" onClick={() => window.dispatchEvent(new CustomEvent("research-workspace-tab", { detail: "prepare" }))}>Prepare data →</Link><Link href="/workbench#tab=projects" onClick={() => window.dispatchEvent(new CustomEvent("research-workspace-tab", { detail: "projects" }))}>My research</Link></div>
    <span role="status">{message}</span>
  </aside>;
}
