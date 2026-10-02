"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useResearchState } from "./ResearchSession";

export default function SiteNavigation() {
  const path = usePathname();
  const [selected] = useResearchState<string[]>("comparison", []);
  const [, setMode] = useResearchState<"list" | "map" | "split">("explore-mode", "map");
  const links = [["/", "Research Hub"], ["/map#m=map", "Find areas"], ["/guide", "Understand the rules"], ["/compare", `Compare${selected.length ? ` (${selected.length})` : ""}`], ["/workbench", "Research workspace"]];
  return <nav aria-label="Main" className="task-navigation">{links.map(([href, label]) => <Link key={href} href={href} onClick={() => { if (href.startsWith("/map")) setMode("map"); }} aria-current={path === href.split("#")[0] ? "page" : undefined}>{label}</Link>)}</nav>;
}
