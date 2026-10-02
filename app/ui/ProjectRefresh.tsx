"use client";
import { comparisonLimit } from "@/lib/research/comparisonLimits";
import Link from "next/link";
import { useState } from "react";
import { useAccount } from "./AccountAccess";
import { isPlaceResult, lookupPlace, type PlaceResult } from "@/lib/client/place";
import { dateLabel, displayValue } from "@/lib/client/presentation";

export default function ProjectRefresh({ savedVersion, version, selected, onReview }: { savedVersion: string; version: string; selected: string[]; onReview: () => void }) {
  const { account } = useAccount();
  const [result, setResult] = useState<{ key: string; places: PlaceResult[]; absent: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const key = JSON.stringify([selected, version]);
  const current = result?.key === key ? result : null;
  const maximum = comparisonLimit(account.member);
  async function refresh() {
    if (!selected.length || selected.length > maximum) return;
    setBusy(true); setMessage("");
    try {
      const results = await Promise.all(selected.map((id) => lookupPlace(id)));
      setResult({ key, places: results.filter(isPlaceResult), absent: selected.filter((_, i) => !isPlaceResult(results[i])) });
      setMessage("Selected facts refreshed from the site's published dataset.");
    } catch { setMessage("Published facts could not be refreshed. Your saved recipe is unchanged."); }
    finally { setBusy(false); }
  }
  return <section className="lab-card"><h2>Resume and refresh</h2><p>{!savedVersion ? "This recipe has no recorded dataset version yet." : savedVersion === version ? "The site's dataset build matches the version recorded with your saved recipe." : "The site has a different dataset build from the one recorded with your recipe. Review source and value changes before combining results."}</p><p className="hint">Saved recipe build: {savedVersion ? dateLabel(savedVersion) : "Not recorded"} · Current build: {dateLabel(version)}. A recipe saves selections; it does not freeze the underlying facts.</p><div className="answer-actions"><button type="button" className="button secondary" disabled={busy || !selected.length || selected.length > maximum} onClick={() => void refresh()}>Refresh selected facts</button><button type="button" className="button secondary" onClick={onReview}>Review changes from an earlier export →</button><Link href="/map#m=map">Continue on the map</Link><Link href="/map#m=list">Continue with text results</Link></div><p className="hint">Quick refresh supports {maximum} explicitly selected tracts. For larger selections, prepare a current JSON export and compare it with an earlier export. Download allowances apply.</p>{current && <div className="table-wrap"><table className="rules"><caption>Current published facts; not a historical change calculation.</caption><thead><tr><th scope="col">Tract</th><th scope="col">Population</th><th scope="col">Median household income</th><th scope="col">Period</th></tr></thead><tbody>{current.places.map(({ profile }) => <tr key={profile.geoid}><th scope="row"><Link href={`/tract/${profile.geoid}`}>{profile.geoid}</Link></th><td>{displayValue(profile.measures.population?.value, "count")}</td><td>{displayValue(profile.measures.median_household_income?.value, "usd")}</td><td>2020–2024 ACS · <Link href={`/tract/${profile.geoid}`}>Sources and limitations</Link></td></tr>)}</tbody></table>{!!current.absent.length && <p>Unavailable or unable to load: {current.absent.join(", ")}. No entries were removed from your selections.</p>}</div>}<p role="status">{busy ? "Refreshing published facts…" : message}</p></section>;
}
