import { describe, expect, it } from "vitest";
import { buildCrosswalk, countTo2010, intensiveTo2010, type Pair } from "./crosswalk";

/*
 * A small world covering every relationship the real file contains:
 *
 *   A (2010)  == a (2020)                 identical
 *   B (2010)  -> b1 + b2 (2020)           split
 *   C1 + C2 (2010) -> c (2020)            merged
 *   D (2010) and E (2010) share d and e   complex (boundary moved)
 *   F (2010), no people                   unpopulated
 */
const pair = (geoid10: string, geoid20: string, pop: number, hu: number, land = pop): Pair => ({
  geoid10,
  geoid20,
  pop,
  hu,
  land,
});

const PAIRS: Pair[] = [
  pair("A", "a", 4000, 1600),
  pair("B", "b1", 3000, 1200),
  pair("B", "b2", 1000, 500),
  pair("C1", "c", 2500, 1000),
  pair("C2", "c", 1500, 600),
  pair("D", "d", 1800, 700),
  pair("D", "e", 200, 100),
  pair("E", "e", 1800, 800),
  pair("E", "d", 200, 90),
  pair("F", "f", 0, 0, 5_000_000),
];

const xw = buildCrosswalk(PAIRS);
const vals = (m: Record<string, number | null>) => new Map(Object.entries(m));

describe("relationship classification", () => {
  it.each([
    ["A", "identical"],
    ["B", "split"],
    ["C1", "merged"],
    ["C2", "merged"],
    ["D", "complex"],
    ["F", "unpopulated"],
  ])("classifies %s as %s", (g, rel) => {
    expect(xw.quality10.get(g)!.relationship).toBe(rel);
  });

  it("measures how much of a split tract's population sits in its largest piece", () => {
    expect(xw.quality10.get("B")!.concentration).toBeCloseTo(0.75, 10);
    expect(xw.quality10.get("B")!.purity).toBeCloseTo(1, 10);
  });

  it("scores a merged tract's purity by how much of the 2020 tract it is", () => {
    // C1 is 2,500 of c's 4,000 people.
    expect(xw.quality10.get("C1")!.purity).toBeCloseTo(0.625, 10);
  });
});

describe("countTo2010", () => {
  it("passes an identical tract's count through unchanged", () => {
    expect(countTo2010(xw, "A", vals({ a: 4100 }), "pop")).toBeCloseTo(4100, 10);
  });

  it("reassembles a split tract by summing its pieces", () => {
    expect(countTo2010(xw, "B", vals({ b1: 3100, b2: 900 }), "pop")).toBeCloseTo(4000, 10);
  });

  it("apportions a merged 2020 tract by where its people live", () => {
    // c has 4,000 people: 62.5% in C1, 37.5% in C2.
    expect(countTo2010(xw, "C1", vals({ c: 8000 }), "pop")).toBeCloseTo(5000, 10);
    expect(countTo2010(xw, "C2", vals({ c: 8000 }), "pop")).toBeCloseTo(3000, 10);
  });

  it("conserves the national total across every 2010 tract", () => {
    // The property that makes counts trustworthy: nothing is created or lost.
    const v = vals({ a: 10, b1: 20, b2: 30, c: 40, d: 50, e: 60, f: 0 });
    const total = ["A", "B", "C1", "C2", "D", "E", "F"].reduce((s, g) => s + (countTo2010(xw, g, v, "pop") ?? 0), 0);
    expect(total).toBeCloseTo(210, 9);
  });

  it("uses housing-unit weights when asked, which differ from people", () => {
    // d: 700 homes in D, 90 in E  vs  1,800 people in D, 200 in E.
    const byHu = countTo2010(xw, "D", vals({ d: 790, e: 0 }), "hu");
    expect(byHu).toBeCloseTo(700, 9);
  });

  it("is null, not a partial sum, when a contributing tract is missing", () => {
    expect(countTo2010(xw, "B", vals({ b1: 3100, b2: null }), "pop")).toBeNull();
  });

  it("falls back to land for an unpopulated tract instead of dividing by zero", () => {
    expect(countTo2010(xw, "F", vals({ f: 12 }), "pop")).toBeCloseTo(12, 10);
  });
});

describe("intensiveTo2010", () => {
  it("passes an identical tract's median through unchanged", () => {
    const r = intensiveTo2010(xw, "A", vals({ a: 250_000 }), "hu");
    expect(r.value).toBeCloseTo(250_000, 6);
    expect(r.coverage).toBe(1);
  });

  it("weights a split tract's pieces by their homes", () => {
    // b1 has 1,200 homes at 200k, b2 has 500 at 300k.
    const r = intensiveTo2010(xw, "B", vals({ b1: 200_000, b2: 300_000 }), "hu");
    expect(r.value).toBeCloseTo((1200 * 200_000 + 500 * 300_000) / 1700, 6);
  });

  it("gives both halves of a merge the merged tract's value", () => {
    expect(intensiveTo2010(xw, "C1", vals({ c: 150_000 }), "hu").value).toBeCloseTo(150_000, 6);
    expect(intensiveTo2010(xw, "C2", vals({ c: 150_000 }), "hu").value).toBeCloseTo(150_000, 6);
  });

  it("reports partial coverage and still answers above the threshold", () => {
    // b1 carries 75% of B's people.
    const r = intensiveTo2010(xw, "B", vals({ b1: 1.1, b2: null }), "pop");
    expect(r.coverage).toBeCloseTo(0.75, 10);
    expect(r.value).toBeCloseTo(1.1, 10);
  });

  it("refuses to answer below the coverage threshold", () => {
    // b2 alone is 25% of B.
    const r = intensiveTo2010(xw, "B", vals({ b1: null, b2: 1.1 }), "pop");
    expect(r.value).toBeNull();
    expect(r.coverage).toBeCloseTo(0.25, 10);
  });

  it("weights by tenure share when given one, so owners decide a home value", () => {
    // b1: 1,200 homes, 10% owned; b2: 500 homes, 90% owned. By owner units,
    // b2 (450) outweighs b1 (120), unlike plain housing-unit weights.
    const share = vals({ b1: 0.1, b2: 0.9 });
    const r = intensiveTo2010(xw, "B", vals({ b1: 100_000, b2: 300_000 }), "hu", 0.5, share);
    expect(r.value).toBeCloseTo((120 * 100_000 + 450 * 300_000) / 570, 6);
  });

  it("is null for a tract the crosswalk does not know", () => {
    expect(intensiveTo2010(xw, "ZZZ", vals({}), "pop").value).toBeNull();
  });
});
