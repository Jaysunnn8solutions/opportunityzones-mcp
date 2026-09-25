import { z } from "zod";
import { getTract } from "../data/tracts";
import { DESCRIPTION_SUFFIX, error, fmt, geoidSchema, placeLine, readOnly, STATUS_SOURCES, statusLines, text } from "./shared";

export const getTractConfig = {
  title: "Get a tract profile",
  description:
    "Everything published for one 2020 census tract: Opportunity Zone status (2027 eligibility, rural status with the reason, " +
    "2018 zone), stacking designations (QCT, DDA, NMTC), the 2020-2024 ACS profile, housing age, jobs located in the tract, " +
    "mortgage lending, EPA sites, anchor institutions, HUD rent benchmark, distance to an Interstate, and county building " +
    "permits. Every figure names its source and vintage." +
    DESCRIPTION_SUFFIX,
  inputSchema: z.object({ geoid: geoidSchema }).strict(),
  annotations: readOnly,
};

export function getTractHandler({ geoid }: { geoid: string }) {
  const t = getTract(geoid);
  if (!t) return error(`No tract ${geoid} in Treasury's 2027 tract list.`);
  const m = t.measures;
  const v = (k: string) => m[k]?.value ?? null;
  const jobsChange =
    v("jobs_2023") != null && v("jobs_2017") != null && v("jobs_2017")! > 0
      ? ` (${fmt.pct((v("jobs_2023")! - v("jobs_2017")!) / v("jobs_2017")!)} since 2017)`
      : "";
  const permits = t.countyPermits;
  const body = [
    `# ${placeLine(t)}`,
    "",
    "## Opportunity Zone status",
    ...statusLines(t),
    "",
    "## People and housing (2020-2024 ACS)",
    `- Population ${fmt.int(v("population"))}; housing units ${fmt.int(v("housing_units"))}; vacancy ${fmt.pct(v("vacancy_rate"))}; owner-occupied ${fmt.pct(v("owner_occupied_share"))}.`,
    `- Median household income ${fmt.usd(v("median_household_income"))}; median home value ${fmt.usd(v("median_home_value"))}; median gross rent ${fmt.usd(v("median_gross_rent"))}.`,
    `- Bachelor's or higher ${fmt.pct(v("bachelors_or_higher_share"))}; unemployment ${fmt.pct(v("unemployment_rate"))}.`,
    `- Housing stock: ${fmt.pct(v("share_built_before_1980"))} built before 1980; ${fmt.pct(v("share_built_2010_or_later"))} since 2010; ${fmt.int(v("built_2020_or_later"))} units built 2020 or later (±${fmt.int(v("built_2020_or_later_moe"))}).`,
    "",
    "## Jobs and credit",
    `- Jobs located in the tract, 2023 (LODES): ${fmt.int(v("jobs_2023"))}${jobsChange}.`,
    `- Mortgages, 2024 (HMDA): ${fmt.int(v("mortgage_applications"))} applications, ${fmt.int(v("mortgage_originations"))} originated (${fmt.int(v("home_purchase_originations"))} home purchase), denial rate ${fmt.pct(v("mortgage_denial_rate"))}.`,
    "",
    "## Site context",
    `- EPA Superfund (NPL) sites ${fmt.int(v("npl_sites"))}; brownfield sites ${fmt.int(v("brownfield_sites"))} (recorded in or at the edge of the tract).`,
    `- Colleges ${fmt.int(v("colleges"))}; hospitals ${fmt.int(v("hospitals"))} (a floor: some hospital addresses cannot be geocoded).`,
    `- HUD FY2026 two-bedroom Small Area FMR ${fmt.usd(v("safmr_2br_land_weighted"))} (ZIP-based, land-weighted over ${fmt.pct(v("safmr_land_covered"), 0)} of the tract).`,
    `- Nearest Interstate ${fmt.miles(v("miles_to_interstate"))} from the tract's interior point.`,
    permits
      ? `- County building permits ${permits.year}: ${fmt.int(permits.units)} housing units (${fmt.int(permits.units5plus)} in 5+ unit buildings)${permits.change == null ? "" : `, ${fmt.pct(permits.change)} vs the prior year`}. County-level.`
      : "- County building permits: n/a.",
  ].join("\n");
  return text(body, [
    ...STATUS_SOURCES,
    "acs5",
    "lodesWac",
    "hmdaLar",
    "epaSites",
    "ncesPostsecondary",
    "cmsHospitals",
    "hudSafmr",
    "tigerPrimaryRoads",
    "censusBps",
  ]);
}
