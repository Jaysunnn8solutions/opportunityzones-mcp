import { describe, expect, it } from "vitest";
import { getTract, loadTractData } from "./tracts";

// Integration test against the committed data/ (vitest sets OZ_DATA_DIR).
describe("published tract data", () => {
  const data = loadTractData();

  it("covers Treasury's full 2027 tract universe", () => {
    expect(data.payload.count).toBe(85_529);
    expect(data.manifest.tracts).toBe(85_529);
  });

  it("describes every column and names a registered source for it", () => {
    for (const c of data.manifest.columns) {
      expect(data.payload.columns.has(c.name)).toBe(true);
      expect(c.description?.length).toBeGreaterThan(10);
      expect(data.manifest.sources.some((s) => s.id === c.source)).toBe(true);
    }
  });

  it("carries the disclaimer", () => {
    expect(data.manifest.disclaimer).toMatch(/not investment, tax or legal advice/);
  });
});

describe("getTract", () => {
  it("returns a named, explained profile for a real tract (downtown Atlanta)", () => {
    const t = getTract("13121003500")!;
    expect(t).toMatchObject({ state: "Georgia", countyFips: "13121" });
    expect(t.county).toMatch(/Fulton/);
    expect(t.measures.qct_2026.value).toBe(1);
    expect(t.measures.population.unit).toBe("count");
    expect(t.rural.treasury).toBe(false);
    expect(t.rural.explanation).toMatch(/Atlanta/);
    expect(t.countyPermits?.units).toBeGreaterThan(0);
  });

  it("finds Connecticut by planning-region GEOID", () => {
    expect(getTract("09110504500")?.state).toBe("Connecticut");
  });

  it("keeps missing data missing (LODES has no Puerto Rico)", () => {
    expect(getTract("72127000400")!.measures.jobs_2023.value).toBeNull();
  });

  it("returns null for malformed or unknown GEOIDs", () => {
    expect(getTract("123")).toBeNull();
    expect(getTract("99999999999")).toBeNull();
  });
});

describe("2027 designation status in the published data", () => {
  it("shows eligible tracts as pending until Treasury's list is published, and says so", async () => {
    const { stateStatus, FLAGS } = await import("./status");
    const { designationNote, designationPublication } = await import("./tracts");
    const ga = stateStatus("13");
    // Appling County tract 9501: eligible, so pending; never marked designated before publication.
    expect(ga["13001950100"] & FLAGS.eligible).toBeTruthy();
    expect(ga["13001950100"] & FLAGS.zone2027Pending).toBeTruthy();
    expect(ga["13001950100"] & FLAGS.zone2027).toBe(0);
    // An ineligible tract is not pending: it cannot be designated at all.
    expect(ga["13121003500"] & (FLAGS.zone2027Pending | FLAGS.zone2027)).toBe(0);
    if (designationPublication().certified === 0) expect(designationNote()).toMatch(/not yet published/);
  });
});
