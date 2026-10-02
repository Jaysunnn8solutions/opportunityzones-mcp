"use client";
import { useEffect, useState } from "react";
import { type CriterionEvidence } from "@/lib/explore/evidence";
import { filtersActive, NO_FILTERS, type Filters } from "@/lib/explore/filter";
import type { SearchPage } from "@/lib/access/search";
import { useResearchState } from "./ResearchSession";

export function EvidenceTable({ evidence }: { evidence: CriterionEvidence[] }) {
  if (!evidence.length) return <p className="hint">No screening criteria selected. This place is included by search scope.</p>;
  return <div className="table-wrap"><table className="rules evidence-table"><thead><tr><th>Criterion</th><th>Published evidence</th><th>Result</th></tr></thead><tbody>{evidence.map((e) => <tr key={e.id}><th scope="row">{e.label}<small>{e.requirement}</small></th><td>{e.actual}</td><td><span className={`evidence-result ${e.result === "Meets" ? "meets" : ""}`}>{e.result}</span></td></tr>)}</tbody></table></div>;
}

export default function ResearchEvidence({ geoid, onResolved }: { geoid: string; onResolved?: (geoid: string, resolved: boolean) => void }) {
  const [filters] = useResearchState<Filters>("explore-filters", NO_FILTERS);
  const [scope] = useResearchState("explore-state", "");
  const key = JSON.stringify({ scope, filters, geoid });
  const [response, setResponse] = useState<{ key: string; data: SearchPage | null } | null>(null);
  const [retry, setRetry] = useState(0);
  const active = filtersActive(filters);
  useEffect(() => {
    if (!active || (scope && !geoid.startsWith(scope))) return;
    const controller = new AbortController();
    fetch(`/api/explore/${scope || geoid.slice(0, 2)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filters, geoids: [geoid] }), signal: controller.signal }).then(async (r) => {
      if (!r.ok) throw new Error();
      const data = await r.json() as SearchPage;
      if (!controller.signal.aborted) setResponse({ key, data });
    }).catch(() => { if (!controller.signal.aborted) setResponse({ key, data: null }); });
    return () => controller.abort();
  }, [scope, active, geoid, retry, filters, key]);
  const evidence = response?.key === key ? response.data?.evidence[geoid] ?? null : null;
  const resolved = !active || (!!scope && !geoid.startsWith(scope)) || evidence !== null;
  useEffect(() => { onResolved?.(geoid, resolved); }, [geoid, resolved, onResolved]);
  if (!active) return <p className="hint">No screening criteria selected. Set criteria in Find areas to see the evidence here.</p>;
  if (scope && !geoid.startsWith(scope)) return <p>This tract is outside the selected search state. Criteria have not been evaluated for this place.</p>;
  if (response?.key === key && !response.data) return <p role="alert">Criteria evidence could not be loaded. Advanced criteria require a free account. <button className="link" onClick={() => setRetry(retry + 1)}>Retry evidence</button></p>;
  if (!evidence) return <p role="status">Loading criteria evidence…</p>;
  return <><EvidenceTable evidence={evidence} /><p className="hint">Missing evidence is unknown, never a match. Neighbor thresholds use state tracts with data and include ties. ACS facts cover 2020–2024; program source dates are in the full report.</p></>;
}
