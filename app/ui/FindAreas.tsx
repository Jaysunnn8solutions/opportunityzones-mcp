"use client";

import { useAccount } from "./AccountAccess";
import { useId, useState, type ReactNode } from "react";
import { MAP_LAYERS } from "@/lib/content/mapLayers";
import { explicitTier, filtersActive, FORECAST_FILTER_UNAVAILABLE, NO_FILTERS, TIERS, type DesignationFlag, type Filters, type Tier, type ExplicitTier } from "@/lib/explore/filter";
import { NEIGHBOR_MEASURES, TRACT_MEASURES } from "@/lib/explore/measures";

const DESIGNATIONS: Array<[DesignationFlag, string]> = [
  ["eligible", "2027 eligible"],
  ["zone2027", "2027 zone"],
  ["oz2018", "2018 zone overlap ≥50%"],
  ["qct", "HUD QCT"],
  ["dda", "HUD DDA"],
  ["nmtc", "NMTC"],
];

/**
 * The map's Find areas panel: combine designations, and filter on what the
 * neighboring tracts look like. It narrows the map to places matching the
 * chosen facts; it does not rank or recommend them.
 */
export function FindAreas({ filters, onChange, matches, busy, children, scopeLabel = "in the selected state" }: { filters: Filters; onChange: (f: Filters) => void; matches: number | null; busy: boolean; children?: ReactNode; scopeLabel?: string }) {
  const { account, open: openAccount } = useAccount();
  const active = filtersActive(filters);
  const groupId = useId();
  const accountNotice = !account.member && <p className="hint">Numeric ranges and neighboring-area filters are available with a <button type="button" className="link" onClick={openAccount}>free research account</button>.</p>;
  // Open or closed is the reader's choice; clearing the filters does not close it.
  const [open, setOpen] = useState(true);
  const toggle = (k: DesignationFlag) =>
    onChange({ ...filters, flags: filters.flags.includes(k) ? filters.flags.filter((x) => x !== k) : [...filters.flags, k] });
  return (
    <details className="find-areas" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        Filter places{active && matches != null && <span className="find-count"> · {matches.toLocaleString("en-US")} matches</span>}
      </summary>
      <fieldset>
        <legend>Designations</legend>
        <div className="find-checks">
          {DESIGNATIONS.map(([k, label]) => (
            <label key={k} title={MAP_LAYERS[k].short}>
              <input type="checkbox" checked={filters.flags.includes(k)} onChange={() => toggle(k)} /> {label}
            </label>
          ))}
        </div>
        {filters.flags.length > 1 && (
          <div className="find-mode" role="radiogroup" aria-label="How to combine">
            <label>
              <input type="radio" name={`${groupId}-mode`} checked={filters.mode === "all"} onChange={() => onChange({ ...filters, mode: "all" })} /> All of these
            </label>
            <label>
              <input type="radio" name={`${groupId}-mode`} checked={filters.mode === "any"} onChange={() => onChange({ ...filters, mode: "any" })} /> Any of these
            </label>
          </div>
        )}
      </fieldset>
      <fieldset>
        <legend>Eligibility changes</legend>
        <label className="find-select"><span>Compare program rounds</span><select aria-describedby={`${groupId}-eligibility-help ${groupId}-forecast-help`} value={filters.eligibilityChange ?? ""} onChange={(event) => onChange({ ...filters, eligibilityChange: event.target.value as Filters["eligibilityChange"] })}>
          <option value="">Any eligibility history</option>
          <option value="2018-ineligible2027">2018 overlap · not eligible for 2027</option>
          <option value="2027-ineligible2037" disabled>2027 eligible · likely ineligible in 2037 — unavailable</option>
        </select></label>
        <p className="hint" id={`${groupId}-eligibility-help`}>The 2018 filter requires at least 50% population overlap with 2018 zones and a published “not eligible” status for 2027. Works nationwide or within your chosen geography. Unknown eligibility is excluded. This does not mean an existing designation was revoked.</p>
        <p className="hint" id={`${groupId}-forecast-help`}>{FORECAST_FILTER_UNAVAILABLE}</p>
        {filters.eligibilityChange === "2018-ineligible2027" && filters.flags.includes("eligible") && filters.mode === "all" && <p className="hint" role="status">“2027 eligible” above conflicts with this filter. Uncheck it to find historical zones that are not eligible for 2027.</p>}
      </fieldset>
      {children}
      <fieldset>
        <legend>Rural classification</legend>
        <label className="find-select"><span>2027 rural status</span><select value={filters.rural ?? ""} onChange={(event) => onChange({ ...filters, rural: event.target.value as Filters["rural"] })}><option value="">Any</option><option value="rural">Rural</option><option value="not-rural">Not rural</option></select></label>
      </fieldset>
      {accountNotice}
      <fieldset disabled={!account.member}>
        <legend>This tract · 2020–2024 ACS</legend>
        {TRACT_MEASURES.map((measure) => <div className="range-filter" key={measure.column}><span>{measure.label}{measure.format === "usd" ? " ($)" : ""}</span><div>{(["min", "max"] as const).map((side) => <input key={side} type="number" min="0" step="1" aria-label={`${measure.label} ${side === "min" ? "minimum" : "maximum"}`} placeholder={side === "min" ? "Min" : "Max"} value={filters.ranges?.[measure.column]?.[side] ?? ""} onChange={(event) => onChange({ ...filters, ranges: { ...filters.ranges, [measure.column]: { ...filters.ranges?.[measure.column], [side]: event.target.value === "" ? undefined : Math.max(0, Number(event.target.value)) } } })} />)}</div></div>)}
      </fieldset>
      <details className="neighbor-filters">
        <summary>Neighboring tracts · optional{Object.values(filters.tiers).filter(Boolean).length > 0 ? ` · ${Object.values(filters.tiers).filter(Boolean).length} active` : ""}</summary>
      {accountNotice}
      <fieldset disabled={!account.member}>
        <legend>Surroundings (neighboring tracts)</legend>
        {NEIGHBOR_MEASURES.map((m) => (
          <label key={m.column} className="find-select">
            <span>{m.label}<small>Choose either end of the published values</small></span>
            <select
              value={filters.tiers[m.column] ? explicitTier(m.column, filters.tiers[m.column]!) : ""}
              onChange={(e) => onChange({ ...filters, tiers: { ...filters.tiers, [m.column]: (e.target.value || undefined) as Tier | undefined } })}
            >
              <option value="">Any</option>
              {(Object.keys(TIERS) as ExplicitTier[]).map((t) => (
                <option key={t} value={t}>
                  {TIERS[t].label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </fieldset>
      <p className="hint">Neighbors share a boundary within the same state. Their 2020–2024 ACS figures are averaged by population; comparisons are within that state.</p>
      </details>
      <p className="find-status" aria-live="polite">
        {!active
          ? "Choose status or published measures to narrow the results."
          : busy
            ? "Finding matches…"
            : matches == null
              ? "Matching results are not available yet."
              : `${matches.toLocaleString("en-US")} tracts match ${scopeLabel}. Only matching tracts are shown on the map.`}
      </p>
      {active && (
        <button type="button" className="button secondary" onClick={() => onChange(NO_FILTERS)}>
          Clear filters
        </button>
      )}
      <p className="hint">
        Filters describe places; they do not recommend any. Missing required measures are excluded.{" "}
        <a href="/map-layers#find-areas" target="_blank" rel="noopener">
          How this works ↗
        </a>
      </p>
    </details>
  );
}
