import { describe, expect, it } from "vitest";
import { SOURCES, type Source } from "./sources";

const all: Source[] = Object.values(SOURCES);

describe("source registry", () => {
  it("is not empty", () => {
    expect(all.length).toBeGreaterThan(0);
  });

  it.each(all.map((s) => [s.id, s] as const))("%s names its licence, commercial use and attribution", (_id, s) => {
    // The licence rule in AGENTS.md is enforced here: nothing ships without
    // being able to say what it is allowed to do with each input.
    expect(s.license.trim().length).toBeGreaterThan(0);
    expect(["public-domain", "attribution", "share-alike"]).toContain(s.commercialUse);
    expect(s.attribution.trim().length).toBeGreaterThan(10);
    expect(s.publisher.trim().length).toBeGreaterThan(0);
    expect(s.homepage).toMatch(/^https:\/\//);
  });

  it("keys every entry by its own id", () => {
    for (const [key, s] of Object.entries(SOURCES)) expect(s.id).toBe(key);
  });

  it("records the boundary vintage of every tract- or block-level source", () => {
    // The 2010-versus-2020 tract mismatch is the central data hazard of this
    // product, so a sub-county source that does not say which boundaries it
    // uses is treated as incomplete.
    for (const s of all) {
      if (/tract|block/i.test(s.geography)) expect(s.geography).toMatch(/20[12]0/);
    }
  });
});
