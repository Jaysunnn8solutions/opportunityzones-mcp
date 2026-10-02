import { FLAGS } from "@/lib/data/flags";
import { displayValue } from "@/lib/client/presentation";
import { NEIGHBOR_MEASURES, TRACT_MEASURES, type ExploreRow, type ExploreState } from "./measures";
import { TIERS, explicitTier, FORECAST_FILTER_UNAVAILABLE, type Filters, type DesignationFlag } from "./filter";

export interface CriterionEvidence { id: string; label: string; requirement: string; actual: string; result: "Meets" | "Does not meet" | "Unknown" }
const LABELS: Record<DesignationFlag, string> = { eligible: "2027 eligible", zone2027: "2027 designated", oz2018: "2018 overlap ≥50%", qct: "HUD QCT", dda: "HUD DDA overlap", nmtc: "NMTC" };
export const FLAG_COLUMNS: Record<DesignationFlag, string> = { eligible: "eligible_2027", zone2027: "designated_2027", oz2018: "oz2018_population_share", qct: "qct_2026", dda: "dda_2026", nmtc: "nmtc_lic" };

/** Compile the statewide cutoffs once; filtering and explanations use identical evidence. */
export function compileCriteria(data: ExploreState, filters: Filters) {
  const neighborTests = NEIGHBOR_MEASURES.flatMap((m) => {
    const tier = filters.tiers[m.column];
    if (!tier) return [];
    const col = data.measures.indexOf(m.column);
    const values = col < 0 ? [] : data.rows.map((r) => r[col + 2]).filter((v): v is number => typeof v === "number" && Number.isFinite(v)).sort((a, b) => a - b);
    const band = TIERS[explicitTier(m.column, tier)];
    const higher = band.direction === "higher";
    const k = Math.max(1, Math.ceil(values.length * band.share));
    const cutoff = values.length ? values[higher ? values.length - k : k - 1] : null;
    return [{ m, band, higher, col, cutoff, count: values.length }];
  });
  return (row: ExploreRow): CriterionEvidence[] => {
    const facts = data.tracts?.[row[0]];
    const evidence: CriterionEvidence[] = [];
    if (filters.eligibilityChange === "2018-ineligible2027") {
      const overlap = facts?.programs?.oz2018_population_share;
      const eligible = facts?.programs?.eligible_2027;
      const knownStatus = eligible === 0 || eligible === 1;
      const knownOverlap = typeof overlap === "number" && Number.isFinite(overlap);
      const fails = knownOverlap && overlap < .5 || eligible === 1;
      evidence.push({ id: "eligibilityChange", label: "Eligibility change", requirement: "2018 population overlap ≥50% AND published 2027 eligibility = no",
        actual: `2018 overlap: ${knownOverlap ? `${(overlap * 100).toFixed(1)}%` : "unknown"}; 2027 eligible: ${knownStatus ? eligible === 1 ? "yes" : "no" : "unknown"}`,
        result: fails ? "Does not meet" : knownStatus && knownOverlap ? "Meets" : "Unknown" });
    } else if (filters.eligibilityChange === "2027-ineligible2037") {
      evidence.push({ id: "eligibilityChange", label: "2037 eligibility outlook", requirement: "2027 eligible and validated forecast of 2037 ineligibility", actual: FORECAST_FILTER_UNAVAILABLE, result: "Unknown" });
    }
    if (filters.county) evidence.push({ id: "county", label: "County", requirement: filters.county, actual: `${facts?.county ?? "County"} (${row[0].slice(0, 5)})`, result: row[0].startsWith(filters.county) ? "Meets" : "Does not meet" });
    if (filters.flags.length) {
      const flags = filters.flags.map((flag) => {
        const raw = facts?.programs?.[FLAG_COLUMNS[flag]];
        const known = facts?.programs ? raw != null : !(flag === "zone2027" && (row[1] & FLAGS.zone2027Pending));
        return { flag, pass: known ? !!(row[1] & FLAGS[flag]) : null };
      });
      const pass = filters.mode === "all" ? flags.every((f) => f.pass === true) : flags.some((f) => f.pass === true);
      const fail = filters.mode === "all" ? flags.some((f) => f.pass === false) : flags.every((f) => f.pass === false);
      evidence.push({ id: "flags", label: "Program criteria", requirement: `${filters.mode === "all" ? "All" : "At least one"}: ${flags.map((f) => LABELS[f.flag]).join(", ")}`, actual: flags.map((f) => `${LABELS[f.flag]}: ${f.pass == null ? "unknown" : f.pass ? "yes" : "no"}`).join("; "), result: pass ? "Meets" : fail ? "Does not meet" : "Unknown" });
    }
    if (filters.rural) evidence.push({ id: "rural", label: "Rural classification", requirement: filters.rural === "rural" ? "Rural" : "Not rural", actual: facts?.rural == null ? "Unavailable" : facts.rural ? "Rural" : "Not rural", result: facts?.rural == null ? "Unknown" : facts.rural === (filters.rural === "rural") ? "Meets" : "Does not meet" });
    for (const m of TRACT_MEASURES) {
      const range = filters.ranges?.[m.column];
      if (!range || (range.min == null && range.max == null)) continue;
      const value = facts?.values[m.column];
      evidence.push({ id: `range:${m.column}`, label: m.label, requirement: [range.min == null ? null : `≥ ${displayValue(range.min, m.format)}`, range.max == null ? null : `≤ ${displayValue(range.max, m.format)}`].filter(Boolean).join(" and "), actual: displayValue(value, m.format), result: value == null ? "Unknown" : (range.min != null && value < range.min) || (range.max != null && value > range.max) ? "Does not meet" : "Meets" });
    }
    for (const { m, band, higher, col, cutoff, count } of neighborTests) {
      const raw = col < 0 ? null : row[col + 2];
      const value = typeof raw === "number" ? raw : null;
      evidence.push({ id: `tier:${m.column}`, label: m.label, requirement: `${higher ? "Higher" : "Lower"} ${band.share * 100}% of ${count.toLocaleString("en-US")} state tracts with data${cutoff == null ? "" : ` (${higher ? "≥" : "≤"} ${displayValue(cutoff, m.format)}; ties included)`}`, actual: displayValue(value, m.format), result: value == null || cutoff == null ? "Unknown" : (higher ? value >= cutoff : value <= cutoff) ? "Meets" : "Does not meet" });
    }
    return evidence;
  };
}

export function criteriaDiagnostics(data: ExploreState, filters: Filters, include: (row: ExploreRow) => boolean = () => true) {
  const evaluate = compileCriteria(data, filters);
  const rows = data.rows.filter(include).map(evaluate);
  return (rows[0] ?? []).map((criterion, index) => ({ ...criterion,
    excluded: rows.filter((r) => r[index].result === "Does not meet").length,
    unknown: rows.filter((r) => r[index].result === "Unknown").length,
    without: rows.filter((r) => r.every((e, i) => i === index || e.result === "Meets")).length,
  }));
}
export function removeCriterion(filters: Filters, id: string): Filters {
  if (id === "eligibilityChange") { const next = { ...filters }; delete next.eligibilityChange; return next; }
  if (id === "flags") return { ...filters, flags: [] };
  if (id === "rural") return { ...filters, rural: "" };
  if (id === "county") return { ...filters, county: "" };
  const [kind, key] = id.split(":");
  if (kind === "tier") { const tiers = { ...filters.tiers }; delete tiers[key]; return { ...filters, tiers }; }
  const ranges = { ...filters.ranges }; delete ranges[key]; return { ...filters, ranges };
}
