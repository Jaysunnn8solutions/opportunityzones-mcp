import Link from "next/link";
import { stateSummaries } from "@/lib/data/stateViews";
import { designationRoundTotals, loadTractData } from "@/lib/data/tracts";
import { dateLabel } from "@/lib/client/presentation";
import ResearchEntryTabs from "./ui/ResearchEntryTabs";
import OfficialSources from "./ui/OfficialSources";
import RecentResearch from "./ui/RecentResearch";

export const metadata = { title: "Research Hub | Opportunity Zone Research" };

export default function StartPage() {
  const totals = designationRoundTotals();
  const { manifest } = loadTractData();
  return <main className="page start-page">
    <section className="start-hero">
      <p className="eyebrow">Facts · Context · Discovery</p>
      <h1>Opportunity Zone research.<br /><span>A clear place to start.</span></h1>
      <p className="lead">Explore U.S. locations, compare public data, and understand the rules. Choose where your research begins.</p>
    </section>
    <section className="start-paths hub-paths" aria-label="Choose your research path">
      <a className="journey-card" href="#location-research"><span className="eyebrow">01 · Start with an Address</span><h2>Address Lookup</h2><p>Search an address, city, state, or tract to explore zone status, local facts, and source records.</p><span className="text-action">Look up a location ↓</span></a>
      <Link className="journey-card" href="/map#m=map"><span className="eyebrow">02 · Map View</span><h2>View Opportunity Zones</h2><p>Choose a state, narrow the results, and compare places using the same measures.</p><span className="text-action">Explore areas →</span></Link>
      <Link className="journey-card" href="/workbench#tab=list"><span className="eyebrow">03 · Direct Bulk Lookup</span><h2>Provide a Prebuilt Tract List</h2><p>Match public tract identifiers, review exceptions, and prepare fields for your own analysis.</p><span className="text-action">Match a list →</span></Link>
      <Link className="journey-card rules-support-card" href="/guide"><div><h2>Understand the rules</h2><p>Support every research path with clear explanations, published rules, and original sources.</p></div><span className="text-action">Explore rule topics →</span></Link>
    </section>
    <ResearchEntryTabs states={stateSummaries()} />
    <RecentResearch />
    <section className="hub-workbench"><div><p className="eyebrow">Continue your research</p><h2>From a useful search to a repeatable workflow.</h2><p>Save a project on your device, inspect source coverage, compare releases, or prepare documented data for your own analysis.</p></div><Link className="button secondary" href="/workbench">Open research workspace →</Link></section>
    <section className="program-context">
      <div><p className="eyebrow">The 2027 round</p><h2>Eligibility is the starting point.</h2><p>An eligible tract can be considered for designation. Only a certified designation makes it a zone for that round. Each result shows these separately.</p><Link href="/how-it-works#designation">Understand eligible vs designated →</Link></div>
      <div className="context-number"><strong>{totals.eligible.toLocaleString("en-US")}</strong><span>eligible tracts in the published dataset</span><small>Dataset built {dateLabel(manifest.generated)}<br />Underlying sources have their own dates.</small></div>
    </section>
    <OfficialSources />
  </main>;
}
