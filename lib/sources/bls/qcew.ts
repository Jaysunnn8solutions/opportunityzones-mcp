import { publicGeographyCache } from "../publicCache";
/**
 * County jobs and wages from the BLS Quarterly Census of Employment and Wages
 * (QCEW) open data files: no key.
 *
 * The most complete count of jobs covered by unemployment insurance, by county,
 * about six months behind. County-level and labeled so: it describes the
 * economy around a tract, not the tract.
 *
 * Reads the county total (all ownership, all industries) and, for industry mix,
 * the private-sector supersectors. Suppressed cells (disclosure code "N") are
 * missing, never zero. The newest published quarter is found by trying quarters
 * from the current one backwards.
 */

import { fetchText, SourceError } from "../http";

export const SOURCE_ID = "blsQcew";

const areaUrl = (year: number, qtr: number, county: string) =>
  `https://data.bls.gov/cew/data/api/${year}/${qtr}/area/${county}.csv`;

export const SUPERSECTORS: Record<string, string> = {
  "1011": "Natural resources and mining",
  "1012": "Construction",
  "1013": "Manufacturing",
  "1021": "Trade, transportation, and utilities",
  "1022": "Information",
  "1023": "Financial activities",
  "1024": "Professional and business services",
  "1025": "Education and health services",
  "1026": "Leisure and hospitality",
  "1027": "Other services",
  "1028": "Public administration",
  "1029": "Unclassified",
};

export interface QcewSummary {
  county: string;
  /** e.g. "2025-Q1". */
  quarter: string;
  establishments: number | null;
  /** Employment in the quarter's third month. */
  employment: number | null;
  employmentChangeYoY: number | null;
  averageWeeklyWage: number | null;
  wageChangeYoY: number | null;
  /** Largest private-sector supersectors by employment. */
  topPrivateSectors: Array<{ sector: string; employment: number }>;
}

function splitCsv(line: string): string[] {
  return line.split(",").map((c) => c.replace(/^"|"$/g, ""));
}

export function summariseQcew(csv: string, county: string): QcewSummary | null {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return null;
  const h = splitCsv(lines[0]);
  const at = (n: string) => {
    const i = h.indexOf(n);
    if (i < 0) throw new SourceError(SOURCE_ID, "bad-response", `QCEW file lacks ${n}`);
    return i;
  };
  const c = {
    own: at("own_code"),
    ind: at("industry_code"),
    agg: at("agglvl_code"),
    year: at("year"),
    qtr: at("qtr"),
    disc: at("disclosure_code"),
    estabs: at("qtrly_estabs"),
    emp: at("month3_emplvl"),
    wage: at("avg_wkly_wage"),
    empChg: at("oty_month3_emplvl_pct_chg"),
    wageChg: at("oty_avg_wkly_wage_pct_chg"),
  };
  const rows = lines.slice(1).map(splitCsv);
  const val = (r: string[], i: number) => {
    if (r[c.disc] === "N") return null;
    const n = Number(r[i]);
    return r[i] === "" || !Number.isFinite(n) ? null : n;
  };
  const total = rows.find((r) => r[c.own] === "0" && r[c.ind] === "10");
  if (!total) return null;
  const pct = (v: number | null) => (v == null ? null : Math.round(v * 10) / 1000);
  const sectors = rows
    .filter((r) => r[c.own] === "5" && r[c.agg] === "73" && SUPERSECTORS[r[c.ind]])
    .map((r) => ({ sector: SUPERSECTORS[r[c.ind]], employment: val(r, c.emp) }))
    .filter((s): s is { sector: string; employment: number } => s.employment != null && s.employment > 0)
    .sort((a, b) => b.employment - a.employment)
    .slice(0, 5);
  return {
    county,
    quarter: `${total[c.year]}-Q${total[c.qtr]}`,
    establishments: val(total, c.estabs),
    employment: val(total, c.emp),
    employmentChangeYoY: pct(val(total, c.empChg)),
    averageWeeklyWage: val(total, c.wage),
    wageChangeYoY: pct(val(total, c.wageChg)),
    topPrivateSectors: sectors,
  };
}

/** The newest published QCEW quarter for a county, trying back up to six quarters. */
async function fetchCountyJobs(county: string, today = new Date()): Promise<QcewSummary | null> {
  if (!/^\d{5}$/.test(county)) throw new SourceError(SOURCE_ID, "rejected", "county must be a 5-digit FIPS code");
  let year = today.getUTCFullYear();
  let qtr = Math.floor(today.getUTCMonth() / 3) + 1;
  for (let tries = 0; tries < 6; tries++) {
    try {
      return summariseQcew(await fetchText(areaUrl(year, qtr, county), { sourceId: SOURCE_ID }), county);
    } catch (err) {
      // An unpublished quarter answers 404, reported as "rejected": step back.
      if (!(err instanceof SourceError && err.kind === "rejected")) throw err;
    }
    qtr--;
    if (qtr === 0) {
      qtr = 4;
      year--;
    }
  }
  return null;
}

export async function countyJobs(county: string, today = new Date()): Promise<QcewSummary | null> {
  return (await publicGeographyCache(`qcew:${county}:${today.getUTCFullYear()}-${Math.floor(today.getUTCMonth() / 3) + 1}`, 86_400_000, () => fetchCountyJobs(county, today))).value;
}
