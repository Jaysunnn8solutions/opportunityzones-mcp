import type { Metadata } from "next";
import Link from "next/link";
import PropertyChecker from "../ui/PropertyChecker";

export const metadata: Metadata = { title: "Check where properties sit" };

export default function CheckPage() {
  return (
    <main className="page">
      <h1>Check where properties sit</h1>
      <p className="lead">
        Paste a list of property addresses, for example from a fund&apos;s offering materials, or 11-digit census tract numbers,
        one per line. Each is matched to its census tract and shown with its Opportunity Zone status.
      </p>
      <PropertyChecker />
      <p className="note">
        Your list stays in browser memory as you navigate and clears on reload. Addresses are sent in request bodies to the
        U.S. Census Geocoder and are not stored or logged by this app. Results describe places, not investments. See <Link href="/funds">Funds</Link> for what else
        to ask a fund. Informational only, not investment, tax or legal advice.
      </p>
    </main>
  );
}
