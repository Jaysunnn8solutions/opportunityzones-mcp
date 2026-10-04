"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { filterDescription, filtersActive } from "@/lib/explore/filter";
import { useResearchRecipe } from "./useResearchRecipe";
import { useResearchState } from "./ResearchSession";

export default function ResearchBar({ version, states }: { version: string; states: Record<string, string> }) {
  const path = usePathname(), recipe = useResearchRecipe();
  const [comparison] = useResearchState<string[]>("comparison", []);
  const [message, setMessage] = useState("");
  const hasResearch = !!recipe.state || !!recipe.ids.length || filtersActive(recipe.filters) || !!recipe.activeId;
  useEffect(() => {
    if (!hasResearch || recipe.saved) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasResearch, recipe.saved]);
  if (!hasResearch || ["/legal", "/entry", "/accessibility", "/use-with-claude", "/account", "/operator"].some((p) => path.startsWith(p))) return null;
  return <aside className="research-bar no-print" aria-label="Continue your research">
    <div><strong>Continue your research</strong><p>{states[recipe.state] ?? "All states"} · {comparison.length} of 25 comparison tracts · {recipe.saved ? "Saved on this device" : "Not saved on this device"}</p><p className="hint">{filterDescription(recipe.filters)}</p></div>
    <nav className="answer-actions" aria-label="Research next steps"><Link href="/map">Refine on map</Link>{comparison.length > 0 && <Link href="/compare">Compare selected tracts →</Link>}<Link href="/workbench#tab=prepare" onClick={() => window.dispatchEvent(new CustomEvent("research-workspace-tab", { detail: "prepare" }))}>Prepare export →</Link><Link href="/workbench#tab=projects" onClick={() => window.dispatchEvent(new CustomEvent("research-workspace-tab", { detail: "projects" }))}>Open saved research</Link><button type="button" className="link" onClick={() => { try { recipe.save(version); setMessage("Research saved on this device."); } catch (error) { setMessage((error as Error).message); } }}>Save on this device</button></nav>
    <p className="hint">{recipe.ids.length ? `Export scope: ${recipe.ids.length} explicit tracts. Filters do not remove entries from this list.` : "Export scope: matches in the selected geography, subject to download limits."} Unsaved research stays in this tab’s memory. Save before closing or refreshing.</p><span role="status">{message}</span>
  </aside>;
}
