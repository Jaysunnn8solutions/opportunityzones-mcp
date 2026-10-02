"use client";

import { useEffect, useRef, useState } from "react";
import { isPlaceResult, lookupPlace, type PlaceCandidate, type PlaceResult } from "@/lib/client/place";
import { DISCLAIMER } from "@/lib/client/presentation";
import { useResearchState } from "./ResearchSession";
import { ComparisonButton, ComparisonTray, PlaceReportLink } from "./ResearchActions";
import ExportResearch from "./ExportResearch";
import { useAccount } from "./AccountAccess";
import Badges from "./Badges";

type Row = { input: string; state: "waiting" | "working" | "done" | "no-match" | "error" | "limited" | "ambiguous" | "stopped" | "out-of-scope"; result?: PlaceResult; candidates?: PlaceCandidate[] };

export default function PropertyChecker() {
  const { account, open: openAccount } = useAccount();
  const MAX_LINES = account.member ? 25 : 1;
  const [text, setText] = useResearchState("batch-text", "");
  const [rows, setRows] = useResearchState<Row[]>("batch-rows", []);
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  useEffect(() => () => request.current?.abort(), []);
  async function process(initial: Row[], indexes: number[], candidate?: PlaceCandidate) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    const next = [...initial];
    for (const index of indexes) {
      if (controller.signal.aborted) break;
      next[index] = { input: next[index].input, state: "working" };
      setRows([...next]);
      const result = await lookupPlace(next[index].input, candidate, controller.signal);
      if (controller.signal.aborted) break;
      next[index] = isPlaceResult(result) ? { input: next[index].input, state: "done", result }
        : typeof result === "object" ? { input: next[index].input, state: "ambiguous", candidates: result.candidates }
          : { input: next[index].input, state: result };
      setRows([...next]);
      if (result === "limited") break;
    }
    setRows(next.map((row) => row.state === "working" || row.state === "waiting" ? { ...row, state: "stopped" } : row));
    setBusy(false);
  }
  const complete = rows.filter((row) => row.state === "done").length;
  const pending = rows.filter((row) => row.result?.profile.designation2027.status === "pending").length;
  function editRow(index: number, input: string) {
    const next = rows.map((row, i): Row => i === index ? { input, state: "stopped" } : row);
    setRows(next); setText(next.map((row) => row.input).join("\n"));
  }
  return <div className="checker">
    {!account.member && <p className="hint">Public access checks one place at a time. <button className="link" onClick={openAccount}>Sign in free</button> to check up to 25 entries per batch. Each address lookup uses your allowance.</p>}
    <form onSubmit={(event) => { event.preventDefault(); if (!busy && lines.length && lines.length <= MAX_LINES) void process(lines.map((input) => ({ input, state: "waiting" })), lines.map((_, i) => i)); }}>
      <label htmlFor="places">Addresses or tract numbers, one per line (up to {MAX_LINES})</label>
      <textarea id="places" rows={5} value={text} disabled={busy} onChange={(event) => setText(event.target.value)} placeholder={"55 Trinity Ave SW, Atlanta, GA 30303\n13001950100"} autoComplete="off" spellCheck={false} />
      <div className="checker-actions"><button className="button" disabled={busy || !lines.length || lines.length > MAX_LINES}>{busy ? "Checking places…" : `Check ${lines.length || ""} ${lines.length === 1 ? "place" : "places"}`}</button>
        {busy && <button type="button" className="button secondary" onClick={() => request.current?.abort()}>Stop checking</button>}
        {!!rows.length && !busy && <><ExportResearch input={{ geoids: rows.flatMap((row) => row.result ? [row.result.profile.geoid] : []) }} label="Export matched tract data" disabled={!complete} /><button type="button" className="button secondary" onClick={() => { setRows([]); setText(""); }}>Clear list</button></>}
      </div>
      {lines.length > MAX_LINES && <p role="alert" className="error">There are {lines.length} entries. Split the list into batches of {MAX_LINES} or fewer; no entries have been skipped.</p>}
    </form>
    {!!rows.length && <>
      <p className="batch-summary" role="status" aria-live="polite"><strong>{complete} of {rows.length} matched</strong> · {pending} with designation pending{!busy && complete < rows.length ? ` · ${rows.length - complete} need attention` : ""}</p>
      <div className="batch-results">{rows.map((row, index) => <article className="batch-row" id={`batch-row-${index}`} key={index}>
        <div><h2>{row.input}</h2>{row.result?.matched && <p className="hint">Matched: {row.result.matched}</p>}
          {row.result ? <><p>{row.result.profile.county}, {row.result.profile.state} · Tract {row.result.profile.geoid}</p><Badges designation={row.result.profile.designation2027.status} rural={row.result.profile.rural.treasury} zone2018Share={row.result.profile.measures.oz2018_population_share?.value ?? null} /></>
            : <p className="hint">{({ waiting: "Waiting", working: "Looking up…", "out-of-scope": "Outside research scope: details are limited to eligible or designated Opportunity Zone tracts.", "no-match": "No match. Correct the address or tract number below.", limited: "Lookup allowance reached. Remaining entries are preserved for later.", error: "Lookup unavailable. Retry this row when ready.", ambiguous: "Choose the correct matched address.", stopped: "Not completed. Retry this row to continue.", done: "Matched" })[row.state]}</p>}
        </div>
        {row.result ? <div className="answer-actions"><PlaceReportLink place={row.result} from={`/check#batch-row-${index}`} /><ComparisonButton geoid={row.result.profile.geoid} /></div>
          : !busy && <div className="batch-recovery"><input aria-label={`Correct entry ${index + 1}`} value={row.input} onChange={(event) => editRow(index, event.target.value)} /><button type="button" className="button secondary" onClick={() => void process(rows, [index])}>Retry entry {index + 1}</button>{row.candidates?.map((candidate) => <button key={`${candidate.geoid}-${candidate.lon}`} type="button" className="button secondary" onClick={() => void process(rows, [index], candidate)}>{candidate.label ?? candidate.geoid}</button>)}</div>}
      </article>)}</div>
      <p className="note">Pending means a certified designation is not recorded in this dataset. Historical overlap describes a current tract, not an address-level determination. {DISCLAIMER}</p>
    </>}
    <ComparisonTray />
  </div>;
}
