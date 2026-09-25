import type { Metadata } from "next";
import Link from "next/link";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Opportunity Zone screening",
  description:
    "Screen U.S. census tracts against the 2027 Opportunity Zone rules and the public data around them. Informational only, not investment, tax or legal advice.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="disclaimer" role="note">
          <strong>Informational only, not investment, tax or legal advice.</strong> This tool describes places. It does not
          recommend any tract, fund or transaction. Eligibility is not designation: the 2027 designations are not yet published.
        </div>
        <header className="site-header">
          <h1>
            <Link href="/">Opportunity Zone screening</Link>
          </h1>
          <span className="hint">2027 eligibility, rural status, 2018 zones and incentives, by census tract</span>
        </header>
        {children}
        <footer className="site-footer">
          Boundaries, roads, water and labels: U.S. Census Bureau TIGERweb. Data: U.S. Treasury, Census Bureau, HUD, CDFI Fund,
          CFPB/FFIEC, EPA, FHWA, FEMA, BLS, NCES, CMS; see each tract page for sources and vintages. Nothing you search is stored.
        </footer>
      </body>
    </html>
  );
}
