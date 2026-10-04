import { accessibleReport } from "@/lib/research/accessibleReport";
export { accessibleReport } from "@/lib/research/accessibleReport";
import { requireService } from "./serviceControl";
import { createHash } from "node:crypto";
import { zipSync, strToU8 } from "fflate";
import { csvCell, DISCLAIMER, RESEARCH_NOTICE } from "@/lib/client/presentation";
import { getTract, loadTractData } from "@/lib/data/tracts";
import { canResearchTract } from "@/lib/data/researchScope";
import { RESEARCH_SCOPE_NOTICE } from "@/lib/oz/researchScope";
import { SOURCES, type SourceId } from "@/pipeline/sources";
import { MEASURES } from "@/lib/research/measures";
import { parseResearchFile } from "@/lib/research/file";
import { authorizeFilters, searchRows } from "./search";
import { AccessError, DAY, checkBudgets, db, prune, recordBudgets, transaction } from "./store";
import { EXPORT_ALLOWANCES } from "./allowance";

export const EXPORT_COLUMNS = MEASURES.map((m) => m.column);
export const csv = (rows: unknown[][]) => "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
export interface ExportInput { state?: string; filters?: unknown; sort?: string; geoids?: string[]; columns?: string[]; format?: "zip" | "json"; limit?: number; version?: string; research?: unknown; dictionaryOnly?: boolean }
export function prepareExport(input: ExportInput) {
  const allowed = ["state", "filters", "sort", "geoids", "columns", "format", "limit", "version", "research", "dictionaryOnly"];
  if (!input || typeof input !== "object" || Object.keys(input).some((key) => !allowed.includes(key))) throw new AccessError("Unsupported export field.", 400);
  if (input.dictionaryOnly != null && typeof input.dictionaryOnly !== "boolean") throw new AccessError("Invalid dictionary export option.", 400);
  const { manifest } = loadTractData();
  if (input.version && input.version !== manifest.generated) throw new AccessError("The published dataset changed. Preview the export again.", 409);
  if (input.research) { const file = parseResearchFile(JSON.stringify(input.research)); return { version: manifest.generated, total: file.geoids.length, geoids: file.geoids, columns: [], filters: file.filters, sort: "geoid", research: file }; }
  const filters = authorizeFilters(input.filters, true); const sort = input.sort ?? "geoid";
  const columns = input.columns ?? ["population", "median_household_income", "median_home_value"];
  if (!Array.isArray(columns) || !columns.length || columns.length > 50 || columns.some((column) => !EXPORT_COLUMNS.includes(column as typeof EXPORT_COLUMNS[number])) || new Set(columns).size !== columns.length) throw new AccessError("Choose supported research columns.", 400);
  if (input.format != null && !["zip", "json"].includes(input.format)) throw new AccessError("Choose a supported download format.", 400);
  let geoids: string[];
  if (input.dictionaryOnly === true) geoids = [];
  else if (input.geoids) {
    if (!Array.isArray(input.geoids) || input.geoids.length > 500 || input.geoids.some((id) => typeof id !== "string" || !/^\d{11}$/.test(id))) throw new AccessError("Choose up to 500 valid tract identifiers.", 400);
    geoids = [...new Set(input.geoids)];
    if (geoids.some((id) => !canResearchTract(id))) throw new AccessError(RESEARCH_SCOPE_NOTICE, 403);
  } else geoids = searchRows(input.state ?? "", filters, sort).rows.map((r) => r[0]);
  const total = geoids.length;
  if (input.limit != null) { if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 500) throw new AccessError("Choose an explicit subset of 1–500 rows.", 400); geoids = geoids.slice(0, input.limit); }
  return { version: manifest.generated, total, geoids, columns, filters, sort, research: undefined };
}
export function exportRows(geoids: string[], columns: string[]) {
  return geoids.map((geoid) => {
    if (!canResearchTract(geoid)) throw new AccessError(RESEARCH_SCOPE_NOTICE, 403);
    const p = getTract(geoid); if (!p) throw new AccessError("A selected tract is unavailable. Refresh the preview.", 409);
    return { geoid, county: p.county, state: p.state, designation_2027: p.designation2027.status, eligible_2027: p.measures.eligible_2027?.value ?? null, rural_2027: p.rural.treasury, ...Object.fromEntries(columns.map((key) => [key, p.measures[key]?.value ?? null])) };
  });
}
export function buildExport(input: ExportInput, prepared: ReturnType<typeof prepareExport>) {
  if (prepared.research) return { body: Buffer.from(JSON.stringify({ ...prepared.research, savedAt: new Date().toISOString() }, null, 2)), filename: "place-research.json", mime: "application/json", rows: 0 };
  if ((!prepared.geoids.length && !input.dictionaryOnly) || prepared.geoids.length > 500) throw new AccessError("Choose 1–500 tract rows. Narrow the search or explicitly select a subset.", 400);
  const { manifest } = loadTractData();
  const rows = exportRows(prepared.geoids, prepared.columns);
  const sources = manifest.sources.map((source) => ({ ...source, url: SOURCES[source.id as SourceId]?.homepage ?? "", license: SOURCES[source.id as SourceId]?.license ?? "See original source" }));
  const baseFields = [
    { name: "geoid", unit: "text", description: "11-character Census tract identifier; retain leading zeros.", source: "Census Bureau" },
    { name: "county", unit: "text", description: "County name associated with the tract.", source: "Census Bureau" },
    { name: "state", unit: "text", description: "State associated with the tract.", source: "Census Bureau" },
    { name: "designation_2027", unit: "category", description: "Published certification status; eligibility alone does not establish designation.", source: "U.S. Treasury" },
    { name: "eligible_2027", unit: "boolean", description: "Eligibility under the published 2027 screening rules.", source: "U.S. Treasury" },
    { name: "rural_2027", unit: "boolean", description: "Rural classification under the Treasury methodology.", source: "U.S. Treasury" },
  ];
  const dictionary = [...baseFields, ...prepared.columns.map((key) => ({ ...manifest.columns.find((c) => c.name === key), name: key }))].map((field) => ({ ...field, null: "Not available; never zero", geography: "Census tract", vintage: "See the matching source in sources.csv or sources; dataset build time is not the observation date.", uncertainty: "Consult source margin-of-error tables for estimates; differences have not been tested for statistical significance." }));
  const text = JSON.stringify(rows);
  const columns = [...baseFields.map((f) => f.name), ...prepared.columns];
  const metadata = { schemaVersion: 1, datasetVersion: prepared.version, boundaryVintage: "2020 tracts; Connecticut planning-region identifiers", exportedAt: new Date().toISOString(), rows: rows.length, columns, state: input.state ?? null, filters: prepared.filters, sort: input.geoids ? "Explicit user selection order" : prepared.sort, explicitlyLimitedTo: input.limit ?? null, sha256OfRowsJson: createHash("sha256").update(text).digest("hex"), disclaimer: DISCLAIMER, scope: RESEARCH_NOTICE };
  const readme = `Opportunity Zone Research\n${DISCLAIMER}\n${RESEARCH_NOTICE}\n\nIndependent site; not affiliated with U.S. Treasury. Verify source records before relying on these facts.\nGEOIDs are 11-character text identifiers: import the GEOID column as Text in Excel to retain leading zeros. JSON preserves identifiers as strings. CSV numbers are unformatted; nulls are empty. Percentages are fractions (0.1 = 10%). Negative numeric values remain numeric.\nTract estimates do not value a property. Eligibility and certified designation are distinct. Source vintages differ. No exact searched addresses or coordinates are included.\nSources retain their published licenses. Lawful commercial analysis is welcome; retain attribution. Unlawful discriminatory housing targeting is prohibited.\n`;
  if (input.format === "json") return { body: Buffer.from(JSON.stringify({ manifest: metadata, rows, dictionary, sources, readme }, null, 2)), filename: input.dictionaryOnly ? "research-dictionary.json" : "area-research.json", mime: "application/json", rows: rows.length };
  const files: Record<string, Uint8Array> = { "areas.csv": strToU8(csv([columns, ...rows.map((row) => columns.map((c) => (row as Record<string, unknown>)[c]))])), "data-dictionary.csv": strToU8(csv([["field", "unit", "description", "source", "geography", "vintage", "missing", "uncertainty"], ...dictionary.map((d) => [d.name, d.unit, d.description, d.source, d.geography, d.vintage, d.null, d.uncertainty])])), "sources.csv": strToU8(csv([["id", "publisher", "vintage", "geography", "url", "license", "attribution"], ...sources.map((s) => [s.id, s.publisher, s.vintage, s.geography, s.url, s.license, s.attribution])])), "manifest.json": strToU8(JSON.stringify(metadata, null, 2)), "README.txt": strToU8(readme) };
  if (input.dictionaryOnly) delete files["areas.csv"];
  else files["report.html"] = strToU8(accessibleReport(rows, columns, prepared.version, sources));
  if (Object.values(files).reduce((sum, bytes) => sum + bytes.length, 0) > 10_000_000) throw new AccessError("This export exceeds 10 MB. Select fewer rows or columns.", 400);
  return { body: Buffer.from(zipSync(files)), filename: input.dictionaryOnly ? "research-dictionary.zip" : "area-research.zip", mime: "application/zip", rows: rows.length };
}
export function exportBudgets(account: string, rows: number, research: boolean, browser?: string) {
  return [account, ...(browser ? [browser] : [])].flatMap((subject) => research
    ? [{ subject, action: "research-files", limit: 20, window: DAY, amount: 1 }]
    : EXPORT_ALLOWANCES.map((rule) => ({ subject, action: rule.action, limit: rule.limit, window: rule.window, amount: rule.action === "export-rows" ? rows : 1 })));
}
/** Synchronous bounded generation under a transaction serializes reservations across local server processes. */
export async function generateExport(account: string, id: string, input: ExportInput, browser?: string) {
  await requireService("exports");
  if (!/^[\w-]{16,80}$/.test(id)) throw new AccessError("A valid retry identifier is required.", 400);
  // Invalidate old retry artifacts created under the previous all-tract scope.
  const fingerprint = createHash("sha256").update("oz-scope-v1:" + JSON.stringify(input)).digest("hex");
  const store = db(); const now = Date.now();
  return (await transaction(store, async () => {
    (await prune(store, now));
    (await store.prepare("DELETE FROM exports WHERE id=? AND at<=?").run(id, now - 3_600_000));
    const existing = (await store.prepare("SELECT * FROM exports WHERE id=?").get(id)) as { account: string; fingerprint: string; body: Uint8Array; filename: string; mime: string } | undefined;
    if (existing) { if (existing.account !== account || existing.fingerprint !== fingerprint) throw new AccessError("This retry identifier belongs to another request.", 409); return existing; }
    const prepared = prepareExport(input);
    const budgets = exportBudgets(account, prepared.research ? 0 : prepared.geoids.length, !!prepared.research, browser);
    (await checkBudgets(store, budgets, now));
    (await checkBudgets(store, [{ subject: "service", action: "exports", limit: 100, window: DAY }], now));
    const result = buildExport(input, prepared);
    if (result.body.length > 10_000_000) throw new AccessError("Export exceeds 10 MB.", 400);
    (await store.prepare("INSERT INTO exports(id,account,fingerprint,at,filename,mime,body,rows) VALUES(?,?,?,?,?,?,?,?)").run(id, account, fingerprint, now, result.filename, result.mime, result.body, result.rows));
    (await recordBudgets(store, [...budgets, { subject: "service", action: "exports", limit: 100, window: DAY }], now));
    return result;
  }));
}
