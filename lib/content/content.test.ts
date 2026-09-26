import { describe, expect, it } from "vitest";
import { PERSONA_GROUPS, PERSONAS, personaBySlug } from "./personas";

/** The same test the MCP tools face: none of this may read as a recommendation. */
const ADVICE = /\b(you should|we recommend|recommended|best (tract|investment|fund)|invest here|good investment|guaranteed)\b/i;

describe("persona content", () => {
  it("covers every starting point, each in a group, with unique slugs", () => {
    expect(PERSONAS.map((p) => p.slug)).toEqual([
      "individual",
      "builder",
      "corporate",
      "business",
      "landowner",
      "sponsor",
      "adviser",
      "lender",
      "community",
    ]);
    expect(new Set(PERSONAS.map((p) => p.slug)).size).toBe(PERSONAS.length);
    for (const g of PERSONA_GROUPS) expect(PERSONAS.some((p) => p.group === g.id)).toBe(true);
    expect(personaBySlug("builder")?.who).toBe("Home builder");
    expect(personaBySlug("nope")).toBeUndefined();
  });

  it("never reads as advice, and every persona points to at least one tool", () => {
    for (const p of PERSONAS) {
      const all = [p.title, p.summary, ...p.fit, ...p.rules, ...p.ask, ...(p.example ? [...p.example.steps, ...p.example.weigh] : [])];
      for (const line of all) expect(line).not.toMatch(ADVICE);
      expect(p.tools.length).toBeGreaterThan(0);
      for (const t of p.tools) expect(t.href).toMatch(/^\//);
    }
  });

  it("answers the small-gain house question with the conditions that decide it", () => {
    const ex = personaBySlug("individual")!.example!;
    const text = ex.steps.join(" ");
    expect(text).toMatch(/180 days/);
    expect(text).toMatch(/not lived in/);
    expect(text).toMatch(/substantially improve/);
  });

  it("says plainly that ordinary income (a builder's inventory, a business's profit) is not a qualifying gain", () => {
    expect(personaBySlug("builder")!.example!.steps.join(" ")).toMatch(/inventory is ordinary income, not a capital gain/);
    expect(personaBySlug("business")!.example!.steps.join(" ")).toMatch(/Ordinary business income[^.]*cannot be deferred/);
  });
});
