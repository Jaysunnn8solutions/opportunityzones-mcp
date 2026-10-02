import { MAX_COMPARISON_TRACTS } from "./comparisonLimits";
import { parseFilters, type Filters } from "@/lib/explore/filter";
import { FOCUSES, MEASURES, type Focus, type MeasureKey } from "./measures";
import { STATE_FIPS } from "@/lib/geo/states";

export interface ResearchFile { format: "opportunity-zone-research"; version: 1; savedAt: string; geoids: string[]; state: string; filters: Filters; focus: Focus; measures: MeasureKey[] }
/** Only allowlisted public selections survive parsing. Never hydrate personal inputs or embedded facts. */
export function parseResearchFile(text: string): ResearchFile {
  if (text.length > 64_000) throw new Error("This research file is too large (maximum 64 KB).");
  let v;
  try { v = JSON.parse(text); } catch { throw new Error("Choose a valid research JSON file."); }
  if (!v || v.format !== "opportunity-zone-research" || v.version !== 1) throw new Error("This file uses an unsupported research format.");
  if (!Array.isArray(v.geoids) || !v.geoids.length || v.geoids.length > MAX_COMPARISON_TRACTS || v.geoids.some((g: unknown) => typeof g !== "string" || !/^\d{11}$/.test(g))) throw new Error("The file must contain one to 25 valid tract numbers.");
  if (!Object.hasOwn(FOCUSES, v.focus) || !Array.isArray(v.measures) || !v.measures.length || v.measures.some((k: unknown) => !MEASURES.some((m) => m.column === k))) throw new Error("The research focus or measures are not supported.");
  if (typeof v.state !== "string" || (v.state !== "" && !Object.values(STATE_FIPS).includes(v.state))) throw new Error("The search state is invalid.");
  if (!v.filters || typeof v.filters !== "object" || Array.isArray(v.filters) || !Array.isArray(v.filters.flags) || !["all", "any"].includes(v.filters.mode) || !v.filters.tiers || typeof v.filters.tiers !== "object" || JSON.stringify(v.filters).length > 4000) throw new Error("The saved screening criteria are invalid.");
  return { format: "opportunity-zone-research", version: 1, savedAt: typeof v.savedAt === "string" && Number.isFinite(Date.parse(v.savedAt)) ? new Date(v.savedAt).toISOString() : "", geoids: [...new Set<string>(v.geoids)], state: v.state, filters: parseFilters(JSON.stringify(v.filters)), focus: v.focus, measures: [...new Set<MeasureKey>(v.measures)] };
}
