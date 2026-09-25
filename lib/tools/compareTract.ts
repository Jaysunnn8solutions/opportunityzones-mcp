import { z } from "zod";
import { getTract, loadTractData } from "../data/tracts";
import { DESCRIPTION_SUFFIX, error, geoidSchema, readOnly, text } from "./shared";

/** Measures compared, each shown on its own with a short label; no composite. */
export const COMPARED = {
  poverty_rate: "Poverty rate",
  mfi_ratio: "Income vs area MFI",
  median_household_income: "Median household income",
  median_home_value: "Median home value",
  median_gross_rent: "Median gross rent",
  vacancy_rate: "Vacancy rate",
  unemployment_rate: "Unemployment rate",
  bachelors_or_higher_share: "Bachelor's or higher",
  share_built_2010_or_later: "Housing built 2010+",
  jobs_2023: "Jobs in tract (2023)",
  mortgage_denial_rate: "Mortgage denial rate",
} as const;

/** 1st, 2nd, 3rd, 4th ... 11th, 12th, 13th ... 21st, 62nd. */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

export const compareTractConfig = {
  title: "Compare a tract with its state",
  description:
    "Where a tract sits among the other tracts in its state that are eligible for the 2027 designations, measure by measure " +
    "(percentile: the share of those tracts with a lower value). Each measure stands alone; no composite or investability " +
    "score is computed." +
    DESCRIPTION_SUFFIX,
  inputSchema: z.object({ geoid: geoidSchema }).strict(),
  annotations: readOnly,
};

/** Share of `values` strictly below `x`, plus half of ties (mid-rank percentile). */
export function percentile(values: readonly number[], x: number): number {
  let below = 0;
  let equal = 0;
  for (const v of values) {
    if (v < x) below++;
    else if (v === x) equal++;
  }
  return values.length ? (below + equal / 2) / values.length : NaN;
}

export function compareTractHandler({ geoid }: { geoid: string }) {
  const t = getTract(geoid);
  if (!t) return error(`No tract ${geoid} in Treasury's 2027 tract list.`);
  const { payload } = loadTractData();
  const state = geoid.slice(0, 2);
  const eligible = payload.columns.get("eligible_2027")!;
  const peers: number[] = [];
  for (let i = 0; i < payload.count; i++) {
    if (payload.geoids[i].startsWith(state) && eligible.get(i) === 1) peers.push(i);
  }
  const lines = [
    `# Tract ${geoid} against the ${peers.length.toLocaleString("en-US")} eligible tracts in ${t.state}`,
    "Percentile = share of those tracts with a lower value. A description of where the tract sits, not a judgement.",
    "",
    "| Measure | This tract | Percentile | Compared with |",
    "|---|---|---|---|",
  ];
  for (const [name, label] of Object.entries(COMPARED)) {
    const m = t.measures[name];
    const col = payload.columns.get(name)!;
    const values = peers.map((i) => col.get(i)).filter((v): v is number => v != null);
    const shown =
      m.value == null ? "n/a" : m.unit === "share" ? `${(m.value * 100).toFixed(1)}%` : m.unit === "USD" ? `$${Math.round(m.value).toLocaleString("en-US")}` : m.value.toLocaleString("en-US", { maximumFractionDigits: 2 });
    const p = m.value == null || values.length === 0 ? null : percentile(values, m.value);
    lines.push(`| ${label} | ${shown} | ${p == null ? "n/a" : ordinal(Math.round(p * 100))} | ${values.length.toLocaleString("en-US")} tracts with data |`);
  }
  return text(lines.join("\n"), ["oz2Eligible", "acs5", "lodesWac", "hmdaLar"]);
}
