import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import SOURCES from "@/legal/sources.json";
import { normaliseForMatch, RULE_GROUPS, RULES } from "./rules";

const TEXT_DIR = path.resolve(import.meta.dirname, "..", "..", "legal", "text");
const cache = new Map<string, string>();
function sourceText(id: string): string {
  if (!cache.has(id)) cache.set(id, normaliseForMatch(readFileSync(path.join(TEXT_DIR, `${id}.txt`), "utf8")));
  return cache.get(id)!;
}

describe("rules and their sources", () => {
  it("every source is registered with a title, publisher and https URL, and its text is saved", () => {
    for (const s of SOURCES) {
      expect(s.title.length, s.id).toBeGreaterThan(5);
      expect(s.publisher.length, s.id).toBeGreaterThan(3);
      expect(s.url, s.id).toMatch(/^https:\/\/(uscode\.house\.gov|www\.govinfo\.gov|www\.ecfr\.gov|www\.irs\.gov|www\.cdfifund\.gov)\//);
      expect(existsSync(path.join(TEXT_DIR, `${s.id}.txt`)), `${s.id} text`).toBe(true);
    }
  });

  it("groups every rule exactly once for the Rules and sources page", () => {
    const listed = RULE_GROUPS.flatMap((g) => g.rules);
    expect([...listed].sort()).toEqual(Object.keys(RULES).sort());
  });

  it("never cites the same quote twice in a rule (the pages key quotes on source, pin and text)", () => {
    for (const r of Object.values(RULES)) {
      const keys = r.cites.map((c) => `${c.source}|${c.pin}|${c.quote}`);
      expect(new Set(keys).size, r.id).toBe(keys.length);
    }
  });

  for (const rule of Object.values(RULES)) {
    it(`${rule.id}: cited, and every quote is in its source word for word`, () => {
      expect(rule.cites.length).toBeGreaterThan(0);
      for (const c of rule.cites) {
        expect(SOURCES.some((s) => s.id === c.source), c.source).toBe(true);
        expect(sourceText(c.source), `${rule.id} → ${c.source} ${c.pin}`).toContain(normaliseForMatch(c.quote));
      }
    });
  }
});
