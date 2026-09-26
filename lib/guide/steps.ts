/**
 * The guided check's steps: small pieces, one action each. Which steps appear
 * depends on the answers so far (a capital gain gets timing steps; business
 * profit gets a step on the other side of the program). Pure, so it is tested
 * without a browser.
 */

export type Money = "gain" | "ordinary" | "investors" | "unsure";
export type GainKind = "securities" | "property" | "business" | "passthrough" | "unsure";
export type Asset = "new" | "existing" | "land" | "business" | "unsure";
export type FundRoute = "existing" | "own" | "unsure";

export interface Answers {
  persona: string | null;
  money: Money | null;
  gainKind: GainKind | null;
  saleDate: string;
  hasPlace: boolean;
  stateChosen: boolean;
  asset: Asset | null;
  fund: FundRoute | null;
}

export const EMPTY_ANSWERS: Answers = {
  persona: null,
  money: null,
  gainKind: null,
  saleDate: "",
  hasPlace: false,
  stateChosen: false,
  asset: null,
  fund: null,
};

export type SectionId = "you" | "money" | "place" | "fund" | "done";

export const SECTIONS: Array<{ id: SectionId; title: string }> = [
  { id: "you", title: "You" },
  { id: "money", title: "The money" },
  { id: "place", title: "The place" },
  { id: "fund", title: "The fund" },
  { id: "done", title: "Your checklist" },
];

export type StepId =
  | "who"
  | "money"
  | "gain-kind"
  | "sale-date"
  | "gain-only"
  | "benefits"
  | "ordinary"
  | "investors"
  | "unsure"
  | "place"
  | "place-result"
  | "state"
  | "buying"
  | "asset"
  | "fund"
  | "fund-next"
  | "checklist";

export interface Step {
  id: StepId;
  section: SectionId;
  /** Short label for the outline. */
  label: string;
  /** Whether the step's action has been taken (for the outline's tick). */
  done: boolean;
  /** Whether Next needs an answer first. */
  required: boolean;
}

export function guideSteps(a: Answers): Step[] {
  const steps: Step[] = [{ id: "who", section: "you", label: "Who you are", done: a.persona != null, required: true }];

  steps.push({ id: "money", section: "money", label: "Where the money comes from", done: a.money != null, required: true });
  if (a.money === "gain") {
    steps.push(
      { id: "gain-kind", section: "money", label: "What was sold", done: a.gainKind != null, required: false },
      { id: "sale-date", section: "money", label: "The 180 days", done: a.saleDate !== "", required: false },
      { id: "gain-only", section: "money", label: "Only the gain", done: false, required: false },
      { id: "benefits", section: "money", label: "The three benefits", done: false, required: false },
    );
  } else if (a.money === "ordinary") {
    steps.push({ id: "ordinary", section: "money", label: "Profit is not a gain", done: false, required: false });
  } else if (a.money === "investors") {
    steps.push({ id: "investors", section: "money", label: "What investors bring", done: false, required: false });
  } else if (a.money === "unsure") {
    steps.push({ id: "unsure", section: "money", label: "Which income counts", done: false, required: false });
  }

  steps.push({ id: "place", section: "place", label: "Find a place", done: a.hasPlace, required: false });
  if (a.hasPlace) steps.push({ id: "place-result", section: "place", label: "What the place is", done: false, required: false });
  steps.push(
    { id: "state", section: "place", label: "Look across a state", done: a.stateChosen, required: false },
    { id: "buying", section: "place", label: "Buying in a zone", done: false, required: false },
    { id: "asset", section: "place", label: "New, existing or a business", done: a.asset != null, required: false },
  );

  steps.push(
    { id: "fund", section: "fund", label: "How the fund works", done: a.fund != null, required: false },
    { id: "fund-next", section: "fund", label: "Next with a fund", done: false, required: false },
  );

  steps.push({ id: "checklist", section: "done", label: "Your checklist", done: false, required: false });
  return steps;
}

/** The step to show: the one asked for if it still exists, else the nearest earlier one still in the list. */
export function resolveStep(steps: Step[], id: StepId, previous: StepId[] = []): Step {
  const hit = steps.find((s) => s.id === id);
  if (hit) return hit;
  for (let i = previous.length - 1; i >= 0; i--) {
    const back = steps.find((s) => s.id === previous[i]);
    if (back) return back;
  }
  return steps[0];
}
