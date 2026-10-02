/** Six public, fixed preview tracts only. No runtime provider requests. */
import { writeFileSync } from "node:fs";
import scenes from "../lib/content/entryTracts.json";
import { fetchCached } from "../pipeline/lib/http";
import { censusApiKey } from "../pipeline/lib/env";
import { parseTractResponse, isTopCoded } from "../pipeline/lib/census";
import { loadTractData } from "../lib/data/tracts";

const { payload } = loadTractData();
const codes = ["B01003_001E", "B19013_001E"];
const tracts: Record<string, { population2020: number | null; income2020: number | null; populationChange: number | null; incomeChange: number | null }> = {};
const change = (before: number | null, after: number | null) => before == null || after == null || before <= 0 || after < 0 ? null : (after / before - 1) * 100;
for (const { selected } of scenes) {
  const id = selected.id;
  const url = `https://api.census.gov/data/2020/acs/acs5?get=${codes.join(",")}&for=tract:${id.slice(5)}&in=state:${id.slice(0, 2)}%20county:${id.slice(2, 5)}&key=${censusApiKey()}`;
  const response = await fetchCached(url, `entry-acs2020-${id}-population-income.json`, { timeoutMs: 20_000, retries: 2 });
  const baseline = parseTractResponse(response.toString("utf8"), codes).get(id);
  if (!baseline) throw new Error(`Census did not return requested tract ${id}; refusing to substitute another geography.`);
  const index = payload.geoids.indexOf(id);
  if (index < 0) throw new Error(`Published 2024 tract ${id} is missing.`);
  const population2020 = baseline[codes[0]], income2020 = baseline[codes[1]];
  const income2024 = payload.columns.get("median_household_income")!.get(index);
  tracts[id] = { population2020, income2020, populationChange: change(population2020, payload.columns.get("population")!.get(index)), incomeChange: isTopCoded(codes[1], income2020) || isTopCoded(codes[1], income2024) ? null : change(income2020, income2024) };
}
writeFileSync("lib/content/entryTractGrowth.json", JSON.stringify({ baselinePeriod: "2016–2020", currentPeriod: "2020–2024", source: "U.S. Census Bureau, ACS 5-year estimates", note: "Overlapping survey periods; descriptive estimate changes, not annual growth or tested statistical significance. Income change is nominal, not adjusted for inflation. Capped medians and missing or zero baselines have no percentage change.", tracts }));
console.log(`Published estimate changes for ${Object.keys(tracts).length} entry tracts.`);
