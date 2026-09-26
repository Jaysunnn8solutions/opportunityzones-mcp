import type { Metadata } from "next";
import Link from "next/link";
import { designationRoundTotals } from "@/lib/data/tracts";

export const metadata: Metadata = { title: "How Opportunity Zones work" };

/**
 * The statutory mechanics, shown generically (AGENTS.md): what the law does,
 * never what a reader should do. Rules are those of IRC §§ 1400Z-1 and 1400Z-2
 * as amended by P.L. 119-21 § 70421, for gains invested from 2027.
 */
export default function HowItWorksPage() {
  const totals = designationRoundTotals();
  const n = (v: number) => v.toLocaleString("en-US");
  return (
    <main className="page prose">
      <h1>How Opportunity Zones work</h1>
      <p className="lead">
        Three things have to line up: a <strong>capital gain</strong>, a <strong>Qualified Opportunity Fund</strong>, and
        property or a business in a <strong>designated zone</strong>. This page explains each in general terms. It is not tax
        advice: the rules have details and exceptions, and a tax adviser should confirm how they apply to any real situation.
      </p>

      <nav className="toc" aria-label="On this page">
        <a href="#gain">1. The gain</a>
        <a href="#fund">2. The fund</a>
        <a href="#zone">3. The zone</a>
        <a href="#benefits">The benefits</a>
        <a href="#designation">Eligible vs designated</a>
        <a href="#timeline">Timeline</a>
        <a href="#sources">Sources</a>
      </nav>

      <section id="gain">
        <h2>1. The gain</h2>
        <p>
          The benefits apply to <strong>capital gains</strong> that are reinvested: for example, from selling stock, a business,
          real estate or other capital assets. Generally, the gain must be invested within <strong>180 days</strong> of the sale.
          Only the <em>gain</em> needs to be invested, not the whole sale proceeds.
        </p>
        <p>
          <strong>Ordinary income does not qualify.</strong> Wages, a business&apos;s operating profit, and profit on selling
          inventory (for example, houses a builder builds in order to sell) are not capital gains, so they cannot be deferred
          this way. Net gains on business property held more than a year (section 1231) can qualify, with their own timing
          rules.
        </p>
        <p>
          Money that is not a reinvested gain can go into the same fund, but that part receives none of the Opportunity Zone tax
          benefits. Some gains (for example, those passed through from partnerships) have their own timing rules.
        </p>
      </section>

      <section id="fund">
        <h2>2. The fund</h2>
        <p>
          The gain goes into a <strong>Qualified Opportunity Fund</strong> (QOF), not directly into a property. A QOF is a
          corporation or partnership that certifies itself to the IRS on <strong>Form 8996</strong> and must hold at least{" "}
          <strong>90% of its assets</strong> in qualified opportunity zone property, tested twice a year.
        </p>
        <p>
          It can be an existing fund run by a sponsor, or one set up for a single project. The IRS does not publish a list of
          funds; <Link href="/funds">Funds</Link> explains where they can be found and what to ask.
        </p>
      </section>

      <section id="zone">
        <h2>3. The zone</h2>
        <p>
          The fund&apos;s property or business has to be in a <strong>designated</strong> Opportunity Zone. For property, the
          general rules are:
        </p>
        <ul>
          <li>It is bought after the zone was designated.</li>
          <li>
            Either its <strong>original use</strong> begins with the fund (for example, new construction), or it is{" "}
            <strong>substantially improved</strong>: roughly, the fund invests at least as much again in the building as it paid
            for it, within 30 months. Under the 2027 rules the bar is lower for rural zones (50%).
          </li>
          <li>Land does not have to be improved, but it has to be used in an active business; simply holding land does not qualify.</li>
        </ul>
        <p>
          A fund can also invest in an operating business located in a zone, which then has to meet its own tests for where its
          property, income and activity are.
        </p>
      </section>

      <section id="benefits">
        <h2>The benefits (gains invested under the 2027 rules)</h2>
        <table className="rules">
          <thead>
            <tr>
              <th>Benefit</th>
              <th>How it works, in general</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Deferral</td>
              <td>Tax on the reinvested gain is put off until the investment is sold or five years pass, whichever comes first.</td>
            </tr>
            <tr>
              <td>Basis step-up</td>
              <td>
                After five years, 10% of the deferred gain is never taxed; <strong>30%</strong> for an investment in a qualified
                rural opportunity fund.
              </td>
            </tr>
            <tr>
              <td>Tax-free growth</td>
              <td>
                Held at least <strong>ten years</strong>, the increase in value of the Opportunity Zone investment itself can be
                excluded from tax when it is sold (with a limit at 30 years).
              </td>
            </tr>
          </tbody>
        </table>
        <p className="note">
          This tool never calculates a tax outcome for anyone. The figures above describe the statute; how they apply depends on
          the facts.
        </p>
      </section>

      <section id="designation">
        <h2>Eligible is not designated</h2>
        <p>
          Treasury published the tracts that are <strong>eligible</strong> for 2027: {n(totals.eligible)} low-income census
          tracts. From these, each state&apos;s governor nominates up to a quarter of its eligible tracts (or up to 25 in a
          state with fewer than 100), and Treasury certifies them. So at most <strong>{n(totals.maxDesignated)}</strong> tracts
          can be designated nationally. The benefits apply only in designated zones.
        </p>
        <ul>
          <li>
            A tract is eligible if its median family income is at or below 70% of its area&apos;s, or its poverty rate is at least
            20% <em>and</em> its income is at or below 125% of its area&apos;s (the area is the metro area, or the state outside
            metro areas).
          </li>
          <li>Tracts next to a zone no longer qualify just by being next to one.</li>
          <li>
            Rural tracts matter twice: a rural zone has the lower improvement bar, and a fund investing in rural zones can earn the
            larger step-up.
          </li>
        </ul>
        <p>
          On the <Link href="/map">map</Link> and each tract page, an eligible tract shows as <em>pending</em>, with how many
          tracts its state may designate, until Treasury publishes the list.
        </p>
      </section>

      <section id="timeline">
        <h2>Timeline</h2>
        <ol className="timeline">
          <li>
            <strong>2018 to 2028:</strong> the original zones (designated in 2018) remain in effect through 2028.
          </li>
          <li>
            <strong>2026:</strong> governors nominate 2027 zones; Treasury certifies them.
          </li>
          <li>
            <strong>December 31, 2026:</strong> gains deferred under the original rules become taxable.
          </li>
          <li>
            <strong>January 1, 2027:</strong> new zones take effect for ten years, and the rules above apply to newly invested
            gains. New rounds of designations follow every ten years.
          </li>
        </ol>
      </section>

      <section id="sources">
        <h2>Sources</h2>
        <ul>
          <li>
            Statute: <a href="https://www.law.cornell.edu/uscode/text/26/1400Z-1">26 U.S.C. § 1400Z-1</a> (designation) and{" "}
            <a href="https://www.law.cornell.edu/uscode/text/26/1400Z-2">§ 1400Z-2</a> (funds and tax treatment), as amended by
            Public Law 119-21, § 70421.
          </li>
          <li>
            IRS: <a href="https://www.irs.gov/credits-deductions/businesses/opportunity-zones">Opportunity Zones</a> and{" "}
            <a href="https://www.irs.gov/forms-pubs/about-form-8996">Form 8996</a>.
          </li>
          <li>
            Treasury and the CDFI Fund: <a href="https://www.cdfifund.gov/opportunity-zones">Opportunity Zones resources</a>.
          </li>
        </ul>
        <p className="note">Informational only, not investment, tax or legal advice.</p>
      </section>
    </main>
  );
}
