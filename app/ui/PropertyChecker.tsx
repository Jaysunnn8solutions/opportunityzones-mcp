"use client";

/**
 * Many places at once: addresses or tract GEOIDs in, one row of status each.
 *
 * Privacy: the list lives only in this component's state. Each address goes
 * once to /api/geocode in a POST body (never a URL); tract profiles are public
 * data fetched by GEOID. Nothing is stored; "Download CSV" is built in the
 * browser.
 */

import Link from "next/link";
import { useState } from "react";

const MAX_LINES = 25;
const GEOID = /^\d{11}$/;

interface Profile {
  geoid: string;
  state: string | null;
  county: string | null;
  measures: Record<string, { value: number | null }>;
  rural: { treasury: boolean | null };
  designation2027: { status: "designated" | "not-designated" | "pending" | "not-eligible" | "unknown"; stateEligible: number; stateCap: number };
}

interface Row {
  input: string;
  state: "waiting" | "working" | "done" | "no-match" | "error";
  matched?: string | null;
  profile?: Profile;
}

const yesNo = (v: boolean | null | undefined) => (v == null ? "n/a" : v ? "Yes" : "No");

function zone2018(p: Profile): string {
  const s = p.measures.oz2018_population_share?.value;
  if (s == null) return "n/a";
  if (s >= 0.999) return "Yes";
  if (s > 0) return `Partly (${Math.round(s * 100)}%)`;
  return "No";
}

function round2027(p: Profile): string {
  const d = p.designation2027;
  if (d.status === "designated") return "Designated 2027 zone";
  if (d.status === "not-designated") return "Eligible, not designated";
  if (d.status === "pending") return `Eligible, pending (state may pick ${d.stateCap.toLocaleString("en-US")} of ${d.stateEligible.toLocaleString("en-US")})`;
  if (d.status === "not-eligible") return "Not eligible";
  return "Unknown";
}

async function lookup(input: string): Promise<Pick<Row, "state" | "matched" | "profile">> {
  let geoid = input.replace(/\s/g, "");
  let matched: string | null = null;
  if (!GEOID.test(geoid)) {
    if (input.length < 5 || input.length > 200) return { state: "no-match" };
    const res = await fetch("/api/geocode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: input }),
    });
    // The input is validated above, so any failure here is the lookup, not the address.
    if (!res.ok) return { state: "error" };
    const { matches } = (await res.json()) as { matches: Array<{ geoid: string; label: string | null }> };
    if (!matches.length) return { state: "no-match" };
    geoid = matches[0].geoid;
    matched = matches[0].label;
  }
  const r = await fetch(`/api/tract/${geoid}`);
  if (r.status === 404) return { state: "no-match", matched };
  if (!r.ok) return { state: "error", matched };
  return { state: "done", matched, profile: (await r.json()) as Profile };
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export default function PropertyChecker() {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    const inputs = lines.slice(0, MAX_LINES);
    const next: Row[] = inputs.map((input) => ({ input, state: "waiting" }));
    setRows(next);
    setBusy(true);
    // One at a time: kind to the Census Geocoder, and rows fill in as they resolve.
    for (let i = 0; i < inputs.length; i++) {
      next[i] = { ...next[i], state: "working" };
      setRows([...next]);
      try {
        next[i] = { ...next[i], ...(await lookup(inputs[i])) };
      } catch {
        next[i] = { ...next[i], state: "error" };
      }
      setRows([...next]);
    }
    setBusy(false);
  }

  function download() {
    const header = ["input", "matched_address", "tract", "county", "state", "zone_2018", "eligible_2027", "designation_2027", "rural_2027"];
    const body = rows.map((r) => {
      const p = r.profile;
      return [
        r.input,
        r.matched ?? "",
        p?.geoid ?? "",
        p?.county ?? "",
        p?.state ?? "",
        p ? zone2018(p) : r.state,
        p ? yesNo(p.measures.eligible_2027?.value == null ? null : p.measures.eligible_2027.value === 1) : "",
        p ? round2027(p) : "",
        p ? yesNo(p.rural.treasury) : "",
      ];
    });
    const csv = [header, ...body].map((r) => r.map(csvCell).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "opportunity-zone-check.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const done = rows.filter((r) => r.state !== "waiting" && r.state !== "working").length;

  return (
    <div className="checker">
      <form onSubmit={run}>
        <label htmlFor="places">Addresses or tract numbers, one per line (up to {MAX_LINES})</label>
        <textarea
          id="places"
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"55 Trinity Ave SW, Atlanta, GA 30303\n13121003500"}
          autoComplete="off"
          spellCheck={false}
        />
        <div className="checker-actions">
          <button type="submit" disabled={busy || lines.length === 0}>
            {busy ? `Checking ${done + 1} of ${rows.length}...` : `Check ${Math.min(lines.length, MAX_LINES) || ""} ${lines.length === 1 ? "place" : "places"}`}
          </button>
          {lines.length > MAX_LINES && <span className="error">Only the first {MAX_LINES} lines are checked.</span>}
          {rows.length > 0 && !busy && (
            <button type="button" className="secondary" onClick={download}>
              Download CSV
            </button>
          )}
        </div>
      </form>

      {rows.length > 0 && (
        <div className="table-wrap">
          <table className="results">
            <thead>
              <tr>
                <th>Input</th>
                <th>Tract</th>
                <th>2018 zone</th>
                <th>2027 round</th>
                <th>Rural (2027)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${i}-${r.input}`}>
                  <td>
                    {r.input}
                    {r.matched && r.matched.toUpperCase() !== r.input.toUpperCase() && <div className="hint">Matched: {r.matched}</div>}
                  </td>
                  {r.profile ? (
                    <>
                      <td>
                        <Link href={`/tract/${r.profile.geoid}`}>{r.profile.geoid}</Link>
                        <div className="hint">
                          {r.profile.county}, {r.profile.state}
                        </div>
                      </td>
                      <td>{zone2018(r.profile)}</td>
                      <td>{round2027(r.profile)}</td>
                      <td>{yesNo(r.profile.rural.treasury)}</td>
                    </>
                  ) : (
                    <td colSpan={4} className="hint">
                      {r.state === "waiting" && "Waiting"}
                      {r.state === "working" && "Looking up..."}
                      {r.state === "no-match" && "No match. Try the full street address with city, state and ZIP, or an 11-digit tract number."}
                      {r.state === "error" && "Lookup unavailable right now; try again."}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 0 && !busy && (
        <p className="hint">
          &quot;Pending&quot; means eligible for 2027, with the state&apos;s list of designations not yet published. A 2018 zone
          remains in effect through 2028.
        </p>
      )}
    </div>
  );
}
