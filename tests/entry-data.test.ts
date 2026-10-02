import { describe, expect, it } from "vitest";
import scenes from "@/lib/content/entryTracts.json";
import facts from "@/lib/content/entryTractFacts.json";
import growth from "@/lib/content/entryTractGrowth.json";
import { loadTractData } from "@/lib/data/tracts";

describe("entry preview data integrity", () => {
  it("shows the published Census estimates for the exact highlighted tracts", () => {
    const { payload, lookups, manifest } = loadTractData();
    const records: Record<string, { county: string; population: number | null; medianHouseholdIncome: number | null }> = facts.tracts;
    expect(Object.keys(records).sort()).toEqual(scenes.map((scene) => scene.selected.id).sort());
    for (const scene of scenes) {
      const id = scene.selected.id, row = payload.geoids.indexOf(id);
      expect(row).toBeGreaterThanOrEqual(0);
      expect(records[id].population).toBe(payload.columns.get("population")!.get(row));
      expect(records[id].medianHouseholdIncome).toBe(payload.columns.get("median_household_income")!.get(row));
      expect(records[id].county).toBe(lookups.counties[id.slice(0, 5)].name);
    }
    for (const name of ["population", "median_household_income"]) {
      const column = manifest.columns.find((column) => column.name === name)!;
      expect(column.source).toBe("acs5");
      expect(column.description).toContain(facts.period.replace("–", "-"));
    }
  });
  it("keeps the requested change descriptive and consistent with the stored baseline", () => {
    const records: Record<string, { population: number | null; medianHouseholdIncome: number | null }> = facts.tracts;
    for (const [id, baseline] of Object.entries(growth.tracts)) {
      expect(records[id]).toBeDefined();
      if (baseline.population2020 > 0 && records[id].population != null) expect(baseline.populationChange).toBeCloseTo((records[id].population! / baseline.population2020 - 1) * 100);
      if (baseline.income2020 > 0 && records[id].medianHouseholdIncome != null) expect(baseline.incomeChange).toBeCloseTo((records[id].medianHouseholdIncome! / baseline.income2020 - 1) * 100);
    }
    expect(growth.note).toContain("Overlapping survey periods");
    expect(growth.note).toContain("not adjusted for inflation");
  });
});
