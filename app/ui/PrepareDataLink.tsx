"use client";
import Link from "next/link";
import { useResearchRecipe } from "./useResearchRecipe";
export default function PrepareDataLink({ geoids, children = "Prepare data for these results" }: { geoids: string[]; children?: React.ReactNode }) {
  const { setIds } = useResearchRecipe();
  return <Link className="button secondary" href="/workbench#tab=prepare" onClick={() => { setIds(geoids); window.dispatchEvent(new CustomEvent("research-workspace-tab", { detail: "prepare" })); }}>{children} →</Link>;
}
