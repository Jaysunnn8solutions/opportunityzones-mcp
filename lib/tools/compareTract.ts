import { z } from "zod";
import { percentile, statePositions } from "../data/compare";
import { getTract } from "../data/tracts";

export { percentile };
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

export function compareTractHandler({ geoid }: { geoid: string }) {
  const t = getTract(geoid);
  if (!t) return error(`No tract ${geoid} in Treasury's 2027 tract list.`);
  const positions = statePositions(geoid, Object.keys(COMPARED));
  const peers = Math.max(0, ...Object.values(positions).map((p) => p.peers));
  const lines = [
    `# Tract ${geoid} against the ${peers.toLocaleString("en-US")} eligible tracts in ${t.state}`,
    "Percentile = share of those tracts with a lower value. A description of where the tract sits, not a judgement.",
    "",
    "| Measure | This tract | Percentile | Compared with |",
    "|---|---|---|---|",
  ];
  for (const [name, label] of Object.entries(COMPARED)) {
    const m = t.measures[name];
    const pos = positions[name];
    const shown =
      m.value == null ? "n/a" : m.unit === "share" ? `${(m.value * 100).toFixed(1)}%` : m.unit === "USD" ? `$${Math.round(m.value).toLocaleString("en-US")}` : m.value.toLocaleString("en-US", { maximumFractionDigits: 2 });
    lines.push(`| ${label} | ${shown} | ${pos.percentile == null ? "n/a" : ordinal(Math.round(pos.percentile * 100))} | ${pos.peers.toLocaleString("en-US")} tracts with data |`);
  }
  return text(lines.join("\n"), ["oz2Eligible", "acs5", "lodesWac", "hmdaLar"]);
}
