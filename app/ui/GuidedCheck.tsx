"use client";

/**
 * The guided check: who you are, where the money comes from, the place, the
 * fund, then a checklist. It explains how the rules apply in general terms and
 * points to the next tool; it never recommends a place, fund or transaction
 * and never computes a tax outcome (AGENTS.md).
 *
 * Privacy: answers live only in this component's state. An address goes once
 * to /api/geocode in a POST body; nothing is put in the URL or stored.
 */

import Link from "next/link";
import { useState } from "react";
import { lookupPlace, reportHref } from "@/lib/client/place";
import type { RuleId } from "@/lib/content/rules";
import { Cite } from "./Cite";
import { longDate, NEW_RULES_START, windowEnd } from "@/lib/oz/timing";

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

type Money = "gain" | "ordinary" | "investors" | "unsure";
type FundRoute = "existing" | "own" | "unsure";

interface Place {
  geoid: string;
  county: string | null;
  state: string | null;
  matched: string | null;
  point: [number, number] | null;
  eligible: number | null;
  rural: boolean | null;
  zone2018: number | null;
  designation: { status: string; text: string };
}

const STEPS = ["You", "The money", "The place", "The fund", "Your checklist"] as const;
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
    eligible: t.measures.eligible_2027?.value ?? null,
    rural: t.rural.treasury,
    zone2018: t.measures.oz2018_population_share?.value ?? null,
    designation: t.designation2027,
  };
}

function Choice<T extends string>({ value, current, onPick, title, children }: { value: T; current: T | null; onPick: (v: T) => void; title: string; children?: React.ReactNode }) {
  return (
    <button type="button" className="card choice" aria-pressed={current === value} onClick={() => onPick(value)}>
      <strong>{title}</strong>
      {children && <span>{children}</span>}
    </button>
  );
}

