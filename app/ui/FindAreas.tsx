"use client";

import { useState } from "react";
import { MAP_LAYERS } from "@/lib/content/mapLayers";
import { filtersActive, NO_FILTERS, TIERS, type DesignationFlag, type Filters, type Tier } from "@/lib/explore/filter";
import { NEIGHBOR_MEASURES } from "@/lib/explore/measures";

const DESIGNATIONS: Array<[DesignationFlag, string]> = [
  ["eligible", "2027 eligible"],
  ["zone2027", "2027 zone"],
  ["oz2018", "2018 zone"],
  ["qct", "HUD QCT"],
  ["dda", "HUD DDA"],
  ["nmtc", "NMTC"],
];

/**
 * The map's Find areas panel: combine designations, and filter on what the
 * neighbouring tracts look like. It narrows the map to places matching the
 * chosen facts; it does not rank or recommend them.
 */
export function FindAreas({ filters, onChange, matches, busy }: { filters: Filters; onChange: (f: Filters) => void; matches: number | null; busy: boolean }) {
  const active = filtersActive(filters);
  // Open or closed is the reader's choice; clearing the filters does not close it.
  const [open, setOpen] = useState(active);
  const toggle = (k: DesignationFlag) =>
    onChange({ ...filters, flags: filters.flags.includes(k) ? filters.flags.filter((x) => x !== k) : [...filters.flags, k] });
  return (
    <details className="find-areas" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        Find areas{active && matches != null && <span className="find-count"> · {matches.toLocaleString("en-US")} tracts match</span>}
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
              <input type="radio" name="find-mode" checked={filters.mode === "all"} onChange={() => onChange({ ...filters, mode: "all" })} /> All of these
            </label>
            <label>
              <input type="radio" name="find-mode" checked={filters.mode === "any"} onChange={() => onChange({ ...filters, mode: "any" })} /> Any of these
            </label>
          </div>
        )}
      </fieldset>
      <fieldset>
        <legend>Surroundings (neighbouring tracts)</legend>
        {NEIGHBOR_MEASURES.map((m) => (
          <label key={m.column} className="find-select">
            <span>{m.label}</span>
            <select
              value={filters.tiers[m.column] ?? ""}
              onChange={(e) => onChange({ ...filters, tiers: { ...filters.tiers, [m.column]: (e.target.value || undefined) as Tier | undefined } })}
            >
              <option value="">Any</option>
              {(Object.keys(TIERS) as Tier[]).map((t) => (
                <option key={t} value={t}>
                  {TIERS[t].label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </fieldset>
      <p className="find-status" aria-live="polite">
        {!active
          ? "Choose designations or surroundings to narrow the map."
          : busy
            ? "Finding matches…"
            : matches == null
              ? "Zoom in to a state to see matching tracts."
              : `${matches.toLocaleString("en-US")} tracts match in the states shown. Matches are outlined; others are faded.`}
      </p>
      {active && (
        <button type="button" className="button secondary" onClick={() => onChange(NO_FILTERS)}>
          Clear filters
        </button>
      )}
      <p className="hint">
        Neighbours are the tracts sharing a boundary within the same state; their figures (2020-2024 ACS) are averaged, weighted
        by population. Rankings are within each state. This narrows the map by facts about places; it does not recommend any.{" "}
        <a href="/map-layers#find-areas" target="_blank" rel="noopener">
          How this works ↗
        </a>
      </p>
    </details>
  );
}
