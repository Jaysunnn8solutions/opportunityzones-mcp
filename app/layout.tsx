import type { Metadata } from "next";
import Link from "next/link";
import { designationNote } from "@/lib/data/tracts";
import { versionLabel } from "@/lib/version";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Opportunity Zone screening",
  description:
    "Understand the 2027 Opportunity Zone rules, screen U.S. census tracts, and check where a fund's properties sit. Informational only, not investment, tax or legal advice.",
};

const NAV: Array<[string, string]> = [
  ["/", "Start"],
  ["/guide", "Guided check"],
  ["/how-it-works", "How it works"],
  ["/map", "Map"],
  ["/funds", "Funds"],
  ["/check", "Check properties"],
  ["/use-with-claude", "Use with Claude"],
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="disclaimer" role="note">
          <strong>Informational only, not investment, tax or legal advice.</strong> This tool describes places and explains the
          rules in general terms. It does not recommend any tract, fund or transaction. Eligibility is not designation.{" "}
          {designationNote()}
        </div>
        <header className="site-header">
          <h1>
            <Link href="/">
              <svg className="logo-mark" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="2" y="2" width="20" height="20" rx="5" fill="var(--accent)" />
                <path d="M6 16 L10 11 L13 14 L18 7" stroke="var(--accent-ink)" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Opportunity Zone screening
            </Link>
          </h1>
          <nav aria-label="Main">
            {NAV.map(([href, label]) => (
              <Link key={href} href={href}>
                {label}
              </Link>
            ))}
          </nav>
        </header>
        {children}
        <footer className="site-footer">
          Basemap: OpenFreeMap, © OpenStreetMap contributors, or USGS The National Map. Boundaries: U.S. Census Bureau. Data: U.S.
          Treasury, Census Bureau, HUD, CDFI Fund, CFPB/FFIEC, EPA, FHWA, FEMA, USGS, USDA Forest Service, BLS, NCES, CMS; see each
          tract page for sources and vintages. Nothing you search is stored.
          <span className="version"> Version {versionLabel()}.</span>
        </footer>
      </body>
    </html>
  );
}
