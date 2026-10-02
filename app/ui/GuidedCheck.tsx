"use client";
import Link from "next/link";
import { useResearchState } from "./ResearchSession";

export default function GuidedCheck() {
  const [, setMode] = useResearchState<"list" | "map" | "split">("explore-mode", "map");
  return <div className="rules-research">
    <section className="research-story" aria-labelledby="research-navigation-heading">
      <h2 id="research-navigation-heading">Continue your research</h2>
      <p>Move between the rules, location research, and comparisons as questions come up.</p>
      <nav className="rules-research-links" aria-label="Research tools">
        <Link href="/"><strong>Research Hub →</strong><span>Look up a location or choose a research pathway.</span></Link>
        <Link href="/map#m=map" onClick={() => setMode("map")}><strong>Find areas →</strong><span>Explore the map and filter places by public data.</span></Link>
        <Link href="/compare"><strong>Compare places →</strong><span>Review the same measures across selected tracts.</span></Link>
        <Link href="/check"><strong>Check multiple properties →</strong><span>Review published zone status for a list of locations.</span></Link>
      </nav>
    </section>
    <section><h2>Explore a rule topic</h2><div className="story-grid">
      <article className="research-topic"><p className="eyebrow">01 · Place rules</p><h3>What establishes zone status?</h3><p>Read eligibility, designation, rural classification, and the distinction between historical and current tract boundaries.</p><Link href="/rules">Open the rules and citations →</Link></article>
      <article className="research-topic"><p className="eyebrow">02 · Statutory mechanics</p><h3>How do timing and holding periods work?</h3><p>Read general explanations and illustrations, with links to the underlying sources.</p><Link href="/how-it-works">Read how the rules work →</Link></article>
      <article className="research-topic"><p className="eyebrow">03 · Fund and business rules</p><h3>What does the statute require?</h3><p>Review the published fund, business, and property requirements and the questions the data cannot resolve.</p><Link href="/rules">Review statutory requirements →</Link></article>
      <article className="research-topic"><p className="eyebrow">04 · Research evidence</p><h3>What do the map layers tell you?</h3><p>Understand the sources, geographic scope, and limitations of each layer before using it in your research.</p><Link href="/map-layers">Read the map layer guide →</Link></article>
    </div></section>
  </div>;
}
