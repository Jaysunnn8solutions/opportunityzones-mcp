"use client";
import Link from "next/link";
import { useState } from "react";
import { parseResearchFile } from "@/lib/research/file";
import { comparisonLimit } from "@/lib/research/comparisonLimits";
import type { Focus } from "@/lib/research/measures";
import type { Specification } from "@/lib/research/workbench";
import { useAccount } from "./AccountAccess";
import { useResearchState } from "./ResearchSession";
import { useResearchRecipe } from "./useResearchRecipe";
import ExportResearch from "./ExportResearch";

export default function ResearchFiles({ onImport }: { onImport: (spec: Specification) => void }) {
  const recipe = useResearchRecipe();
  const { account } = useAccount();
  const [focus, setFocus] = useResearchState<Focus>("research-focus", "overview");
  const [, setComparison] = useResearchState<string[]>("comparison", []);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function read(file?: File) {
    if (!file) return;
    setError(""); setMessage("");
    try {
      if (file.size > 64_000) throw new Error("This research file exceeds 64 KB.");
      const saved = parseResearchFile(await file.text());
      onImport({ version: 1, state: saved.state, filters: saved.filters, sort: "geoid", geoids: saved.geoids, columns: saved.measures, format: "zip" });
      setFocus(saved.focus);
      setMessage(`${saved.geoids.length} tract selections loaded into this workspace. Facts will use the current published dataset. Choose View comparison to replace your comparison selection.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The file could not be read. Current selections have not changed."); }
  }
  return <section className="lab-card"><h2>Research files & tract selections</h2>
    <p>Reopen a previously saved research JSON file, or save your current tract selections and criteria. Files are read in your browser. Names, notes, addresses, and account details are excluded.</p>
    <label className="research-file-input">Reopen research file<input type="file" accept=".json,application/json" onChange={(event) => { void read(event.target.files?.[0]); event.target.value = ""; }} /></label>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <p><strong>{recipe.ids.length} tracts in the current workspace selection</strong></p>
    <div className="selection-chips">{recipe.ids.map((id) => <button type="button" className="button secondary" key={id} aria-label={`Remove workspace tract ${id}`} onClick={() => recipe.setIds(recipe.ids.filter((value) => value !== id))}>{id} ×</button>)}</div>
    <div className="answer-actions"><ExportResearch disabled={!recipe.ids.length || recipe.ids.length > 25} input={{ research: { format: "opportunity-zone-research", version: 1, savedAt: "", geoids: recipe.ids, state: recipe.state, filters: recipe.filters, focus, measures: recipe.keys } }} label="Save research file" />
    {recipe.ids.length > 0 && recipe.ids.length <= comparisonLimit(account.member) && <Link className="button secondary" href="/compare" onClick={() => setComparison(recipe.ids)}>View comparison →</Link>}
    <Link href="/workbench#tab=list">Import a CSV or text tract list →</Link></div>
    {recipe.ids.length > comparisonLimit(account.member) && <p>Comparison supports {comparisonLimit(account.member)} tracts with your current access. Remove selections here{!account.member ? " or sign in for up to 25" : ""} to compare. Research selection files support up to 25 tracts.</p>}
  </section>;
}
