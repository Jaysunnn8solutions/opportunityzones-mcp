"use client";

/**
 * The Start page's one search box: an address, a tract number or a state, to
 * an answer card in plain English with the next steps. Describes the place;
 * never recommends it. The address stays in this page and goes only to
 * /api/geocode in a POST body.
 */

import Link from "next/link";
import { useState } from "react";
import { lookupPlace, reportHref, type PlaceResult } from "@/lib/client/place";
import type { StateSummary } from "@/lib/data/stateViews";
import Badges from "./Badges";

type Answer = { kind: "place"; result: PlaceResult } | { kind: "state"; state: StateSummary };

export function matchState(input: string, states: readonly StateSummary[]): StateSummary | null {
  const q = input.trim().toLowerCase().replace(/\.$/, "");
  if (!q) return null;
  return states.find((s) => s.name.toLowerCase() === q || s.usps.toLowerCase() === q) ?? null;
}

function meaning(r: PlaceResult): string[] {
  const p = r.profile;
  const lines = [p.designation2027.text];
  if (p.rural.treasury) lines.push("Rural under the 2027 rules: a lower substantial-improvement bar, and a larger step-up for rural funds.");
  const z = p.measures.oz2018_population_share?.value;
  if (z != null && z >= 0.5) lines.push("Also in a 2018 Opportunity Zone, in effect through 2028.");
  return lines;
}

export default function FrontDoor({ states }: { states: StateSummary[] }) {
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setAnswer(null);
    const st = matchState(q, states);
    if (st) {
      setAnswer({ kind: "state", state: st });
      return;
    }
    setBusy(true);
    try {
      const r = await lookupPlace(q);
      if (r === "no-match") setMsg("No match. Try a full street address with city, state and ZIP, an 11-digit tract number, or a state name.");
      else if (r === "error") setMsg("The address lookup is unavailable right now. Try a tract number or a state, or come back shortly.");
      else setAnswer({ kind: "place", result: r });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="front-door">
      <form className="front-search" onSubmit={go} role="search">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="An address, a census tract number, or a state"
          aria-label="Address, tract number or state"
          autoComplete="off"
        />
        <button type="submit" className="button" disabled={busy || q.trim().length < 2}>
          {busy ? "Checking..." : "Check"}
        </button>
      </form>
      <p className="hint">
        Try <button type="button" className="link" onClick={() => setQ("55 Trinity Ave SW, Atlanta, GA 30303")}>55 Trinity Ave SW, Atlanta, GA 30303</button>,{" "}
        <button type="button" className="link" onClick={() => setQ("13001950100")}>13001950100</button> or{" "}
        <button type="button" className="link" onClick={() => setQ("Georgia")}>Georgia</button>. Addresses are not stored.
      </p>
      {msg && <p className="error">{msg}</p>}

      {answer?.kind === "place" && (
        <div className="answer-card" aria-live="polite">
          <div className="answer-head">
            <div>
              <span className="card-kicker">Census tract {answer.result.profile.geoid}</span>
              <h2>
                {answer.result.profile.county}, {answer.result.profile.state}
              </h2>
              {answer.result.matched && <p className="hint">Matched {answer.result.matched}</p>}
            </div>
          </div>
          <Badges
            designation={answer.result.profile.designation2027.status}
            rural={answer.result.profile.rural.treasury}
            zone2018Share={answer.result.profile.measures.oz2018_population_share?.value ?? null}
            qct={answer.result.profile.measures.qct_2026?.value}
            dda={answer.result.profile.measures.dda_2026?.value}
            nmtc={answer.result.profile.measures.nmtc_lic?.value}
          />
          <ul className="answer-lines">
            {meaning(answer.result).map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <div className="answer-actions">
            <Link className="button" href={reportHref(answer.result.profile.geoid, answer.result.point)}>
              Open the place report
            </Link>
            <Link className="button secondary" href={`/map#t=${answer.result.profile.geoid}`}>
              See it on the map
            </Link>
            <Link className="button secondary" href="/guide">
              Run the guided check
            </Link>
          </div>
        </div>
      )}

      {answer?.kind === "state" && (
        <div className="answer-card" aria-live="polite">
          <span className="card-kicker">{answer.state.usps}</span>
          <h2>{answer.state.name}</h2>
          <div className="stats compact">
            <div>
              <strong>{answer.state.eligible.toLocaleString("en-US")}</strong>
              <span>tracts eligible for 2027</span>
            </div>
            <div>
              <strong>{answer.state.cap.toLocaleString("en-US")}</strong>
              <span>at most can be designated</span>
            </div>
          </div>
          <p>The governor nominates up to the cap and Treasury certifies them; the new zones take effect January 1, 2027.</p>
          <div className="answer-actions">
            {answer.state.view && (
              <Link className="button" href={`/map#v=${answer.state.view.join(",")}`}>
                See {answer.state.name}&apos;s tracts
              </Link>
            )}
            <Link className="button secondary" href="/guide">
              Run the guided check
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
