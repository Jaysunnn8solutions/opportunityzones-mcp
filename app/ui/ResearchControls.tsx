"use client";
import Link from "next/link";
import { DEFAULT_MEASURES, FOCUSES, MEASURES, type Focus, type MeasureKey } from "@/lib/research/measures";
import { useResearchState } from "./ResearchSession";

export function ResearchControls({ customize = false }: { customize?: boolean }) {
  const [focus, setFocus] = useResearchState<Focus>("research-focus", "overview");
  const [keys, setKeys] = useResearchState<MeasureKey[]>("comparison-measures", DEFAULT_MEASURES);
  return <div className="research-controls"><fieldset><legend>What are you researching?</legend><div className="research-focus">{Object.entries(FOCUSES).map(([key, value]) => <button key={key} className="button secondary" type="button" aria-pressed={focus === key} onClick={() => { setFocus(key as Focus); setKeys([...value.measures]); }}>{value.label}</button>)}</div></fieldset>{customize && <fieldset><legend>Choose comparison measures · {keys.length} selected</legend><div className="measure-choices">{MEASURES.map((m) => <label key={m.column}><input type="checkbox" checked={keys.includes(m.column)} disabled={keys.length === 1 && keys.includes(m.column)} onChange={(event) => setKeys((current) => event.target.checked ? [...current, m.column] : current.filter((key) => key !== m.column))} />{m.label}</label>)}</div></fieldset>}</div>;
}
export function BriefLink({ geoids, children = "Create screening brief" }: { geoids: string[]; children?: React.ReactNode }) {
  const [, setBrief] = useResearchState<string[]>("brief-tracts", []);
  return <Link className="button secondary" href={`/brief#tracts=${geoids.join(",")}`} onClick={() => setBrief(geoids)}>{children}</Link>;
}
