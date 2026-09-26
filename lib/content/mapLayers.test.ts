import { describe, expect, it } from "vitest";
import { SOURCES } from "@/pipeline/sources";
import { MAP_LAYERS } from "./mapLayers";
import { RULES } from "./rules";

describe("map layer explanations", () => {
  it("cite at least one sourced rule, and name a registered dataset", () => {
    for (const l of Object.values(MAP_LAYERS)) {
      expect(l.rules.length, l.id).toBeGreaterThan(0);
      for (const r of l.rules) expect(RULES, `${l.id} → ${r}`).toHaveProperty(r);
      expect(SOURCES, `${l.id} → ${l.sourceId}`).toHaveProperty(l.sourceId);
    }
  });

  it("stay short enough to read on hover", () => {
    for (const l of Object.values(MAP_LAYERS)) expect(l.short.length, l.id).toBeLessThan(260);
  });
});
