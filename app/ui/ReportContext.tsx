"use client";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { pointFromHash, type PlaceProfile, type PlaceResult } from "@/lib/client/place";
import { useResearchState } from "./ResearchSession";
import { ComparisonButton, ComparisonTray, RulesGuideLink, PlaceMapLink } from "./ResearchActions";
import PrintButton from "./PrintButton";
import { BriefLink } from "./ResearchControls";
import PrepareDataLink from "./PrepareDataLink";

const subscribe = (callback: () => void) => { window.addEventListener("hashchange", callback); return () => window.removeEventListener("hashchange", callback); };
export default function ReportContext({ profile }: { profile: PlaceProfile }) {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => "");
  const [origin] = useResearchState("report-origin", "/map");
  const [active] = useResearchState<PlaceResult | null>("active-place", null);
  const point = pointFromHash(hash);
  const matched = point && active?.profile.geoid === profile.geoid && active.point && active.point.every((coordinate, index) => Math.abs(coordinate - point[index]) < 0.00001) ? active.matched : null;
  const place = { profile, point, matched };
  return <>
    <Link className="report-return" href={origin}>{origin.startsWith("/check") ? "← Back to your property list" : origin.startsWith("/compare") ? "← Back to comparison" : origin.startsWith("/brief") ? "← Back to screening brief" : origin.startsWith("/guide") ? "← Back to the rules" : origin === "/" ? "← Back to your search" : "← Back to area results"}</Link>
    <p className="location-basis">{point ? <><strong>Searched address</strong>{matched ? ` · ${matched}` : ` · ${point[1].toFixed(5)}, ${point[0].toFixed(5)}`}<span>Zone status and demographics describe the tract. Site context uses this matched point.</span></> : <><strong>Census tract</strong><span>Site context uses a representative point inside this tract. Search an exact address for building-level context.</span></>}</p>
    <div className="answer-actions"><ComparisonButton geoid={profile.geoid} /><PlaceMapLink place={place} /><RulesGuideLink /><BriefLink geoids={[profile.geoid]} /><PrepareDataLink geoids={[profile.geoid]}>Prepare data for this tract</PrepareDataLink><PrintButton /></div>
    <ComparisonTray />
  </>;
}
