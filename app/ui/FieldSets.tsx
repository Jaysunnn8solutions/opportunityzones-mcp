"use client";
import { FOCUSES } from "@/lib/research/measures";
export default function FieldSets({ onChange }: { onChange: (columns: string[]) => void }) {
  return <fieldset className="field-sets"><legend>Choose a field set</legend><div className="answer-actions">{Object.values(FOCUSES).map((focus) => <button type="button" className="button secondary" key={focus.label} onClick={() => onChange([...focus.measures])}>{focus.label}</button>)}</div><p className="hint">Replaces the selected fields only. Geography and criteria stay as you chose them.</p></fieldset>;
}
