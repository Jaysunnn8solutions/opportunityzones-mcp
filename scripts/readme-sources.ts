/**
 * Regenerate the data-source table in README.md from pipeline/sources.ts, so
 * what the README says about the product's inputs cannot drift from what the
 * code uses. tests/readme.test.ts fails if the README is out of date.
 *
 *   npx tsx scripts/readme-sources.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SOURCES } from "../pipeline/sources";

export const START = "<!-- sources:start -->";
export const END = "<!-- sources:end -->";

const ACCESS: Record<string, string> = { "api-runtime": "live", "api-pipeline": "offline (API)", "file-pipeline": "offline (file)" };

export function sourcesTable(): string {
  const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
  const rows = Object.values(SOURCES).map(
    (s) =>
      `| [${cell(s.name)}](${s.homepage}) | ${cell(s.publisher)} | ${s.purposes.join(", ")} | ${s.access.map((a) => ACCESS[a]).join(", ")} | ${cell(s.license)} |`
  );
  return ["| Source | Publisher | Purpose | Access | License |", "|---|---|---|---|---|", ...rows].join("\n");
}

export function withTable(readme: string): string {
  const a = readme.indexOf(START);
  const b = readme.indexOf(END);
  if (a < 0 || b < a) throw new Error(`README.md lacks the ${START} / ${END} markers`);
  return `${readme.slice(0, a + START.length)}\n${sourcesTable()}\n${readme.slice(b)}`;
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  const file = path.resolve(import.meta.dirname, "..", "README.md");
  writeFileSync(file, withTable(readFileSync(file, "utf8")));
  console.log("README.md source table regenerated");
}
