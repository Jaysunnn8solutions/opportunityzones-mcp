import { INDEPENDENCE_NOTICE, OFFICIAL_SOURCES } from "@/lib/content/officialSources";
import { RELIANCE_NOTICE } from "@/lib/content/siteTerms";

export default function OfficialSources() {
  return <section className="official-sources" aria-label="Independent research and official government sources">
    <div className="official-sources-intro"><p className="eyebrow">Independent research · Official references</p><h2>Go directly to the source.</h2><p>{INDEPENDENCE_NOTICE}</p></div>
    <nav aria-label="Official Opportunity Zone information" className="official-source-links">
      {OFFICIAL_SOURCES.map((source) => <a key={source.url} href={source.url}><strong>{source.name} <span aria-hidden="true">↗</span></strong><span>{source.description}</span><small>{source.domain}</small></a>)}
    </nav>
    <p className="source-reliance">{RELIANCE_NOTICE}</p>
  </section>;
}
