import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { computeGrowth } from "./growth";

/** A synthetic analysis table: controls follow a rule; designated tracts beat it by `lift` on income. */
function table(lift: number): string {
  const cols = [
    "geoid10", "state_fips", "state_name", "group", "designated_neighbours",
    "median_hh_income_2016", "pre_dlog_hh_income", "out_dlog_hh_income",
    "median_home_value_2016", "pre_dlog_home_value", "out_dlog_home_value",
    "log_density_2016", "poverty_rate_2016", "ba_plus_share_2016", "unemployment_rate_2016",
  ];
  const rows = [cols.join(",")];
  let rnd = 7;
  const r = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647 - 0.5) * 0.1;
  for (const st of ["01", "02", "04"]) {
    for (let i = 0; i < 90; i++) {
      const treated = i < 30;
      const inc = 30000 + i * 300;
      const y = 0.05 - 0.00001 * (inc - 40000) + r() + (treated ? lift : 0);
      const hv = 100000 + i * 1000;
      rows.push(
        [`${st}0010${String(i).padStart(5, "0")}`, st, "S", treated ? "designated_lic" : "eligible_lic_control", i % 3,
          inc, 0.01, y, hv, 0.02, 0.03 + r(), 6 + i / 100, 0.3, 0.15, 0.08].join(","),
      );
    }
  }
  return rows.join("\n") + "\n";
}

describe("2018-zone growth", () => {
  it("finds the lift given to designated tracts, and none when there is none", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "growth-"));
    const withLift = path.join(dir, "a.csv");
    const without = path.join(dir, "b.csv");
    writeFileSync(withLift, table(0.2));
    writeFileSync(without, table(0));
    const a = computeGrowth(withLift);
    const b = computeGrowth(without);
    const inc = (g: typeof a) => g.outcomes.find((o) => o.column === "out_dlog_hh_income")!;
    expect(inc(a).natural!.estimate).toBeGreaterThan(0.15);
    expect(inc(a).lift!.low).toBeGreaterThan(0);
    expect(Math.abs(inc(b).natural!.estimate)).toBeLessThan(0.03);
    expect(a.treated).toBe(90);
    expect(Object.keys(a.zones)).toHaveLength(90);
    expect(a.groups.find((g) => g.feature === "poverty_rate_2016")).toBeDefined();
  });
});