export default function GuidedCheck({ personas, states }: { personas: GuidePersona[]; states: GuideState[] }) {
  const [step, setStep] = useState(0);
  const [persona, setPersona] = useState<string | null>(null);
  const [money, setMoney] = useState<Money | null>(null);
  const [saleDate, setSaleDate] = useState("");
  const [placeInput, setPlaceInput] = useState("");
  const [place, setPlace] = useState<Place | null>(null);
  const [placeMsg, setPlaceMsg] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [stateFips, setStateFips] = useState("");
  const [fund, setFund] = useState<FundRoute | null>(null);

  const p = personas.find((x) => x.slug === persona) ?? null;
  const st = states.find((s) => s.fips === stateFips) ?? null;
  const end = money === "gain" && saleDate ? windowEnd(saleDate) : null;
  const canNext = [persona != null, money != null, true, fund != null, false][step];

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    setChecking(true);
    setPlaceMsg(null);
    try {
      const r = await checkPlace(placeInput);
      if (r === "no-match") setPlaceMsg("No match. Try the full street address with city, state and ZIP, or an 11-digit tract number.");
      else if (r === "error") setPlaceMsg("The lookup is unavailable right now; try again, or pick a state below.");
      else setPlace(r);
    } finally {
      setChecking(false);
    }
  }

  function restart() {
    setStep(0);
    setPersona(null);
    setMoney(null);
    setSaleDate("");
    setPlaceInput("");
    setPlace(null);
    setPlaceMsg(null);
    setStateFips("");
    setFund(null);
  }

  const moneyNotes: Record<Money, Line[]> = {
    gain: [
      {
        text: "Capital gains and qualified section 1231 gains are what the program defers: for example, from selling stock, a business interest, or real estate held as an investment.",
        cite: ["eligibleGains"],
      },
      {
        text: "Generally, the gain has to go into a Qualified Opportunity Fund within the 180 days beginning on the sale date. Only the gain needs to be invested.",
        cite: ["window180", "gainOnly"],
      },
      {
        text: "Which rules apply depends on when the gain is invested: from January 1, 2027, the new rules apply, including to a gain from a 2026 sale.",
        cite: ["gain2026Invested2027"],
      },
    ],
    ordinary: [
      {
        text: "Ordinary income is not eligible, and profit on property held for sale to customers (such as homes built or bought to sell) is not a capital gain, so it cannot be deferred this way.",
        cite: ["eligibleGains"],
      },
      {
        text: "The program can still apply from the other side: a project or business located in a zone can take investment from a fund whose money comes from investors' gains.",
        cite: ["zoneBusiness", "equityNotLoan"],
      },
    ],
    investors: [
      { text: "The fund's investors bring the capital gains. A fund must hold at least 90% of its assets in zone property, measured twice a year.", cite: ["fund"] },
      {
        text: "The places the fund invests in must be designated zones; property bought after December 31, 2026, must be in a 2027 zone, and Treasury has not yet published that list.",
        cite: ["designatedNotEligible", "boughtAfterStart"],
      },
    ],
    unsure: [
      {
        text: "Whether money counts depends on what kind of income it is. Capital gains and qualified section 1231 gains qualify; ordinary income does not.",
        cite: ["eligibleGains"],
      },
      { text: "A tax adviser can say which applies. The checklist at the end includes the question." },
    ],
  };

  function placeMeaning(pl: Place): Line[] {
    const lines: Line[] = [{ text: pl.designation.text, cite: ["designatedNotEligible"] }];
    if (pl.rural)
      lines.push({
        text: "Treasury's 2027 list marks the tract as rural. Zones made up entirely of rural areas have a 50% substantial-improvement bar, and qualified rural opportunity funds a 30% step-up.",
        cite: ["ruralImprovement", "ruralFund"],
      });
    if (pl.zone2018 != null && pl.zone2018 >= 0.5)
      lines.push({
        text: "It is also in a 2018 Opportunity Zone, designated through December 31, 2028. Property bought there after December 31, 2026, generally does not qualify, apart from narrow transition rules.",
        cite: ["zones2018End", "boughtAfterStart"],
      });
    return lines;
  }

  const checklist: Line[] = [];
  if (money === "gain") {
    checklist.push(
      end
        ? {
            text: `Note the 180-day window: for a sale on ${longDate(Date.parse(`${saleDate}T00:00:00Z`))}, counting the sale date as day 1, it generally ends ${longDate(end)}.`,
            cite: ["window180"],
          }
        : { text: "Note the sale date: the 180-day window generally begins on it.", cite: ["window180"] },
    );
    if (end && end < NEW_RULES_START)
      checklist.push({
        text: "That window closes before January 1, 2027, so the gain would be invested under the original rules: it is taxed no later than the tax year that includes December 31, 2026, though the ten-year benefit can still apply.",
        cite: ["investedBy2026"],
      });
    if (end && end >= NEW_RULES_START)
      checklist.push({
        text: "That window reaches January 1, 2027. Amounts invested from that date fall under the new rules (deferral up to five years, a 10% or 30% step-up, tax-free growth after ten years), including for a gain from a 2026 sale.",
        cite: ["gain2026Invested2027", "deferralFiveYears", "stepUp", "tenYears"],
      });
    checklist.push({ text: "Ask whether this gain has a different start date (for example, one passed through from a partnership).", cite: ["passThroughTiming", "installmentTiming"] });
  }
  if (money === "ordinary") checklist.push({ text: "Confirm whether any of the money is a capital gain; ordinary income does not qualify.", cite: ["eligibleGains"] });
  if (place) checklist.push({ text: `Place: tract ${place.geoid}${place.county ? `, ${place.county}, ${place.state}` : ""}. ${place.designation.text}` });
  else if (st)
    checklist.push({
      text: `State: ${st.name} may designate up to ${st.cap.toLocaleString("en-US")} of its ${st.eligible.toLocaleString("en-US")} eligible tracts. Watch for its 2027 list.`,
      cite: ["stateCap"],
    });
  else checklist.push({ text: "Place: not chosen yet. Use the map or the property checker when you have candidates." });
  if (fund === "existing") checklist.push({ text: "Fund: review any fund with the questions on the Funds page, and check its property addresses with Check properties." });
  if (fund === "own")
    checklist.push({ text: "Fund: a fund of your own must be a partnership or corporation for tax purposes, certify on Form 8996, and hold 90% of its assets in zone property.", cite: ["fund"] });
  if (fund === "unsure") checklist.push({ text: "Fund: compare investing in an existing fund with setting one up for a project; both routes are on the Funds page." });

  const questions = [
    ...(p?.ask ?? []),
    ...(money === "unsure" || money === "ordinary" ? ["Is any of this money a capital gain that qualifies, and when does its 180-day window start?"] : []),
    ...(place && place.designation.status === "pending" ? ["What happens to a plan for this tract if it is not designated in 2027?"] : []),
  ];

  return (
    <div className="guide">
      <ol className="guide-steps" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? "step" : undefined} className={i < step ? "done" : undefined}>
            <span>{i + 1}</span> {s}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section>
          <h2>Which describes you best?</h2>
          <div className="cards">
            {personas.map((x) => (
              <Choice key={x.slug} value={x.slug} current={persona} onPick={setPersona} title={x.who}>
                {x.title}
              </Choice>
            ))}
          </div>
        </section>
      )}

      {step === 1 && (
        <section>
          <h2>Where would the money come from?</h2>
          <div className="cards">
            <Choice value="gain" current={money} onPick={setMoney} title="A capital gain">
              From selling stock, a business, crypto, or real estate held as an investment, recently or soon.
            </Choice>
            <Choice value="ordinary" current={money} onPick={setMoney} title="Business profit or home sales">
              Operating profit, or profit on homes built or bought to sell.
            </Choice>
            <Choice value="investors" current={money} onPick={setMoney} title="Investors' money">
              I am raising money for a fund, or a project or business would receive it.
            </Choice>
            <Choice value="unsure" current={money} onPick={setMoney} title="Not sure">
              I am not sure what kind of income it is.
            </Choice>
          </div>
          {money && (
            <div className="callout">
              <ul>
                {moneyNotes[money].map((l) => (
                  <CitedLi key={l.text} line={l} />
                ))}
              </ul>
              {money === "gain" && (
                <p>
                  <label>
                    Date of the sale (optional, stays in this page):{" "}
                    <input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
                  </label>
                  {end && (
                    <>
                      <br />
                      Counting the sale date as day 1, the 180-day window generally ends on <strong>{longDate(end)}</strong>
                      {end >= NEW_RULES_START ? ", so the gain could be invested from January 1, 2027, under the new rules" : ", before the new rules begin on January 1, 2027"}. Some gains
                      have different start dates; a tax adviser can confirm yours. <Cite rules={end >= NEW_RULES_START ? ["window180", "gain2026Invested2027"] : ["window180", "investedBy2026"]} />
                    </>
                  )}
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {step === 2 && (
        <section>
          <h2>Do you have a place in mind?</h2>
          <form className="guide-row" onSubmit={lookup}>
            <input value={placeInput} onChange={(e) => setPlaceInput(e.target.value)} placeholder="Street address, city, state ZIP, or tract number" aria-label="Address or tract" autoComplete="off" />
            <button type="submit" className="button" disabled={checking || placeInput.trim().length < 5}>
              {checking ? "Checking..." : "Check"}
            </button>
          </form>
          {placeMsg && <p className="error">{placeMsg}</p>}
          {place && (
            <div className="callout">
              <p>
                <strong>
                  Tract {place.geoid}
                  {place.county ? `, ${place.county}, ${place.state}` : ""}
                </strong>
                {place.matched && <span className="hint"> (matched {place.matched})</span>}
              </p>
              <ul>
                {placeMeaning(place).map((l) => (
                  <CitedLi key={l.text} line={l} />
                ))}
              </ul>
              <p>
                <Link href={reportHref(place.geoid, place.point)}>Place report</Link> · <Link href={`/map#t=${place.geoid}`}>See it on the map</Link>
              </p>
            </div>
          )}
          <h3>Or look across a state</h3>
          <div className="guide-row">
            <select value={stateFips} onChange={(e) => setStateFips(e.target.value)} aria-label="State">
              <option value="">Choose a state or territory</option>
              {states.map((s) => (
                <option key={s.fips} value={s.fips}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          {st && (
            <div className="callout">
              <p>
                {st.name} has <strong>{st.eligible.toLocaleString("en-US")}</strong> tracts eligible for 2027 and may designate up to{" "}
                <strong>{st.cap.toLocaleString("en-US")}</strong> of them. Designations take effect January 1, 2027, once Treasury publishes the list.
              </p>
              {st.view && (
                <p>
                  <Link href={`/map#v=${st.view[0].toFixed(4)},${st.view[1].toFixed(4)},${st.view[2].toFixed(2)}`}>See {st.name}&apos;s tracts on the map</Link> (rural tracts are hatched).
                </p>
              )}
            </div>
          )}
          <p className="hint">You can skip this step and come back to places later.</p>
        </section>
      )}

      {step === 3 && (
        <section>
          <h2>How would the fund work?</h2>
          <div className="cards">
            <Choice value="existing" current={fund} onPick={setFund} title="Invest in an existing fund">
              A fund run by a sponsor. It owns the properties or businesses; you own an interest in the fund.
            </Choice>
            <Choice value="own" current={fund} onPick={setFund} title="Set up a fund for a project">
              A partnership or corporation formed for your own project, certified on Form 8996.
            </Choice>
            <Choice value="unsure" current={fund} onPick={setFund} title="Not sure yet">
              Compare both.
            </Choice>
          </div>
          {fund && (
            <p>
              <Link href="/funds">Where funds are found and what to ask one</Link> · <Link href="/check">Check a fund&apos;s properties</Link>
            </p>
          )}
        </section>
      )}

      {step === 4 && (
        <section className="guide-summary">
          <h2>Your checklist</h2>
          {p && (
            <p>
              For: <strong>{p.title}</strong> · <Link href={`/for/${p.slug}`}>how the rules apply to this situation</Link>
            </p>
          )}
          <ol>
            {checklist.map((l) => (
              <CitedLi key={l.text} line={l} />
            ))}
          </ol>
          <h3>Questions to take to a tax adviser or attorney</h3>
          <ul>
            {[...new Set(questions)].map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
          <p className="guide-actions">
            <button type="button" className="button" onClick={() => window.print()}>
              Print or save as PDF
            </button>
            <button type="button" className="button secondary" onClick={restart}>
              Start over
            </button>
          </p>
          <p className="note">
            General information, not investment, tax or legal advice. Dates are the general rule; your adviser should confirm them.
          </p>
        </section>
      )}

      {step < 4 && (
        <div className="guide-nav">
          {step > 0 && (
            <button type="button" className="button secondary" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          <button type="button" className="button" disabled={!canNext} onClick={() => setStep(step + 1)}>
            {step === 3 ? "See my checklist" : step === 2 ? (place || st ? "Next" : "Skip for now") : "Next"}
          </button>
        </div>
      )}
    </div>
  );
}

interface Line {
  text: string;
  cite?: RuleId[];
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
