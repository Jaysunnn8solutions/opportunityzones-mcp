import type { Metadata } from "next";
import { PERSONAS } from "@/lib/content/personas";
import { stateSummaries } from "@/lib/data/stateViews";
import GuidedCheck, { type GuideState } from "../ui/GuidedCheck";

export const metadata: Metadata = { title: "Guided check: Opportunity Zones" };

export default function GuidePage() {
  const states: GuideState[] = stateSummaries();
  const personas = PERSONAS.map(({ slug, who, title, ask }) => ({ slug, who, title, ask }));
  return (
    <main className="page">
      <h1>Guided check</h1>
      <p className="lead">
        A few questions, one at a time. At the end you get a checklist: how the rules apply to your situation in general terms,
        what a place looks like, and the questions to take to a tax adviser. Nothing you enter is stored; it stays in this page.
      </p>
      <GuidedCheck personas={personas} states={states} />
      <p className="note">
        General information about the statute and public data about places. Not investment, tax or legal advice.
      </p>
    </main>
  );
}
