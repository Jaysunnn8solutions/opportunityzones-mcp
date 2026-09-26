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

  const moneyNotes: Record<Money, string[]> = {
    gain: [
      "Capital gains are what the program defers: for example, from selling stock, a business interest, or real estate held as an investment.",
      "Generally, the gain has to go into a Qualified Opportunity Fund within 180 days of the sale. Only the gain needs to be invested.",
    ],
    ordinary: [
      "Ordinary income, such as a business's operating profit or profit on selling homes built or bought to sell, is not a capital gain, so it generally cannot be deferred this way.",
      "The program can still apply from the other side: a project or business located in a zone can take investment from a fund whose money comes from investors' gains.",
    ],
    investors: [
      "The fund's investors bring the capital gains. A fund must hold at least 90% of its assets in zone property or businesses, tested twice a year.",
      "The places the fund invests in must be designated zones, which for 2027 depends on the list Treasury has not yet published.",
    ],
    unsure: [
      "Whether money counts depends on what kind of income it is. Capital gains qualify; ordinary income (wages, business profit, inventory sales) does not.",
      "A tax adviser can say which applies. The checklist at the end includes the question.",
    ],
  };

  function placeMeaning(pl: Place): string[] {
    const lines = [pl.designation.text];
    if (pl.rural) lines.push("The tract is rural under the 2027 rules: rural zones have a lower substantial-improvement bar, and rural funds a larger step-up.");
    if (pl.zone2018 != null && pl.zone2018 >= 0.5) lines.push("It is also in a 2018 Opportunity Zone, which remains in effect through 2028.");
    return lines;
  }

  const checklist: string[] = [];
  if (money === "gain") {
    checklist.push(end ? `Note the 180-day window: generally ends ${longDate(end)} for a sale on ${longDate(Date.parse(`${saleDate}T00:00:00Z`))}.` : "Note the sale date: the 180-day window generally runs from it.");
    if (end && end < NEW_RULES_START) checklist.push("That window ends before January 1, 2027. Gains invested under the original rules have their deferral end on December 31, 2026.");
    if (end && end >= NEW_RULES_START) checklist.push("Investments made from January 1, 2027 fall under the new rules (five-year deferral, 10% or 30% step-up, tax-free growth after ten years).");
  }
  if (money === "ordinary") checklist.push("Confirm whether any of the money is a capital gain; ordinary income generally does not qualify.");
  if (place) checklist.push(`Place: tract ${place.geoid}${place.county ? `, ${place.county}, ${place.state}` : ""}. ${place.designation.text}`);
  else if (st) checklist.push(`State: ${st.name} may designate up to ${st.cap.toLocaleString("en-US")} of its ${st.eligible.toLocaleString("en-US")} eligible tracts. Watch for its 2027 list.`);
  else checklist.push("Place: not chosen yet. Use the map or the property checker when you have candidates.");
  if (fund === "existing") checklist.push("Fund: review any fund with the questions on the Funds page, and check its property addresses with Check properties.");
  if (fund === "own") checklist.push("Fund: a fund of your own must be a partnership or corporation, certify on Form 8996, and hold 90% of its assets in zones.");
  if (fund === "unsure") checklist.push("Fund: compare investing in an existing fund with setting one up for a project; both routes are on the Funds page.");

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
                  <li key={l}>{l}</li>
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
                      Generally, 180 days from that sale ends on <strong>{longDate(end)}</strong>. Some gains have different start dates; a tax adviser can confirm yours.
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
                  <li key={l}>{l}</li>
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
              <li key={l}>{l}</li>
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
