import type { Metadata } from "next";
import GuidedCheck from "../ui/GuidedCheck";
import OfficialSources from "../ui/OfficialSources";

export const metadata: Metadata = { title: "Understand the rules: Opportunity Zones" };

export default function GuidePage() {
  return (
    <main className="page">
      <p className="eyebrow">A little context, when you need it</p>
      <h1>Understand the rules</h1>
      <p className="lead">
        Explore the published rules by topic, follow the original sources, and return to the research tools whenever you need them.
      </p>
      <GuidedCheck />
      <OfficialSources />
      <p className="note">
        General information about the statute and public data about places. Not investment, tax or legal advice.
      </p>
    </main>
  );
}
