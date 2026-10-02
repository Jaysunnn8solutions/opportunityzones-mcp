/** Local read-only release audit. No provider calls, credentials, or account records. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { loadTractData } from "../lib/data/tracts";
import { SOURCES, type SourceId } from "../pipeline/sources";
import { LEGAL_OPERATOR, TERMS_VERSION } from "../lib/content/siteTerms";
import { loadIndicatorArtifact } from "../lib/data/indicators";
const { manifest, payload } = loadTractData();
const eligibility = { eligible: payload.geoids.filter((_, index) => payload.columns.get("eligible_2027")?.get(index) === 1).length, eligibleRural: payload.geoids.filter((_, index) => payload.columns.get("eligible_2027")?.get(index) === 1 && payload.columns.get("rural_2027")?.get(index) === 1).length };
const problems: string[] = [];
const indicators = loadIndicatorArtifact();
if (indicators.status !== "available") problems.push(`Historical indicator artifact is ${indicators.status}.`);
if (manifest.tracts !== payload.count) problems.push("Manifest tract count differs from payload.");
if (new Set(payload.geoids).size !== payload.count || payload.geoids.some((id) => !/^\d{11}$/.test(id))) problems.push("Invalid or duplicate tract identifiers.");
for (const column of manifest.columns) {
  const source = SOURCES[column.source as SourceId];
  if (!source?.license || !source.attribution || !source.homepage.startsWith("https://")) problems.push(`Source registration incomplete: ${column.source}.`);
  const values = payload.columns.get(column.name);
  if (!values) { problems.push(`Column missing: ${column.name}.`); continue; }
  for (let index = 0; index < payload.count; index++) { const value = values.get(index); if (value != null && !Number.isFinite(value)) { problems.push(`Non-finite published value: ${column.name}.`); break; } }
}
const files = ["data/tracts.bin", "data/manifest.json", "data/lookups.json", "data/research-crosswalk.json", "data/research-legal-history.json", "data/research-indicators.json", "pipeline/sources.ts", ...readdirSync("legal/text").filter((name) => name.endsWith(".txt")).map((name) => `legal/text/${name}`)];
const hashes = Object.fromEntries(files.map((file) => [file, createHash("sha256").update(readFileSync(file)).digest("hex")]));
const report = {
  checked: new Date().toISOString(), datasetBuilt: manifest.generated,
  tracts: payload.count, columns: manifest.columns.length,
  sources: manifest.sources.map((source) => ({ id: source.id, vintage: source.vintage, publisher: source.publisher, license: SOURCES[source.id as SourceId]?.license ?? null, officialUrl: SOURCES[source.id as SourceId]?.homepage ?? null })),
  indicators: { status: indicators.status, histories: Object.keys(indicators.data?.histories ?? {}).length, models: indicators.data?.models.length ?? 0 },
  problems, terms: TERMS_VERSION, operatorDetailsComplete: Object.values(LEGAL_OPERATOR).every(Boolean), hashes,
  limitations: [
    "Local consistency and registered attribution checks only; source dates are reported, not asserted current.",
    "Hashes detect changes relative to a separately reviewed manifest; they do not prove agency authenticity.",
    "Appropriate operator/contact disclosures, document accuracy, hosting verification, real-device accessibility, and supported-client tests remain manual checks. Paid attorney review was declined; no legal clearance is implied.",
  ],
};
mkdirSync(".runtime", { recursive: true });
writeFileSync(path.join(".runtime", "release-audit.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ tracts: report.tracts, columns: report.columns, sources: report.sources.length, eligibility, indicators: report.indicators, problems, operatorDetailsComplete: report.operatorDetailsComplete, report: ".runtime/release-audit.json" }, null, 2));
if (problems.length) process.exitCode = 1;
