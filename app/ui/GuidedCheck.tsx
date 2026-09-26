"use client";

/**
 * The guided check, as a wizard of small steps: each shows one short idea, up
 * to three key facts (each cited to its source), and one thing to do. An
 * outline that stays on screen shows where you are and lets you jump to any
 * step. The step list itself is in lib/guide/steps.ts.
 *
 * It explains how the rules apply in general terms and points to the next
 * tool; it never recommends a place, fund or transaction and never computes a
 * tax outcome (AGENTS.md).
 *
 * Answers survive reading another page: they are kept in this browser tab's
 * sessionStorage (lib/guide/saved.ts), and each step has its own history entry
 * (#step=...), so the browser's Back button moves back a step. Links out open
 * in a new tab, and "quotes" opens a pop-up, so the check stays where it was.
 *
 * Privacy: answers never leave the browser and are gone when the tab closes or
 * "Start over" is pressed. An address goes once to /api/geocode in a POST
 * body; no answer is put in the URL.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { lookupPlace, reportHref } from "@/lib/client/place";
import { legalSource, type RuleId } from "@/lib/content/rules";
import {
  EMPTY_ANSWERS,
  guideSteps,
  resolveStep,
  SECTIONS,
  type Answers,
  type Asset,
  type FundRoute,
  type GainKind,
  type Money,
  type Step,
  type StepId,
} from "@/lib/guide/steps";
import { parseSaved, STORAGE_NAME, stepFromHash } from "@/lib/guide/saved";
import { longDate, NEW_RULES_START, windowEnd } from "@/lib/oz/timing";
import { Cite } from "./Cite";

export interface GuidePersona {
  slug: string;
  who: string;
  title: string;
  ask: string[];
}
export interface GuideState {
  fips: string;
  name: string;
  eligible: number;
  cap: number;
  /** [lon, lat, zoom] that frames the state's tracts on the map, if known. */
  view: [number, number, number] | null;
}

interface Place {
  geoid: string;
  county: string | null;
  state: string | null;
  matched: string | null;
  point: [number, number] | null;
  rural: boolean | null;
  zone2018: number | null;
  designation: { status: string; text: string };
}

interface Line {
  text: string;
  cite?: RuleId[];
}

interface StepBody {
  title: string;
  intro?: React.ReactNode;
  /** Up to three key facts, each cited. */
  facts?: Line[];
  /** The one thing to do on this step. */
  action?: React.ReactNode;
  nextLabel?: string;
}

async function checkPlace(input: string): Promise<Place | "no-match" | "error"> {
  const r = await lookupPlace(input);
  if (typeof r === "string") return r;
  const t = r.profile;
  return {
    geoid: t.geoid,
    county: t.county,
    state: t.state,
    matched: r.matched,
    point: r.point,
    rural: t.rural.treasury,
    zone2018: t.measures.oz2018_population_share?.value ?? null,
    designation: t.designation2027,
  };
}

const noop = () => () => {};

function loadSaved() {
  try {
    return parseSaved<Place>(window.sessionStorage.getItem(STORAGE_NAME));
  } catch {
    return null;
  }
}

/** Rendered only in the browser, where the saved answers and the step in the URL can be read. */
export default function GuidedCheck(props: { personas: GuidePersona[]; states: GuideState[] }) {
  const inBrowser = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  if (!inBrowser) return <div className="wizard-loading" aria-busy="true">Loading the guided check…</div>;
  return <Wizard {...props} />;
}

