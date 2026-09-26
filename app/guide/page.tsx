import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { PERSONAS } from "@/lib/content/personas";
import { designationRoundByState } from "@/lib/data/tracts";
import GuidedCheck, { type GuideState } from "../ui/GuidedCheck";

export const metadata: Metadata = { title: "Guided check: Opportunity Zones" };

/** Map view centred on each state's tracts, from the boundary index the map already uses. */
function stateViews(): Record<string, [number, number, number]> {
  try {
    const index = JSON.parse(readFileSync(path.join(process.cwd(), "public", "boundaries", "index.json"), "utf8")) as {
      states: Record<string, { bbox: [number, number, number, number] }>;
    };
    const out: Record<string, [number, number, number]> = {};
    for (const [fips, { bbox }] of Object.entries(index.states)) {
      const [w, s, e, n] = bbox;
      const span = Math.max(e - w, n - s);
      out[fips] = [(w + e) / 2, (s + n) / 2, Math.max(4, Math.min(10, Math.log2(700 / span)))];
    }
    return out;
  } catch {
    return {};
  }
}

export default function GuidePage() {
  const views = stateViews();
  const states: GuideState[] = designationRoundByState().map((s) => ({ ...s, view: views[s.fips] ?? null }));
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
