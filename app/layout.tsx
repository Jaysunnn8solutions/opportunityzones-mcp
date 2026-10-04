import type { Metadata } from "next";
import Link from "next/link";
import { versionLabel } from "@/lib/version";
import { ResearchSession } from "./ui/ResearchSession";
import SiteNavigation from "./ui/SiteNavigation";
import LegalAccess from "./ui/LegalAccess";
import { RulePopupProvider } from "./ui/RulePopup";
import { INDEPENDENCE_NOTICE, OFFICIAL_SOURCES } from "@/lib/content/officialSources";
import { RELIANCE_NOTICE } from "@/lib/content/siteTerms";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import { AccountAccess, AccountButton } from "./ui/AccountAccess";
import ResearchTrail from "./ui/ResearchTrail";
import AccessibilitySupport from "./ui/AccessibilitySupport";
import ConnectionNotice from "./ui/ConnectionNotice";
import ResearchBar from "./ui/ResearchBar";
import { loadTractData } from "@/lib/data/tracts";

export const metadata: Metadata = {
  title: "Opportunity Zone Research",
  description:
    "Understand the 2027 Opportunity Zone rules, screen U.S. census tracts, and check where a fund's properties sit. Informational only, not investment, tax or legal advice.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const { manifest, lookups } = loadTractData();
  return (
    <html lang="en-US">
      <body>
        <AccessibilitySupport />
        <ResearchSession>
        <a className="skip-link" href="#main-content">Skip to content</a>
        <div className="disclaimer" role="note">
          <span>Informational only, not investment, tax or legal advice.</span>
          <span>Independent site · Not affiliated with U.S. Treasury.</span>
          <a href={OFFICIAL_SOURCES[0].url}>Official Treasury information ↗</a>
          <Link href="/legal">Terms & disclaimer</Link>
          <Link href="/accessibility">Accessibility</Link>
        </div>
        <LegalAccess>
        <AccountAccess>
        <ConnectionNotice />
        <header className="site-header">
          <div className="site-brand">
            <Link href="/">
              <svg className="logo-mark" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="2" y="2" width="20" height="20" rx="5" fill="var(--accent)" />
                <path d="m5 7 5-2 4 2 5-2v12l-5 2-4-2-5 2Zm5-2v12m4-10v12" stroke="var(--accent-ink)" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Opportunity Zone Research<small>Independent information &amp; place research</small></span>
            </Link>
          </div>
          <SiteNavigation />
          <AccountButton />
        </header>
        <RulePopupProvider><div id="main-content" tabIndex={-1}><ResearchTrail />{children}<ResearchBar version={manifest.generated} states={lookups.states} /></div></RulePopupProvider>
        <footer className="site-footer">
          <p className="footer-independence">{INDEPENDENCE_NOTICE}</p>
          <p className="footer-reliance">{RELIANCE_NOTICE}</p>
          <nav className="resource-links" aria-label="Official government sources">{OFFICIAL_SOURCES.map((source) => <a key={source.url} href={source.url}>{source.name} · official information ↗</a>)}</nav>
          <nav aria-label="Resources" className="resource-links"><Link href="/status">Service status</Link><Link href="/help">Help & data corrections</Link><Link href="/check">Check multiple properties</Link><Link href="/how-it-works">Program overview</Link><Link href="/rules">Rules & sources</Link><Link href="/funds">Fund research checklist</Link><Link href="/2018-zones">2018 zone research</Link><Link href="/use-with-claude">Research through chat / MCP</Link><Link href="/accessibility">Accessibility</Link><Link href="/legal">Disclaimer, terms & privacy</Link></nav>
          Basemap: OpenFreeMap, © OpenStreetMap contributors, or USGS The National Map. Boundaries: U.S. Census Bureau. Data: U.S.
          Treasury, Census Bureau, HUD, CDFI Fund, CFPB/FFIEC, EPA, FHWA, FEMA, USGS, USDA Forest Service, BLS, NCES, CMS; see each
          tract page for sources and vintages. Research stays in browser memory unless you explicitly save a project on this device. Saved projects include local notes and can be removed in the workbench.
          Addresses are sent to the Census Geocoder for lookup and are not stored or logged by this app.
          Optional passkey accounts retain credentials and usage allowances; prepared public-data exports expire after one hour. <Link href="/legal#privacy">Privacy details</Link>.
          <span className="version"> Version {versionLabel()}.</span>
        </footer>
        </AccountAccess>
        </LegalAccess>
        </ResearchSession>
      </body>
    </html>
  );
}
