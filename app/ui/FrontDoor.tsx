"use client";

/**
 * The Start page's one search box: an address, city, tract number or state, to
 * the map for a resolved address, city, or tract. Describes the place;
 * never recommends it. The address stays in this page and goes only to
 * /api/geocode in a POST body.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { mapHref, type PlaceResult } from "@/lib/client/place";
import { useResearchState } from "./ResearchSession";
import PlaceSearch from "./PlaceSearch";
import type { StateSummary } from "@/lib/data/stateViews";
import { cityMapHref } from "@/lib/geo/placeNames";

type Answer = { kind: "state"; state: StateSummary };

export function matchState(input: string, states: readonly StateSummary[]): StateSummary | null {
  const q = input.trim().toLowerCase().replace(/\.$/, "");
  if (!q) return null;
  return states.find((s) => s.name.toLowerCase() === q || s.usps.toLowerCase() === q) ?? null;
}

export default function FrontDoor({ states }: { states: StateSummary[] }) {
  const router = useRouter();
  const [q, setQ] = useResearchState("home-query", "");
  const [answer, setAnswer] = useResearchState<Answer | null>("home-answer", null);
  const [, setActivePlace] = useResearchState<PlaceResult | null>("active-place", null);
  const [, setSelected] = useResearchState<PlaceResult | null>("explore-selected", null);
  const [, setMode] = useResearchState<"list" | "map" | "split">("explore-mode", "map");

  return (
    <div className="front-door">
      <PlaceSearch value={q} onChange={setQ} label="Address, city, state, or tract number" placeholder="Atlanta, GA · Georgia · street address · tract number" resultAction="View on map" onResult={(result) => { setActivePlace(result); setSelected(result); setMode("map"); router.push(mapHref(result.profile.geoid, result.point)); }} onCityResult={(city) => { setActivePlace(null); setSelected(null); setMode("map"); router.push(cityMapHref(city)); }} beforeSearch={(input) => { setAnswer(null); const state = matchState(input, states); if (!state) return false; setAnswer({ kind: "state", state }); return true; }} />
      <p className="hint">
        Try <button type="button" className="link" onClick={() => setQ("55 Trinity Ave SW, Atlanta, GA 30303")}>55 Trinity Ave SW, Atlanta, GA 30303</button>,{" "}
        <button type="button" className="link" onClick={() => setQ("Atlanta, GA")}>Atlanta, GA</button>,{" "}
        <button type="button" className="link" onClick={() => setQ("13001950100")}>13001950100</button> or{" "}
        <button type="button" className="link" onClick={() => setQ("Georgia")}>Georgia</button>. Addresses are not stored.
      </p>

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
              <Link className="button" href={`/map#s=${answer.state.fips}&v=${answer.state.view.join(",")}&m=map`}>
                See {answer.state.name}&apos;s tracts
              </Link>
            )}
            <Link className="button secondary" href="/guide">
              Read the rules
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
