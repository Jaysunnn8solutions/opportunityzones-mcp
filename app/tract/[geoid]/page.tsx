import Link from "next/link";
import { notFound } from "next/navigation";
import { SOURCES, type SourceId } from "@/pipeline/sources";
import { getTract, type Measure } from "@/lib/data/tracts";
import { statePositions } from "@/lib/data/compare";
import { statusLines } from "@/lib/tools/shared";
import Badges from "../../ui/Badges";
import PrintButton from "../../ui/PrintButton";
import SiteSnapshot from "../../ui/SiteSnapshot";

/** One tract's place report: the same data the get_tract tool returns, plus a live site snapshot. */

/** The headline numbers, each placed among the state's eligible tracts. */
const KEY_TILES: Array<[string, string]> = [
  ["population", "Population"],
  ["median_household_income", "Median household income"],
  ["poverty_rate", "Poverty rate"],
  ["median_home_value", "Median home value"],
  ["median_gross_rent", "Median gross rent"],
  ["unemployment_rate", "Unemployment rate"],
  ["jobs_2023", "Jobs located here (2023)"],
  ["share_built_before_1980", "Housing built before 1980"],
];

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
  for (const id of ["oz2Eligible", "urbanAreas2020", "oz1Designated", "hudQct", "hudDda", "nmtcLic", "censusBps", "censusCartographic2024"]) sourceIds.add(id);

  const positions = statePositions(t.geoid, KEY_TILES.map(([n]) => n));
  const m = t.measures;
  const meaning = [t.designation2027.text];
  if (t.rural.treasury) meaning.push(`${t.rural.explanation} Rural zones have a lower substantial-improvement bar, and rural funds a larger step-up.`);
  const z = m.oz2018_population_share.value;
  if (z != null && z >= 0.5) meaning.push("Also in a 2018 Opportunity Zone, which remains in effect through 2028.");

  return (
    <main className="page report">
      <p className="crumbs">
        <Link href="/">Start</Link> / <Link href={`/map#t=${t.geoid}`}>Map</Link> / Tract {t.geoid}
      </p>
      <header className="report-head">
        <span className="card-kicker">Census tract {t.geoid}</span>
        <h1>
          {t.county}, {t.state}
        </h1>
        {t.cbsa && <p className="hint">{t.cbsa}</p>}
        <Badges
          designation={t.designation2027.status}
          rural={t.rural.treasury}
          zone2018Share={z}
          qct={m.qct_2026.value}
          dda={m.dda_2026.value}
          nmtc={m.nmtc_lic.value}
        />
      </header>

      <section className="verdict">
        <h2>What this means</h2>
        <ul>
          {meaning.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <div className="answer-actions">
          <Link className="button" href="/guide">
            Run the guided check
          </Link>
          <Link className="button secondary" href="/how-it-works#designation">
            Eligible vs designated
          </Link>
          <Link className="button secondary" href="/funds">
            Finding funds
          </Link>
          <PrintButton />
        </div>
      </section>

      <section>
        <h2>At a glance</h2>
        <p className="hint">Compared with {t.state}&apos;s tracts that are eligible for 2027: a description of where this tract sits, not a score.</p>
        <div className="tiles">
          {KEY_TILES.map(([name, label]) => {
            const measure = m[name];
            const pos = positions[name];
            return (
              <div key={name} className="tile">
                <span className="tile-label">{label}</span>
                <strong>{measure ? formatValue(measure) : "n/a"}</strong>
                <span className="tile-detail">{pos.percentile == null ? "\u00a0" : `Higher than ${Math.round(pos.percentile * 100)}% of ${pos.peers.toLocaleString("en-US")} eligible tracts`}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2>Site snapshot</h2>
        <SiteSnapshot geoid={t.geoid} />
      </section>

      <section>
        <h2>2027 eligibility test</h2>
        <ul>
          {statusLines(t)
            .filter((l) => !l.startsWith("- 2027 designation:"))
            .map((l) => (
              <li key={l}>{l.replace(/^- /, "")}</li>
            ))}
        </ul>
      </section>

      <details className="all-measures">
        <summary>All published measures</summary>
        {GROUPS.map(([title, names]) => (
          <section key={title}>
            <h3>{title}</h3>
            <table className="rules">
              <tbody>
                {names.map((n) => {
                  const measure = m[n];
                  if (!measure) return null;
                  return (
                    <tr key={n}>
                      <td>{measure.description}</td>
                      <td className="value">{formatValue(measure)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ))}
        <h3>County building permits (county-level, not the tract)</h3>
        <p>
          {permits
            ? `${permits.year}: ${permits.units.toLocaleString("en-US")} housing units permitted in ${t.county} (${permits.units5plus.toLocaleString("en-US")} in buildings of 5+ units)${permits.change == null ? "" : `, ${(permits.change * 100).toFixed(1)}% vs the prior year`}.`
            : "Not available."}
        </p>
      </details>

      <section>
        <h2>Sources</h2>
        <ul className="note">
          {[...sourceIds].map((id) => {
            const src = SOURCES[id as SourceId];
            return src ? (
              <li key={id}>
                {src.attribution} ({src.vintage}; {src.geography})
              </li>
            ) : null;
          })}
        </ul>
        <p className="note">Informational only, not investment, tax or legal advice. This report describes a place; it does not recommend it.</p>
      </section>
    </main>
  );
}
