"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CONSENT_UNAVAILABLE, entryReturnDestination, isPublicLegalPage } from "@/lib/client/termsConsent";
import { RELIANCE_NOTICE, TERMS_VERSION } from "@/lib/content/siteTerms";
import LegalDocument from "./LegalDocument";
import EntryAtmosphere from "./EntryAtmosphere";
import { INDEPENDENCE_NOTICE, OFFICIAL_SOURCES } from "@/lib/content/officialSources";

export default function LegalAccess({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const agreementPage = path === "/entry/agreement";
  const entryPage = path === "/entry" || agreementPage;
  const [status, setStatus] = useState<"checking" | "required" | "saving" | "accepted" | "unavailable">("checking");
  const [availabilityCheck, setAvailabilityCheck] = useState(0);
  const [acknowledged, setAcknowledged] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (isPublicLegalPage(path)) return;
    const controller = new AbortController();
    fetch("/api/consent", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error(CONSENT_UNAVAILABLE);
      const result = await response.json();
      if (result.accepted === true && result.version === TERMS_VERSION) {
        if (entryPage) window.location.replace(entryReturnDestination(new URLSearchParams(window.location.search).get("next"), window.location.hash));
        else setStatus("accepted");
      } else setStatus("required");
    }).catch(() => { if (!controller.signal.aborted) { setError(CONSENT_UNAVAILABLE); setStatus("unavailable"); } });
    return () => controller.abort();
  }, [path, entryPage, availabilityCheck]);
  if (isPublicLegalPage(path) || (status === "accepted" && !entryPage)) return children;
  async function accept() {
    if (!acknowledged || declined || status !== "required") return;
    setStatus("saving"); setError("");
    try {
      const response = await fetch("/api/consent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accepted: true, version: TERMS_VERSION, channel: "web" }) });
      if (response.status >= 500) { setError(CONSENT_UNAVAILABLE); setStatus("unavailable"); return; }
      const result = await response.json();
      if (!response.ok || result.accepted !== true) throw new Error(result.error ?? "Acceptance could not be recorded. Please try again.");
      window.location.assign(entryReturnDestination(entryPage ? new URLSearchParams(window.location.search).get("next") : path, window.location.hash));
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Acceptance could not be recorded. Please try again."); setStatus("required"); }
  }
  const AgreementHeading = agreementPage ? "h1" : "h2";
  return <main className={`entry-screen${agreementPage ? " entry-agreement-page" : ""}`} id="main-content" tabIndex={-1}>
    {!agreementPage && <EntryAtmosphere />}
    <div className="entry-content">
    <div className="entry-brand">Curated Data. Meaningful Opportunities.</div>
    <div className="entry-layout">{agreementPage ? <a className="entry-back-link" href="/entry">← Back to introduction</a> : <section className="entry-introduction"><p className="eyebrow">Facts · Context · Discovery</p><h1>Opportunity Zone Research</h1><a className="entry-start-link" href="/entry/agreement?next=%2F" aria-describedby="entry-start-help">Start with a place →</a><p id="entry-start-help" className="entry-start-help">Review and accept the terms on the next page, then enter the Research Hub.</p><p className="lead">Connect geography, public data, and the rules behind Opportunity Zones. Bring your questions. Build your own understanding.</p><ol className="entry-value"><li><span>01</span> Research a location</li><li><span>02</span> Find areas by your criteria</li><li><span>03</span> Read the rules and sources</li></ol><p className="entry-source-note">Preview data: U.S. Census Bureau, 2020–2024 ACS. <a href="https://api.census.gov/data/2024/acs/acs5/variables/B01003_001E.json">Population</a> · <a href="https://api.census.gov/data/2024/acs/acs5/variables/B19013_001E.json">Household income</a>. Estimates; income in 2024 dollars. Lights illustrate population, not satellite observations.</p><p className="entry-boundary">Informational only, not investment, tax or legal advice. Results describe places and do not recommend investments.</p></section>}
    <section className="entry-agreement" aria-labelledby="entry-agreement-title"><p className="eyebrow">Before you enter</p><AgreementHeading id="entry-agreement-title">Review and acknowledge</AgreementHeading>
      <details className="entry-full-terms"><summary>Read the full disclaimer, terms, and privacy notice</summary><div className="entry-terms-scroll" tabIndex={0} role="region" aria-label="Full disclaimer, terms, and privacy notice"><LegalDocument compact /></div></details>
      {declined ? <div className="entry-declined" role="status"><h3>You have not accepted the terms.</h3><p>The research tools remain closed. You can read the legal page, reconsider, or close this tab.</p><button type="button" className="button secondary" onClick={() => { setDeclined(false); setAcknowledged(false); }}>Review again</button></div> : <form className="entry-consent" onSubmit={(event) => { event.preventDefault(); accept(); }}><label className="consent-checkbox"><input type="checkbox" checked={acknowledged} disabled={status === "saving"} onChange={(event) => setAcknowledged(event.target.checked)} required /><span>I have read and agree to the <Link href="/legal#terms">Terms of Use</Link> and acknowledge the <Link href="/legal#disclaimer">Disclaimer</Link> and <Link href="/legal#privacy">Privacy Notice</Link> (version {TERMS_VERSION}).</span></label><p className="consent-action-notice">Clicking “I agree and enter” records your acceptance.</p><div className="entry-actions"><button type="submit" className="button" disabled={!acknowledged || status !== "required"}>{status === "saving" ? "Recording acceptance…" : "I agree and enter"}</button><button type="button" className="button secondary" disabled={status === "saving"} onClick={() => { setDeclined(true); setAcknowledged(false); }}>I do not agree</button></div></form>}
      {status === "checking" && <p role="status">Checking whether agreement acceptance is available…</p>}
      {error && <p role="alert" className="error">{error}</p>}
      {status === "unavailable" && <button type="button" className="button secondary" onClick={() => { setStatus("checking"); setError(""); setAvailabilityCheck((value) => value + 1); }}>Check availability again</button>}
      <p>Use this service for initial research. Verify current source records and consult qualified professionals before relying on information for a decision.</p><ul className="entry-summary"><li>Eligibility is different from certified designation.</li><li>Data may be incomplete, delayed, or approximate.</li><li>Using the service creates no professional advisory relationship.</li></ul>
      <p className="source-reliance">{RELIANCE_NOTICE}</p>
      <Link className="legal-page-link" href="/legal">Open the dedicated legal page →</Link>

      <p className="hint">Acceptance is recorded with its time and terms version. A secure browser receipt lasts up to seven days. No account or personal financial information is required.</p>
      <noscript><p>JavaScript is required to acknowledge the terms and use the research tools. You can still read the <a href="/legal">legal page</a>.</p></noscript>
    </section></div>
    <footer className="entry-footer"><p className="entry-independence">{INDEPENDENCE_NOTICE} <a href={OFFICIAL_SOURCES[0].url}>Official Treasury information ↗</a></p></footer>
    </div>
  </main>;
}
