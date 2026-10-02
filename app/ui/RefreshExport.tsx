"use client";
import type { ReleaseFile } from "@/lib/research/workbench";
import { RESEARCH_COLUMNS } from "@/lib/research/workbench";
import { parseFilters } from "@/lib/explore/filter";
import ExportResearch from "./ExportResearch";
export default function RefreshExport({ earlier }: { earlier: ReleaseFile }) {
  const columns = RESEARCH_COLUMNS.filter((key) => earlier.rows.some((row) => Object.hasOwn(row, key)));
  const input = { geoids: earlier.rows.map((r) => String(r.geoid)), columns, format: "json" as const, filters: parseFilters(JSON.stringify(earlier.manifest.filters ?? {})), ...(typeof earlier.manifest.state === "string" && /^\d{2}$/.test(earlier.manifest.state) ? { state: earlier.manifest.state } : {}) };
  return <section className="lab-card"><h2>Refresh the same tract selection</h2><p>Prepare a current JSON export using the earlier file’s tract IDs and supported fields. Open the downloaded file as the later export above to review values, coverage, and definition changes. Missing tracts are reported; selections are not replaced automatically.</p><ExportResearch key={JSON.stringify(input)} input={input} label="Preview current data for this selection" disabled={!input.geoids.length || !columns.length} /><p className="hint">Requires sign-in and uses the normal download allowance. Previewing does not consume a download. This compares releases of published data, not necessarily changes in real-world conditions.</p></section>;
}
