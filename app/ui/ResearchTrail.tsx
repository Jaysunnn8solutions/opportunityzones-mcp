"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useResearchState } from "./ResearchSession";
import { useEffect } from "react";
export default function ResearchTrail() {
  const path = usePathname(); const [selected] = useResearchState<string[]>("comparison", []);
  const [last, setLast] = useResearchState("research-return-path", "/");
  useEffect(() => { if (/^\/(map|compare|brief|check|workbench)(\/|$)/.test(path) || /^\/tract\/\d{11}$/.test(path)) setLast(path); }, [path, setLast]);
  if (path === "/" || path === "/legal" || path === "/entry") return null;
  const rules = ["/guide", "/rules", "/how-it-works", "/funds", "/2018-zones"].includes(path);
  return <nav className="research-trail no-print" aria-label="Research workflow"><Link href="/">Research Hub</Link><span aria-hidden="true">›</span>{rules ? <><span aria-current="page">Understand the rules</span><Link href={last}>Return to your research →</Link></> : <><Link href="/map#m=map" aria-current={path === "/map" ? "page" : undefined}>Find areas</Link><span aria-hidden="true">›</span>{path.startsWith("/tract/") && <><span aria-current="page">Place report</span><span aria-hidden="true">›</span></>}<Link href="/compare" aria-current={path === "/compare" ? "page" : undefined}>Compare{selected.length ? ` (${selected.length})` : ""}</Link><span aria-hidden="true">›</span><Link href="/workbench" aria-current={path.startsWith("/workbench") ? "page" : undefined}>Research workspace</Link></>}</nav>;
}
