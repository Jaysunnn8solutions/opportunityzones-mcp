"use client";
import Link from "next/link";
import type { PlaceProfile } from "@/lib/client/place";
import { FOCUSES, placeNarrative, sourceFor, type Focus } from "@/lib/research/measures";
import { useResearchState } from "./ResearchSession";
import { ResearchControls } from "./ResearchControls";
import ResearchEvidence from "./ResearchEvidence";

export default function PlaceNarrative({ profile }: { profile: PlaceProfile }) {
  const [focus] = useResearchState<Focus>("research-focus", "overview");
  const narrative = placeNarrative(profile, focus);
  return <section className="research-story"><div className="section-heading"><div><p className="eyebrow">The two-minute overview</p><h2>Understand this place</h2></div></div><ResearchControls /><p className="lead">{FOCUSES[focus].question}</p><div className="story-grid"><div><h3>What the data says</h3><p>{narrative.status}</p><ul className="story-facts">{narrative.facts.map((fact) => { const source = sourceFor(profile, fact.key); return <li key={fact.key}><strong>{fact.text}</strong><small>{fact.period} · census tract{source && <> · <a href={source.url} target="_blank" rel="noopener noreferrer">{source.publisher}</a></>}</small></li>; })}</ul></div><div><h3>What remains to be checked</h3><ul>{narrative.unknowns.map((text) => <li key={text}>{text}</li>)}</ul><Link href="/guide">Read the rules and their sources →</Link></div></div><details className="story-evidence"><summary>How this place meets your criteria</summary><ResearchEvidence geoid={profile.geoid} /></details></section>;
}
