import { DISCLAIMER_SECTIONS, TERMS_SECTIONS, PRIVACY_SECTIONS, TERMS_DATE, TERMS_VERSION, LEGAL_OPERATOR, operatorDetailsComplete } from "@/lib/content/siteTerms";
import { INDEPENDENCE_NOTICE, OFFICIAL_SOURCES } from "@/lib/content/officialSources";

export default function LegalDocument({ compact = false }: { compact?: boolean }) {
  const prefix = compact ? "entry-" : "";
  return <div className="legal-document">
    <p className="legal-version">Version {TERMS_VERSION} · Updated {TERMS_DATE}</p>
    {operatorDetailsComplete && <div className="legal-operator"><strong>Service operator</strong><p>{LEGAL_OPERATOR.legalName} · {LEGAL_OPERATOR.location}</p><a href={`mailto:${LEGAL_OPERATOR.contactEmail}`}>{LEGAL_OPERATOR.contactEmail}</a></div>}
    <h2 id={`${prefix}disclaimer`}>Full disclaimer</h2>
    <p>{INDEPENDENCE_NOTICE} <a href={OFFICIAL_SOURCES[0].url}>Read official Treasury Opportunity Zone information.</a></p>
    {DISCLAIMER_SECTIONS.map((s) => <section key={s.id} id={`${prefix}${s.id}`}><h3>{s.title}</h3>{s.paragraphs.map((p) => <p key={p}>{p}</p>)}</section>)}
    <h2 id={`${prefix}terms`}>Terms of Use</h2>
    {TERMS_SECTIONS.map((s) => <section key={s.id} id={`${prefix}${s.id}`}><h3>{s.title}</h3>{s.paragraphs.map((p) => <p key={p}>{p}</p>)}</section>)}
    {PRIVACY_SECTIONS.map((s) => <section key={s.id} id={`${prefix}${s.id}`}><h2>{s.title}</h2>{s.paragraphs.map((p) => <p key={p}>{p}</p>)}</section>)}
  </div>;
}
