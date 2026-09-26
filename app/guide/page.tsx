import type { Metadata } from "next";
import { PERSONA_GROUPS, PERSONAS } from "@/lib/content/personas";
import { stateSummaries } from "@/lib/data/stateViews";
import GuidedCheck, { type GuideState } from "../ui/GuidedCheck";

export const metadata: Metadata = { title: "Guided check: Opportunity Zones" };

export default function GuidePage() {
  const states: GuideState[] = stateSummaries();
  const personas = PERSONAS.map(({ slug, group, who, title, summary, ask }) => ({ slug, group, who, title, summary, ask }));
  return (
    <main className="page">
      <h1>Guided check</h1>
      <p className="lead">
        Small steps, one thing at a time, ending in a checklist to take to a tax adviser. Use the outline to jump around.
        Your answers stay in this browser tab, so you can open other pages and come back; they are cleared when you close
        the tab or start over, and never sent to a server.
      </p>
      <GuidedCheck personas={personas} groups={PERSONA_GROUPS} states={states} />
      <p className="note">
        General information about the statute and public data about places. Not investment, tax or legal advice.
      </p>
    </main>
  );
}