function Wizard({ personas, states }: { personas: GuidePersona[]; states: GuideState[] }) {
  const [saved] = useState(loadSaved);
  const [answers, setAnswers] = useState<Answers>(saved?.answers ?? EMPTY_ANSWERS);
  const [current, setCurrent] = useState<StepId>(() => stepFromHash(window.location.hash) ?? saved?.current ?? "who");
  const [visited, setVisited] = useState<StepId[]>(saved?.visited ?? ["who"]);
  const [place, setPlace] = useState<Place | null>(saved?.place ?? null);
  const [placeInput, setPlaceInput] = useState(saved?.placeInput ?? "");
  const [placeMsg, setPlaceMsg] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [stateFips, setStateFips] = useState(saved?.stateFips ?? "");
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);

  const steps = guideSteps(answers);
  const step = resolveStep(steps, current, visited);
  const index = steps.indexOf(step);
  const p = personas.find((x) => x.slug === answers.persona) ?? null;
  const st = states.find((s) => s.fips === stateFips) ?? null;
  const end = answers.money === "gain" && answers.saleDate ? windowEnd(answers.saleDate) : null;

  // Move focus to the new step's heading, so keyboard and screen-reader users land on it.
  useEffect(() => {
    if (!moved.current) return;
    heading.current?.focus({ preventScroll: true });
    const top = heading.current?.closest(".wizard")?.getBoundingClientRect().top ?? 0;
    if (top < 0) heading.current?.closest(".wizard")?.scrollIntoView({ block: "start" });
  }, [step.id]);

  // Keep the answers in this tab, so reading another page and coming back loses nothing.
  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_NAME, JSON.stringify({ answers, current, visited, place, placeInput, stateFips }));
    } catch {
      // Storage blocked (private mode, settings): the check still works, it just is not kept.
    }
  }, [answers, current, visited, place, placeInput, stateFips]);

  // The browser's Back and Forward buttons move between steps.
  useEffect(() => {
    if (stepFromHash(window.location.hash) == null) window.history.replaceState(window.history.state, "", `#step=${current}`);
    const onPop = () => {
      const id = stepFromHash(window.location.hash);
      if (id) {
        moved.current = true;
        setCurrent(id);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // Registered once; `current` is only read for the first history entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function go(id: StepId) {
    moved.current = true;
    setCurrent(id);
    setVisited((v) => (v.includes(id) ? v : [...v, id]));
    if (stepFromHash(window.location.hash) !== id) window.history.pushState(window.history.state, "", `#step=${id}`);
  }
  const next = () => index < steps.length - 1 && go(steps[index + 1].id);
  const back = () => index > 0 && go(steps[index - 1].id);
  const set = <K extends keyof Answers>(k: K, v: Answers[K]) => setAnswers((a) => ({ ...a, [k]: v }));

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    setChecking(true);
    setPlaceMsg(null);
    try {
      const r = await checkPlace(placeInput);
      if (r === "no-match") setPlaceMsg("No match. Try the full street address with city, state and ZIP, or an 11-digit tract number.");
      else if (r === "error") setPlaceMsg("The lookup service did not answer. Try again in a moment.");
      else {
        setPlace(r);
        setAnswers((a) => ({ ...a, hasPlace: true }));
        go("place-result");
      }
    } finally {
      setChecking(false);
    }
  }

  function restart() {
    try {
      window.sessionStorage.removeItem(STORAGE_NAME);
    } catch {
      // nothing saved
    }
    setAnswers(EMPTY_ANSWERS);
    setPlace(null);
    setPlaceInput("");
    setPlaceMsg(null);
    setStateFips("");
    setVisited(["who"]);
    go("who");
  }

  const body = renderStep();
  const canNext = !step.required || step.done;

  return (
    <div className="wizard">
      <Outline steps={steps} current={step} visited={visited} onJump={go} />
      <section className="wizard-step" aria-labelledby="wizard-heading">
        <p className="wizard-count">
          Step {index + 1} of {steps.length} · {SECTIONS.find((s) => s.id === step.section)?.title}
        </p>
        <h2 id="wizard-heading" ref={heading} tabIndex={-1}>
          {body.title}
        </h2>
        {body.intro && <p className="wizard-intro">{body.intro}</p>}
        {body.facts && body.facts.length > 0 && (
          <ul className="wizard-facts" aria-label="Key facts">
            {body.facts.map((f) => (
              <CitedLi key={f.text} line={f} />
            ))}
          </ul>
        )}
        {body.action && <div className="wizard-action">{body.action}</div>}
        {step.id !== "checklist" && (
          <div className="guide-nav">
            {index > 0 && (
              <button type="button" className="button secondary" onClick={back}>
                Back
              </button>
            )}
            <button type="button" className="button" disabled={!canNext} onClick={next}>
              {body.nextLabel ?? "Next"}
            </button>
          </div>
        )}
      </section>
    </div>
  );

  function renderStep(): StepBody {
    switch (step.id) {
      case "who":
        return {
          title: "Which describes you best?",
          intro: "This sets the examples and questions you see. Pick the closest.",
          action: (
            <div className="cards">
              {personas.map((x) => (
                <Choice key={x.slug} value={x.slug} current={answers.persona} onPick={(v) => set("persona", v)} title={x.who}>
                  {x.title}
                </Choice>
              ))}
            </div>
          ),
        };

      case "money":
        return {
          title: "Where would the money come from?",
          intro: "The program works with one kind of money: capital gains.",
          action: (
            <div className="cards">
              <Choice<Money> value="gain" current={answers.money} onPick={(v) => set("money", v)} title="A capital gain">
                From selling stock, a business, or real estate held as an investment.
              </Choice>
              <Choice<Money> value="ordinary" current={answers.money} onPick={(v) => set("money", v)} title="Business profit or home sales">
                Operating profit, or profit on homes built or bought to sell.
              </Choice>
              <Choice<Money> value="investors" current={answers.money} onPick={(v) => set("money", v)} title="Investors' money">
                I am raising money for a fund, or a project would receive it.
              </Choice>
              <Choice<Money> value="unsure" current={answers.money} onPick={(v) => set("money", v)} title="Not sure">
                I am not sure what kind of income it is.
              </Choice>
            </div>
          ),
        };

      case "gain-kind": {
        const note: Record<GainKind, Line> = {
          securities: { text: "Your 180 days generally start on the day of the sale.", cite: ["window180"] },
          property: {
            text: "Business property such as a rental can produce a section 1231 gain; the IRS says its 180 days begin on the day the gain is realized. Property held for sale to customers is not a capital asset.",
            cite: ["section1231Timing", "eligibleGains"],
          },
          business: { text: "If the sale produces a capital gain, that gain can qualify. Ordinary income does not.", cite: ["eligibleGains"] },
          passthrough: {
            text: "You can choose when your 180 days start: the last day of the entity's tax year, the entity's own start date, or its tax return due date.",
            cite: ["passThroughTiming"],
          },
          unsure: { text: "A tax adviser can say whether it is a capital gain. It is on your checklist." },
        };
        return {
          title: "What was sold?",
          intro: "Capital gains and qualified section 1231 gains count, from a sale to an unrelated buyer.",
          facts: answers.gainKind ? [note[answers.gainKind]] : [{ text: "Ordinary income does not count.", cite: ["eligibleGains"] }],
          action: (
            <div className="cards">
              <Choice<GainKind> value="securities" current={answers.gainKind} onPick={(v) => set("gainKind", v)} title="Stock, funds or crypto" />
              <Choice<GainKind> value="property" current={answers.gainKind} onPick={(v) => set("gainKind", v)} title="Real estate or business property" />
              <Choice<GainKind> value="business" current={answers.gainKind} onPick={(v) => set("gainKind", v)} title="A business, or a share of one" />
              <Choice<GainKind> value="passthrough" current={answers.gainKind} onPick={(v) => set("gainKind", v)} title="A gain on a K-1">
                From a partnership, S corporation or trust.
              </Choice>
              <Choice<GainKind> value="unsure" current={answers.gainKind} onPick={(v) => set("gainKind", v)} title="Not sure" />
            </div>
          ),
        };
      }

      case "sale-date": {
        const facts: Line[] = [];
        if (end) {
          facts.push({ text: `Your 180 days generally end on ${longDate(end)}.`, cite: ["window180"] });
          facts.push(
            end >= NEW_RULES_START
              ? { text: "That reaches January 1, 2027, so the gain could go in under the new rules, even though the sale was earlier.", cite: ["gain2026Invested2027"] }
              : { text: "That closes before January 1, 2027, so it would go in under the original rules: taxed no later than the 2026 tax year.", cite: ["investedBy2026"] },
          );
          if (answers.gainKind === "passthrough") facts.push({ text: "A K-1 gain can start its 180 days later than the sale.", cite: ["passThroughTiming"] });
        }
        return {
          title: "When was the sale?",
          intro: "The gain generally has to be invested within 180 days, counting the sale date as day 1.",
          facts,
          action: (
            <label className="wizard-field">
              Sale date <span className="hint">(optional; stays on this page)</span>
              <input type="date" value={answers.saleDate} onChange={(e) => set("saleDate", e.target.value)} />
            </label>
          ),
        };
      }

      case "gain-only":
        return {
          title: "Only the gain goes in",
          intro: "You do not need to invest the whole sale price, just the gain. Only that amount gets the benefits.",
          facts: [
            { text: "For example: sold for $120,000 after buying for $100,000, the gain is $20,000, and that is the amount that can go in." },
            { text: "Other money in the same fund is a separate investment without the benefits.", cite: ["gainOnly"] },
          ],
        };

      case "benefits":
        return {
          title: "What the program gives",
          intro:
            end && end < NEW_RULES_START
              ? "These apply to money invested from January 1, 2027. Money invested earlier falls under the original rules."
              : "For money invested from January 1, 2027:",
          action: (
            <div className="wizard-tiles">
              <div>
                <strong>Up to 5 years</strong>
                <span>Tax on the gain is put off until the investment is sold, or five years pass.</span>
                <Cite rules={["deferralFiveYears"]} />
              </div>
              <div>
                <strong>10% or 30%</strong>
                <span>Of the gain is never taxed after five years (30% for a rural fund).</span>
                <Cite rules={["stepUp"]} />
              </div>
              <div>
                <strong>10+ years</strong>
                <span>Held ten years, the growth on the investment can be tax-free.</span>
                <Cite rules={["tenYears"]} />
              </div>
            </div>
          ),
        };

      case "ordinary":
        return {
          title: "Business profit is not a capital gain",
          intro: "Ordinary income is not eligible, so operating profit, or profit on homes built to sell, cannot be deferred this way.",
          facts: [
            { text: "Property held for sale to customers is not a capital asset.", cite: ["eligibleGains"] },
            { text: "The program can still help from the other side: a business or project in a zone can take investment from a fund.", cite: ["zoneBusiness", "equityNotLoan"] },
          ],
          action: <NewTab href="/for/business">How it works for a business looking for a location</NewTab>,
        };

      case "investors":
        return {
          title: "What investors bring",
          intro: "Investors bring capital gains. The fund holds at least 90% of its assets in zone property.",
          facts: [
            { text: "Property bought after December 31, 2026, generally has to be in a 2027 zone.", cite: ["boughtAfterStart"] },
            { text: "A tract that is only eligible is not a zone until Treasury certifies it.", cite: ["designatedNotEligible"] },
          ],
          action: <NewTab href="/for/sponsor">How it works for a fund sponsor</NewTab>,
        };

      case "unsure":
        return {
          title: "Which income counts",
          intro: "Capital gains and qualified section 1231 gains count. Ordinary income does not.",
          facts: [{ text: "Whether your money is a capital gain is a question for a tax adviser. It is on your checklist.", cite: ["eligibleGains"] }],
        };

      case "place":
        return {
          title: "Do you have a place in mind?",
          intro: "Enter an address or an 11-digit tract number. It is looked up once and not stored.",
          action: (
            <>
              <form className="guide-row" onSubmit={lookup}>
                <input
                  value={placeInput}
                  onChange={(e) => setPlaceInput(e.target.value)}
                  placeholder="Street address, city, state ZIP, or tract number"
                  aria-label="Address or tract"
                  autoComplete="off"
                />
                <button type="submit" className="button" disabled={checking || placeInput.trim().length < 5}>
                  {checking ? "Checking..." : "Check"}
                </button>
              </form>
              {placeMsg && <p className="error">{placeMsg}</p>}
            </>
          ),
          nextLabel: answers.hasPlace ? "Next" : "Skip for now",
        };

      case "place-result": {
        if (!place) return { title: "What this place is", intro: "Look up a place first." };
        const facts: Line[] = [{ text: place.designation.text, cite: ["designatedNotEligible"] }];
        if (place.rural) facts.push({ text: "Treasury's 2027 list marks it rural: a 50% improvement bar and, for a rural fund, a 30% step-up.", cite: ["ruralImprovement", "ruralFund"] });
        if (place.zone2018 != null && place.zone2018 >= 0.5)
          facts.push({ text: "It is in a 2018 zone, but property bought there after 2026 generally does not qualify.", cite: ["zones2018End", "boughtAfterStart"] });
        return {
          title: `Tract ${place.geoid}`,
          intro: [place.county, place.state].filter(Boolean).join(", ") + (place.matched ? ` (matched ${place.matched})` : ""),
          facts,
          action: (
            <p className="wizard-links">
              <NewTab className="button secondary" href={reportHref(place.geoid, place.point)}>
                Open the place report
              </NewTab>
              <NewTab href={`/map#t=${place.geoid}`}>See it on the map</NewTab>
            </p>
          ),
        };
      }

      case "state":
        return {
          title: "Look across a state",
          intro: "Each state may designate up to a quarter of its eligible tracts.",
          facts: st
            ? [{ text: `${st.name}: ${st.eligible.toLocaleString("en-US")} eligible tracts; up to ${st.cap.toLocaleString("en-US")} can be designated.`, cite: ["stateCap"] }]
            : undefined,
          action: (
            <>
              <div className="guide-row">
                <select
                  value={stateFips}
                  onChange={(e) => {
                    setStateFips(e.target.value);
                    set("stateChosen", e.target.value !== "");
                  }}
                  aria-label="State"
                >
                  <option value="">Choose a state or territory</option>
                  {states.map((s) => (
                    <option key={s.fips} value={s.fips}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              {st?.view && (
                <p className="wizard-links">
                  <NewTab href={`/map#v=${st.view[0].toFixed(4)},${st.view[1].toFixed(4)},${st.view[2].toFixed(2)}`}>See {st.name}&apos;s tracts on the map</NewTab>
                </p>
              )}
            </>
          ),
          nextLabel: answers.stateChosen ? "Next" : "Skip",
        };

      case "buying":
        return {
          title: "Buying property in a zone",
          intro: "The fund, not you, buys the property.",
          facts: [
            { text: "It buys from an unrelated seller and uses the property in its business.", cite: ["purchaseUnrelated", "businessUse"] },
            { text: "Property bought after December 31, 2026, must be in a 2027 zone.", cite: ["boughtAfterStart"] },
            { text: "Eligible is not designated: Treasury has to certify the tract first.", cite: ["designatedNotEligible"] },
          ],
        };

      case "asset": {
        const note: Record<Asset, Line[]> = {
          new: [{ text: "A new building no one has placed in service is original use: no improvement test.", cite: ["originalUse"] }],
          existing: [
            { text: "Within 30 months, the fund must add more than the building's cost (the land is not counted).", cite: ["substantialImprovement"] },
            { text: "In a zone made up entirely of rural areas, the bar is 50%.", cite: ["ruralImprovement"] },
            { text: "A building vacant long enough can count as original use instead.", cite: ["originalUse"] },
          ],
          land: [{ text: "Unimproved land does not need substantial improvement, unless it is bought expecting no real improvement.", cite: ["land"] }],
          business: [
            { text: "The business needs 70% of its tangible property to qualify and 50% of its income from the zone.", cite: ["zoneBusiness"] },
            { text: "Some businesses are excluded, such as golf courses and liquor stores.", cite: ["excludedBusinesses"] },
          ],
          unsure: [{ text: "The rules differ for new buildings, existing ones, land and businesses. It is on your checklist." }],
        };
        return {
          title: "What would the fund put money into?",
          intro: "The test the property has to pass depends on what it is.",
          facts: answers.asset ? note[answers.asset] : undefined,
          action: (
            <div className="cards">
              <Choice<Asset> value="new" current={answers.asset} onPick={(v) => set("asset", v)} title="New construction" />
              <Choice<Asset> value="existing" current={answers.asset} onPick={(v) => set("asset", v)} title="An existing building" />
              <Choice<Asset> value="land" current={answers.asset} onPick={(v) => set("asset", v)} title="Land" />
              <Choice<Asset> value="business" current={answers.asset} onPick={(v) => set("asset", v)} title="An operating business" />
              <Choice<Asset> value="unsure" current={answers.asset} onPick={(v) => set("asset", v)} title="Not sure" />
            </div>
          ),
        };
      }

      case "fund":
        return {
          title: "How would the fund work?",
          intro: "The gain goes into a Qualified Opportunity Fund, which owns the property or business.",
          facts: [{ text: "A fund is a corporation or partnership for tax purposes, holding 90% of its assets in zone property.", cite: ["fund"] }],
          action: (
            <div className="cards">
              <Choice<FundRoute> value="existing" current={answers.fund} onPick={(v) => set("fund", v)} title="Invest in an existing fund">
                Run by a sponsor; you own an interest in it.
              </Choice>
              <Choice<FundRoute> value="own" current={answers.fund} onPick={(v) => set("fund", v)} title="Set up a fund for a project">
                A partnership or corporation formed for it.
              </Choice>
              <Choice<FundRoute> value="unsure" current={answers.fund} onPick={(v) => set("fund", v)} title="Not sure yet" />
            </div>
          ),
        };

      case "fund-next": {
        const own = answers.fund === "own";
        return {
          title: own ? "Setting up a fund" : "Finding and reviewing a fund",
          intro: own ? "A fund certifies itself to the IRS each year." : "Look for funds, then check where their money actually goes.",
          facts: own
            ? [
                { text: "It files Form 8996 with its return every year.", cite: ["fund"] },
                { text: "It must hold 90% of its assets in zone property, measured twice a year.", cite: ["fund", "fundPenalty"] },
                { text: "Under the 2025 law it also files an annual information return.", cite: ["fundReporting"] },
              ]
            : [{ text: "A fund's properties have to be in designated zones; check each address.", cite: ["designatedNotEligible"] }],
          action: (
            <p className="wizard-links">
              {own ? (
                <NewTab className="button secondary" href={legalSource("irs-certify-qof").url}>
                  IRS: certify and maintain a fund
                </NewTab>
              ) : (
                <NewTab className="button secondary" href="/funds">
                  Where to find funds, and what to ask
                </NewTab>
              )}
              <NewTab href="/check">Check a list of properties</NewTab>
            </p>
          ),
          nextLabel: "See my checklist",
        };
      }

      case "checklist":
        return { title: "Your checklist", action: checklist() };
    }
  }

  function checklist() {
    const items: Line[] = [];
    if (p) items.push({ text: `You: ${p.title}.` });
    if (answers.money === "gain") {
      items.push(
        end
          ? { text: `The 180 days for a sale on ${longDate(Date.parse(`${answers.saleDate}T00:00:00Z`))} generally end ${longDate(end)}.`, cite: ["window180"] }
          : { text: "Note the sale date: the 180 days generally begin on it.", cite: ["window180"] },
      );
      if (end && end < NEW_RULES_START) items.push({ text: "That window closes before 2027: the original rules would apply.", cite: ["investedBy2026"] });
      if (end && end >= NEW_RULES_START) items.push({ text: "That window reaches 2027: money invested from January 1, 2027, falls under the new rules.", cite: ["gain2026Invested2027"] });
      if (answers.gainKind === "passthrough") items.push({ text: "A K-1 gain: choose when its 180 days start.", cite: ["passThroughTiming"] });
    }
    if (answers.money === "ordinary") items.push({ text: "Confirm whether any of the money is a capital gain; ordinary income does not qualify.", cite: ["eligibleGains"] });
    if (place) items.push({ text: `Place: tract ${place.geoid}${place.county ? `, ${place.county}, ${place.state}` : ""}. ${place.designation.text}` });
    else if (st)
      items.push({ text: `State: ${st.name} may designate up to ${st.cap.toLocaleString("en-US")} of ${st.eligible.toLocaleString("en-US")} eligible tracts.`, cite: ["stateCap"] });
    else items.push({ text: "Place: not chosen yet. Use the map or Check properties when you have candidates." });
    if (answers.asset === "existing") items.push({ text: "An existing building: plan for substantial improvement within 30 months.", cite: ["substantialImprovement"] });
    if (answers.asset === "business") items.push({ text: "A business: check the 70% property and 50% income tests.", cite: ["zoneBusiness"] });
    if (answers.fund === "existing") items.push({ text: "Fund: review it with the questions on the Funds page, and check its property addresses." });
    if (answers.fund === "own") items.push({ text: "Fund: a partnership or corporation, certified on Form 8996, 90% in zone property.", cite: ["fund"] });

    const questions = [
      ...(p?.ask ?? []),
      ...(answers.money === "unsure" || answers.money === "ordinary" || answers.gainKind === "unsure"
        ? ["Is any of this money a capital gain that qualifies, and when does its 180-day window start?"]
        : []),
      ...(answers.asset === "unsure" ? ["Which test would the property or business have to meet?"] : []),
      ...(place && place.designation.status === "pending" ? ["What happens to a plan for this tract if it is not designated in 2027?"] : []),
    ];

    const open = steps.filter((s) => s.required && !s.done);
    return (
      <div className="guide-summary">
        {open.length > 0 && (
          <p className="wizard-open">
            Not answered yet:{" "}
            {open.map((s, i) => (
              <span key={s.id}>
                {i > 0 && ", "}
                <button type="button" className="linkish" onClick={() => go(s.id)}>
                  {s.label}
                </button>
              </span>
            ))}
            .
          </p>
        )}
        <ol>
          {items.map((l) => (
            <CitedLi key={l.text} line={l} />
          ))}
        </ol>
        {questions.length > 0 && (
          <>
            <h3>Questions to take to a tax adviser or attorney</h3>
            <ul>
              {[...new Set(questions)].map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </>
        )}
        <p className="guide-actions">
          <button type="button" className="button" onClick={() => window.print()}>
            Print or save as PDF
          </button>
          <button type="button" className="button secondary" onClick={restart}>
            Start over
          </button>
        </p>
        <p className="note">General information, not investment, tax or legal advice. Dates are the general rule; your adviser should confirm them.</p>
      </div>
    );
  }
}

/** The outline: sections and their steps, staying on screen. Any step can be opened. */
function Outline({ steps, current, visited, onJump }: { steps: Step[]; current: Step; visited: StepId[]; onJump: (id: StepId) => void }) {
  const index = steps.indexOf(current);
  const mobile = useRef<HTMLDetailsElement>(null);
  const jump = (id: StepId) => {
    if (mobile.current) mobile.current.open = false;
    onJump(id);
  };
  const list = (
    <ol className="outline-sections">
      {SECTIONS.map((sec) => {
        const own = steps.filter((s) => s.section === sec.id);
        if (own.length === 0) return null;
        return (
          <li key={sec.id} className={sec.id === current.section ? "active" : undefined}>
            <span className="outline-section">{sec.title}</span>
            <ol>
              {own.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => jump(s.id)}
                    aria-current={s.id === current.id ? "step" : undefined}
                    className={s.done || (visited.includes(s.id) && steps.indexOf(s) < index) ? "seen" : undefined}
                  >
                    {s.label}
                  </button>
                </li>
              ))}
            </ol>
          </li>
        );
      })}
    </ol>
  );
  return (
    <nav className="wizard-outline" aria-label="Guided check outline">
      <details className="outline-mobile" ref={mobile}>
        <summary>
          Step {index + 1} of {steps.length}: {current.label}
        </summary>
        {list}
      </details>
      <div className="outline-desktop">
        <div className="outline-progress" aria-hidden="true">
          <span style={{ width: `${Math.round(((index + 1) / steps.length) * 100)}%` }} />
        </div>
        {list}
      </div>
    </nav>
  );
}

function Choice<T extends string>({ value, current, onPick, title, children }: { value: T; current: T | null; onPick: (v: T) => void; title: string; children?: React.ReactNode }) {
  return (
    <button type="button" className="card choice" aria-pressed={current === value} onClick={() => onPick(value)}>
      <strong>{title}</strong>
      {children && <span>{children}</span>}
    </button>
  );
}

function CitedLi({ line }: { line: Line }) {
  return (
    <li>
      {line.text}
      {line.cite && line.cite.length > 0 && (
        <>
          {" "}
          <Cite rules={line.cite} />
        </>
      )}
    </li>
  );
}

/** A link that opens in a new tab, so the guided check stays where it was. */
function NewTab({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  return (
    <a href={href} className={className} target="_blank" rel="noopener noreferrer">
      {children}
      <span className="new-tab-icon" aria-label=" (opens in a new tab)" role="img">
        {" "}
        ↗
      </span>
    </a>
  );
}
