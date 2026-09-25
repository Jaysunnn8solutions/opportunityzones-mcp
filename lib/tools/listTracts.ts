import { z } from "zod";
import { loadTractData } from "../data/tracts";
import { stateFips } from "../geo/states";
import { DESCRIPTION_SUFFIX, error, fmt, readOnly, text } from "./shared";

/** Measures a list may be ordered by: single raw measures only, never a composite score. */
export const SORTABLE = [
  "population",
  "poverty_rate",
  "mfi_ratio",
  "median_household_income",
  "median_home_value",
  "median_gross_rent",
  "vacancy_rate",
  "unemployment_rate",
  "jobs_2023",
  "mortgage_denial_rate",
  "share_built_2010_or_later",
  "brownfield_sites",
  "miles_to_interstate",
] as const;

export const listTractsConfig = {
  title: "List tracts",
  description:
    "List 2020 census tracts in a state (or one county) with filters on Opportunity Zone and incentive status: 2027 " +
    "eligibility, rural status, 2018 zone, HUD QCT, DDA, NMTC. Optionally ordered by ONE raw measure (e.g. poverty_rate); " +
    "the order is only a sort, not a ranking of investment merit, and no composite score is offered." +
    DESCRIPTION_SUFFIX,
  inputSchema: z
    .object({
      state: z.string().describe("Two-letter postal code (e.g. 'GA') or 2-digit FIPS."),
      county: z.string().regex(/^\d{5}$/).optional().describe("5-digit county FIPS to restrict to one county."),
      eligible2027: z.boolean().optional().describe("Only tracts Treasury lists as eligible (true) or not (false)."),
      rural: z.boolean().optional().describe("Only tracts Treasury classifies as rural (true) or not (false)."),
      in2018Zone: z.boolean().optional().describe("Only tracts with most of their population in a 2018 zone (true) or none (false)."),
      qct: z.boolean().optional(),
      dda: z.boolean().optional().describe("Wholly or partly in a 2026 Difficult Development Area."),
      nmtc: z.boolean().optional().describe("NMTC low-income community."),
      sortBy: z.enum(SORTABLE).optional(),
      order: z.enum(["asc", "desc"]).optional(),
      limit: z.number().int().min(1).max(50).optional(),
    })
    .strict(),
  annotations: readOnly,
};

export interface ListArgs {
  state: string;
  county?: string;
  eligible2027?: boolean;
  rural?: boolean;
  in2018Zone?: boolean;
  qct?: boolean;
  dda?: boolean;
  nmtc?: boolean;
  sortBy?: (typeof SORTABLE)[number];
  order?: "asc" | "desc";
  limit?: number;
}

export function listTractsHandler(args: ListArgs) {
  const fips = stateFips(args.state);
  if (!fips) return error(`Unknown state "${args.state}". Use a two-letter postal code such as GA.`);
  if (args.county && !args.county.startsWith(fips)) return error(`County ${args.county} is not in state ${args.state}.`);
  const { payload, lookups } = loadTractData();
  const col = (n: string) => payload.columns.get(n)!;
  const want = (flag: boolean | undefined, value: number | null, test: (v: number) => boolean) =>
    flag === undefined || (value != null && test(value) === flag);

  const rows: number[] = [];
  for (let i = 0; i < payload.count; i++) {
    const g = payload.geoids[i];
    if (!g.startsWith(args.county ?? fips)) continue;
    if (!want(args.eligible2027, col("eligible_2027").get(i), (v) => v === 1)) continue;
    if (!want(args.rural, col("rural_2027").get(i), (v) => v === 1)) continue;
    if (!want(args.in2018Zone, col("oz2018_population_share").get(i), (v) => v >= 0.5)) continue;
    if (!want(args.qct, col("qct_2026").get(i), (v) => v === 1)) continue;
    if (!want(args.dda, col("dda_2026").get(i), (v) => v > 0)) continue;
    if (!want(args.nmtc, col("nmtc_lic").get(i), (v) => v === 1)) continue;
    rows.push(i);
  }
  if (args.sortBy) {
    const s = col(args.sortBy);
    const dir = args.order === "asc" ? 1 : -1;
    // Missing values sort last either way.
    rows.sort((a, b) => {
      const x = s.get(a);
      const y = s.get(b);
      if (x == null) return y == null ? 0 : 1;
      if (y == null) return -1;
      return (x - y) * dir;
    });
  }
  const limit = args.limit ?? 20;
  const shown = rows.slice(0, limit);
  const lines = [
    `# ${rows.length.toLocaleString("en-US")} tracts match in ${lookups.states[fips] ?? args.state}${args.county ? `, ${lookups.counties[args.county]?.name ?? args.county}` : ""}`,
    args.sortBy ? `Sorted by ${args.sortBy} (${args.order ?? "desc"}); showing ${shown.length}.` : `Showing ${shown.length}.`,
    "",
    "| Tract | County | Eligible 2027 | Rural | 2018 zone | QCT | Poverty | MFI ratio | Population |",
    "|---|---|---|---|---|---|---|---|---|",
    ...shown.map((i) => {
      const g = payload.geoids[i];
      const oz = col("oz2018_population_share").get(i);
      return `| ${g} | ${lookups.counties[g.slice(0, 5)]?.name ?? ""} | ${fmt.yesNo(col("eligible_2027").get(i))} | ${fmt.yesNo(col("rural_2027").get(i))} | ${oz == null ? "n/a" : oz >= 0.5 ? "yes" : oz > 0 ? "partly" : "no"} | ${fmt.yesNo(col("qct_2026").get(i))} | ${fmt.pct(col("poverty_rate").get(i))} | ${col("mfi_ratio").get(i)?.toFixed(2) ?? "n/a"} | ${fmt.int(col("population").get(i))} |`;
    }),
    "",
    "Use get_tract with a GEOID for the full profile.",
  ];
  return text(lines.join("\n"), ["oz2Eligible", "oz1Designated", "hudQct", "hudDda", "nmtcLic", "acs5"]);
}
