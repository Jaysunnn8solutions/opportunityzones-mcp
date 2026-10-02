/** Publish existing, license-registered local inputs. No provider requests or keys. */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { createHash } from "node:crypto";
import { parseDelimited } from "../pipeline/lib/table";
import legalSources from "../legal/sources.json";
import { RULES } from "../lib/content/rules";

export function publishResearchContext(includeCrosswalk = true) {
const root = process.cwd(); const data = path.join(root, "data");
mkdirSync(data, { recursive: true });
const crosswalkPath = path.join(root, "pipeline/clean/xwalk_t10_t20.csv");
if (includeCrosswalk && existsSync(crosswalkPath)) {
  const csv = parseDelimited(readFileSync(crosswalkPath, "utf8"));
  const ct = parseDelimited(readFileSync(path.join(root, "pipeline/clean/ct_tracts.csv"), "utf8"));
  const planning = new Map(ct.rows.map((r) => [r[1], r[0]]));
  const pairs = csv.rows.map((r) => [r[0], planning.get(r[1]) ?? r[1], Number(r[2]), Number(r[3]), Number(r[4])]);
  writeFileSync(path.join(data, "research-crosswalk.json"), JSON.stringify({ generated: new Date().toISOString(), sourceIds: ["blockRelationship", "connecticutGeography", "decennialPl"], pairs }));
  console.log(`Published ${pairs.length} existing tract relationships.`);
}
const git = (args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 10_000_000 }).trim();
const normalize = (text: string) => text.replace(/^Retrieved:.*$/gm, "").replace(/\s+/g, " ").trim();
const entries = legalSources.map((source) => {
  const file = `legal/text/${source.id}.txt`; const current = readFileSync(path.join(root, file), "utf8");
  let previous = "", previousRef = "";
  try {
    // Dirty captures compare with the latest tracked copy; committed captures
    // compare with the preceding copy. Shallow history stays explicitly missing.
    const refs = git(["log", "-2", "--format=%H", "--", file]).split(/\r?\n/).filter(Boolean);
    if (refs[0]) { previousRef = refs[0]; previous = git(["show", `${previousRef}:${file}`]); }
    if (normalize(previous) === normalize(current)) {
      previousRef = refs[1] ?? "";
      previous = previousRef ? git(["show", `${previousRef}:${file}`]) : "";
    }
  } catch { previous = ""; previousRef = ""; }
  const changed = !!previous && normalize(previous) !== normalize(current);
  const oldLines = previous.split(/\r?\n/).filter((line) => line.trim() && !line.startsWith("Retrieved:")); const newLines = current.split(/\r?\n/).filter((line) => line.trim() && !line.startsWith("Retrieved:"));
  const oldSet = new Set(oldLines), newSet = new Set(newLines);
  const removed = previous ? oldLines.filter((line) => !newSet.has(line)) : []; const added = previous ? newLines.filter((line) => !oldSet.has(line)) : [];
  const linked = Object.values(RULES).filter((rule) => rule.cites.some((cite) => cite.source === source.id));
  return { ...source, checked: /Retrieved: ([^\n]+)/.exec(current)?.[1] ?? null, previousChecked: /Retrieved: ([^\n]+)/.exec(previous)?.[1] ?? null, previousRef, changed, digest: createHash("sha256").update(normalize(current)).digest("hex"), previousText: previous, currentText: current, removed: removed.slice(0, 25), added: added.slice(0, 25), moreLines: removed.length > 25 || added.length > 25, rules: linked.map((rule) => ({ id: rule.id, title: rule.title, quotePresent: rule.cites.filter((cite) => cite.source === source.id).every((cite) => normalize(current).includes(normalize(cite.quote))) })) };
});
writeFileSync(path.join(data, "research-legal-history.json"), JSON.stringify({ built: new Date().toISOString(), entries }));
console.log(`Published ${entries.length} local legal source comparisons; no claim of a fresh official retrieval.`);
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) publishResearchContext();
