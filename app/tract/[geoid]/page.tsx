import Link from "next/link";
import { notFound } from "next/navigation";
import { SOURCES, type SourceId } from "@/pipeline/sources";
import { getTract, type Measure } from "@/lib/data/tracts";
import { placeLine, statusLines } from "@/lib/tools/shared";

/** One tract's published profile: the same data the get_tract tool returns. */

function formatValue(m: Measure): string {
  const v = m.value;
  if (v == null) return "n/a";
  switch (m.unit) {
    case "share":
      return `${(v * 100).toFixed(1)}%`;
    case "USD":
      return `$${Math.round(v).toLocaleString("en-US")}`;
    case "count":
      return Math.round(v).toLocaleString("en-US");
    case "miles":
      return `${v.toFixed(2)} mi`;
    case "ratio":
      return v.toFixed(3);
    default:
      return String(v);
  }
}

const GROUPS: Array<[string, string[]]> = [
  ["2027 eligibility inputs", ["poverty_rate", "median_family_income", "area_median_family_income", "mfi_ratio"]],
  ["People and housing (2020-2024 ACS)", ["population", "housing_units", "median_household_income", "median_home_value", "median_gross_rent", "vacancy_rate", "owner_occupied_share", "bachelors_or_higher_share", "unemployment_rate"]],
  ["Housing stock", ["built_2020_or_later", "built_2020_or_later_moe", "share_built_2010_or_later", "share_built_before_1980"]],
  ["Jobs and credit", ["jobs_2023", "jobs_2017", "mortgage_applications", "mortgage_originations", "home_purchase_originations", "mortgage_denial_rate", "originated_dollars"]],
  ["Site context", ["npl_sites", "brownfield_sites", "colleges", "hospitals", "safmr_2br_land_weighted", "safmr_land_covered", "miles_to_interstate"]],
];

export default async function TractPage({ params }: { params: Promise<{ geoid: string }> }) {
  const { geoid } = await params;
  const t = getTract(geoid);
  if (!t) notFound();
  const permits = t.countyPermits;
  const sourceIds = new Set(GROUPS.flatMap(([, names]) => names.map((n) => t.measures[n]?.source)).filter(Boolean));
  for (const id of ["oz2Eligible", "urbanAreas2020", "oz1Designated", "hudQct", "hudDda", "nmtcLic", "censusBps"]) sourceIds.add(id);

  return (
    <main className="tract-page">
      <p>
        <Link href={`/map#t=${t.geoid}`}>Back to the map</Link>
      </p>
      <h1>{placeLine(t)}</h1>

      <h2>Opportunity Zone status</h2>
      <ul>
        {statusLines(t).map((l) => (
          <li key={l}>{l.replace(/^- /, "")}</li>
        ))}
      </ul>

      <section className="next-steps">
        <strong>What next</strong>
        <Link href="/how-it-works">How a gain, a fund and a zone fit together</Link>
        <Link href="/how-it-works#designation">Why eligible is not designated</Link>
        <Link href="/funds">Finding and reviewing funds</Link>
        <Link href="/check">Check a list of properties</Link>
      </section>

      {GROUPS.map(([title, names]) => (
        <section key={title}>
          <h2>{title}</h2>
          <table>
            <tbody>
              {names.map((n) => {
                const m = t.measures[n];
                if (!m) return null;
                return (
                  <tr key={n}>
                    <td>{m.description}</td>
                    <td className="value">{formatValue(m)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}

      <h2>County building permits (county-level, not the tract)</h2>
      <p>
        {permits
          ? `${permits.year}: ${permits.units.toLocaleString("en-US")} housing units permitted in ${t.county} (${permits.units5plus.toLocaleString("en-US")} in buildings of 5+ units)${permits.change == null ? "" : `, ${(permits.change * 100).toFixed(1)}% vs the prior year`}.`
          : "Not available."}
      </p>

      <h2>Sources</h2>
      <ul className="note">
        {[...sourceIds].map((id) => {
          const s = SOURCES[id as SourceId];
          return s ? (
            <li key={id}>
              {s.attribution} ({s.vintage}; {s.geography})
            </li>
          ) : null;
        })}
      </ul>
      <p className="note">
        Informational only, not investment, tax or legal advice. Live site context (flood zone, earthquake design category, wildfire likelihood, nearby EPA sites, traffic, county
        labor market) is available through the MCP <code>nearby</code> tool.
      </p>
    </main>
  );
}
