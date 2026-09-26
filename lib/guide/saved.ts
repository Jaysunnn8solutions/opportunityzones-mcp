/**
 * Keeping the guided check's answers while someone reads another page.
 *
 * Saved in sessionStorage: it stays in this browser tab only, is never sent
 * anywhere, and is gone when the tab closes or "Start over" is pressed. The
 * step also rides in the URL hash (#step=...), so the browser's Back and
 * Forward buttons move between steps. No answer is ever put in the URL.
 */

import { EMPTY_ANSWERS, type Answers, type StepId } from "./steps";

export const STORAGE_NAME = "oz-guided-check-v1";

const STEP_IDS: readonly StepId[] = [
  "who",
  "money",
  "gain-kind",
  "sale-date",
  "gain-only",
  "benefits",
  "ordinary",
  "investors",
  "unsure",
  "place",
  "place-result",
  "state",
  "buying",
  "asset",
  "fund",
  "fund-next",
  "checklist",
];

export function isStepId(v: unknown): v is StepId {
  return typeof v === "string" && (STEP_IDS as readonly string[]).includes(v);
}

/** The step named in a URL hash like "#step=sale-date", if valid. */
export function stepFromHash(hash: string): StepId | null {
  const m = /(?:^#|&)step=([a-z-]+)/.exec(hash);
  return m && isStepId(m[1]) ? m[1] : null;
}

export interface Saved<P> {
  answers: Answers;
  current: StepId;
  visited: StepId[];
  place: P | null;
  placeInput: string;
  stateFips: string;
}

/** Read what was saved, keeping only well-formed fields; null if nothing usable. */
export function parseSaved<P>(raw: string | null): Saved<P> | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const a = (o.answers && typeof o.answers === "object" ? o.answers : {}) as Record<string, unknown>;
  const str = (x: unknown) => (typeof x === "string" ? x : null);
  const oneOf = <T extends string>(x: unknown, allowed: readonly T[]): T | null => (typeof x === "string" && (allowed as readonly string[]).includes(x) ? (x as T) : null);
  const answers: Answers = {
    ...EMPTY_ANSWERS,
    persona: str(a.persona),
    money: oneOf(a.money, ["gain", "ordinary", "investors", "unsure"] as const),
    gainKind: oneOf(a.gainKind, ["securities", "property", "business", "passthrough", "unsure"] as const),
    saleDate: /^\d{4}-\d{2}-\d{2}$/.test(str(a.saleDate) ?? "") ? (a.saleDate as string) : "",
    hasPlace: a.hasPlace === true,
    stateChosen: a.stateChosen === true,
    asset: oneOf(a.asset, ["new", "existing", "land", "business", "unsure"] as const),
    fund: oneOf(a.fund, ["existing", "own", "unsure"] as const),
  };
  const visited = Array.isArray(o.visited) ? o.visited.filter(isStepId) : [];
  return {
    answers,
    current: isStepId(o.current) ? o.current : "who",
    visited: visited.length ? visited : ["who"],
    place: o.place && typeof o.place === "object" ? (o.place as P) : null,
    placeInput: str(o.placeInput) ?? "",
    stateFips: str(o.stateFips) ?? "",
  };
}
