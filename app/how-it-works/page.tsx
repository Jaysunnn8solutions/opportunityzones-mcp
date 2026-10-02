import type { Metadata } from "next";
import Link from "next/link";
import { Cite } from "@/app/ui/Cite";
import { designationRoundTotals } from "@/lib/data/tracts";

export const metadata: Metadata = { title: "How Opportunity Zones work" };

/**
 * The statutory mechanics, shown generically (AGENTS.md): what the law does,
 * never what a reader should do. Every rule cites lib/content/rules.ts, where
 * each is quoted word for word from the statute, regulations or IRS guidance.
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
        advice: the rules have details and exceptions, and a tax advisor should confirm how they apply to any real situation.
      </p>

      <nav className="toc" aria-label="On this page">
        <a href="#gain">1. The gain</a>
        <a href="#fund">2. The fund</a>
        <a href="#zone">3. The zone</a>
        <a href="#benefits">The benefits</a>
        <a href="#selling-2026">Selling in 2026?</a>
        <a href="#designation">Eligible vs designated</a>
        <a href="#timeline">Timeline</a>
        <a href="#sources">Sources</a>
      </nav>

      <section id="gain">
        <h2>1. The gain</h2>
        <p>
          The benefits apply to <strong>capital gains</strong> and qualified section 1231 gains that are reinvested: for
          example, from selling stock, a business interest, or real estate held as an investment, to an unrelated buyer.{" "}
          <Cite rules={["eligibleGains"]} />
        </p>
        <p>
          Generally, the gain must be invested within <strong>180 days</strong>, starting on the day it would otherwise be
          taxed, which for a sale is the sale date. Only the <em>gain</em> needs to be invested, and only that amount gets the
          benefits; other money in the same fund is a separate investment without them.{" "}
          <Cite rules={["window180", "gainOnly"]} />
        </p>
        <p>
          <strong>Ordinary income does not qualify.</strong> Ordinary gain is not eligible, and property held for sale to
          customers (such as a dealer&apos;s inventory) is not a capital asset, so profit on selling it is not a capital gain.{" "}
          <Cite rules={["eligibleGains"]} />
        </p>
        <p>
          Some gains start their 180 days on a different date: gains passed through from a partnership or S corporation,
          installment sales, and section 1231 gains. <Cite rules={["passThroughTiming", "installmentTiming", "section1231Timing"]} />
        </p>
      </section>

      <section id="fund">
        <h2>2. The fund</h2>
        <p>
          The gain goes into a <strong>Qualified Opportunity Fund</strong> (QOF), not directly into a property. A QOF is a
          corporation or partnership for tax purposes that certifies itself to the IRS on <strong>Form 8996</strong> and must
          hold at least <strong>90% of its assets</strong> in qualified opportunity zone property, measured twice a year, or pay
          a monthly penalty. Under the 2025 law it also files an annual information return.{" "}
          <Cite rules={["fund", "fundPenalty", "fundReporting"]} />
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
          <li>
            It is <strong>bought</strong>, from a seller that is not related to the fund, and used in the fund&apos;s trade or
            business, mostly in the zone. <Cite rules={["purchaseUnrelated", "businessUse", "useInZone"]} />
          </li>
          <li>
            It is bought after the zone&apos;s start date. <strong>Property bought after December 31, 2026, must be in a zone
            designated under the 2025 law</strong> (the 2027 zones); in the zones designated in 2018, new purchases qualify only
            under narrow transition rules. <Cite rules={["boughtAfterStart"]} />
          </li>
          <li>
            Either its <strong>original use</strong> begins with the fund (for example, a new building no one has placed in
            service, or one vacant long enough), or it is <strong>substantially improved</strong>: within 30 months, the fund
            adds more to the building&apos;s basis than the building&apos;s basis when bought. The land is measured separately.{" "}
            <Cite rules={["originalUse", "substantialImprovement"]} />
          </li>
          <li>
            In a zone made up entirely of a rural area, the improvement bar is <strong>50%</strong>. The 2025 law says this took
            effect on July 4, 2025, and the IRS applies it to rural 2018 zones too. <Cite rules={["ruralImprovement"]} />
          </li>
          <li>
            Unimproved land does not have to be substantially improved, unless it is bought expecting to improve it by no more
            than an insubstantial amount. <Cite rules={["land"]} />
          </li>
        </ul>
        <p>
          A fund can also invest, by buying stock or a partnership interest for cash, in an operating business in a zone, which
          then has its own tests for its property, income and assets. <Cite rules={["equityNotLoan", "zoneBusiness"]} />
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
              <td>
                Tax on the reinvested gain is put off until the investment is sold or five years pass, whichever comes first.{" "}
                <Cite rules={["deferralFiveYears"]} />
              </td>
            </tr>
            <tr>
              <td>Basis step-up</td>
              <td>
                After five years, 10% of the deferred gain is never taxed; <strong>30%</strong> for an investment in a qualified
                rural opportunity fund. <Cite rules={["stepUp", "ruralFund"]} />
              </td>
            </tr>
            <tr>
              <td>Tax-free growth</td>
              <td>
                Held at least <strong>ten years</strong>, the increase in value of the Opportunity Zone investment itself can be
                excluded from tax when it is sold (with a limit at 30 years). <Cite rules={["tenYears"]} />
              </td>
            </tr>
          </tbody>
        </table>
        <p className="note">
          This tool never calculates a tax outcome for anyone. The figures above describe the statute; how they apply depends on
          the facts.
        </p>
      </section>

      <section id="selling-2026">
        <h2>Selling in 2026?</h2>
        <p>
          What decides which rules apply is <strong>when the gain is invested</strong>, not when the sale happened.
        </p>
        <ul>
          <li>
            A gain from a 2026 sale can be invested <strong>on or after January 1, 2027</strong>, under the new rules above, as
            long as it is invested within its 180 days. Counting 180 days from the sale, that is possible for sales from about
            early July 2026 onward; the <Link href="/guide">guided check</Link> works out the date for a given sale.{" "}
            <Cite rules={["gain2026Invested2027", "window180"]} />
          </li>
          <li>
            A gain invested <strong>on or before December 31, 2026</strong>, falls under the original rules: the deferred gain is
            taxed no later than the tax year that includes December 31, 2026, though the ten-year benefit can still apply.{" "}
            <Cite rules={["investedBy2026"]} />
          </li>
          <li>
            Some gains start their 180 days later than the sale, for example gains passed through from a partnership, which can
            start on the last day of the partnership&apos;s year or on its return due date.{" "}
            <Cite rules={["passThroughTiming", "installmentTiming"]} />
          </li>
        </ul>
        <p className="note">Day counting and which start date applies to a particular gain are questions for a tax advisor.</p>
      </section>

      <section id="designation">
        <h2>Eligible is not designated</h2>
        <p>
          Treasury published the tracts that are <strong>eligible</strong> for 2027: {n(totals.eligible)} low-income census
          tracts. From these, each state&apos;s governor nominates up to a quarter of its eligible tracts (or up to 25 in a
          state with fewer than 100), and Treasury certifies them. So at most <strong>{n(totals.maxDesignated)}</strong> tracts
          can be designated nationally. The benefits apply only in designated zones.{" "}
          <Cite rules={["designatedNotEligible", "stateCap"]} />
        </p>
        <ul>
          <li>
            A tract is eligible if its median family income is at or below 70% of its area&apos;s, or its poverty rate is at least
            20% <em>and</em> its income is at or below 125% of its area&apos;s (the area is the metro area, or the state outside
            metro areas). <Cite rules={["eligibility"]} />
          </li>
          <li>
            Tracts next to a zone no longer qualify just by being next to one. <Cite rules={["noContiguous"]} />
          </li>
          <li>
            Rural tracts matter twice: a zone made up entirely of a rural area has the lower improvement bar, and a fund investing
            in such zones can earn the larger step-up. <Cite rules={["ruralImprovement", "ruralFund"]} />
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
            <strong>2018 to 2028:</strong> the original zones (designated in 2018) remain designated through December 31, 2028.{" "}
            <Cite rules={["zones2018End"]} /> How they fared against comparable tracts:{" "}
            <Link href="/2018-zones">Did the 2018 zones gain more money?</Link>
          </li>
          <li>
            <strong>July 1 to October 28, 2026 (at the latest):</strong> governors nominate 2027 zones; Treasury then has 30 days
            to certify them. <Cite rules={["nominationTimeline"]} />
          </li>
          <li>
            <strong>December 31, 2026:</strong> gains deferred under the original rules are taxed no later than the tax year that
            includes this date. <Cite rules={["investedBy2026"]} />
          </li>
          <li>
            <strong>January 1, 2027:</strong> the new zones start, running to December 31, 2036, and the new rules apply to
            amounts invested from this date. Nominations restart every ten years.{" "}
            <Cite rules={["zonePeriod", "gain2026Invested2027"]} />
          </li>
        </ol>
      </section>

      <section id="sources">
        <h2>Sources</h2>
        <p>
          Every rule on this page links to its source. <Link href="/rules">Rules and sources</Link> quotes the exact text behind
          each one.
        </p>
        <ul>
          <li>
            Statute:{" "}
            <a href="https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title26-section1400Z-1&num=0&edition=prelim">
              26 U.S.C. § 1400Z-1
            </a>{" "}
            (designation) and{" "}
            <a href="https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title26-section1400Z-2&num=0&edition=prelim">
              § 1400Z-2
            </a>{" "}
            (funds and tax treatment), as amended by{" "}
            <a href="https://www.govinfo.gov/content/pkg/PLAW-119publ21/html/PLAW-119publ21.htm">Public Law 119-21</a>, § 70421.
          </li>
          <li>
            Regulations:{" "}
            <a href="https://www.ecfr.gov/current/title-26/chapter-I/subchapter-A/part-1/section-1.1400Z2(a)-1">
              26 CFR §§ 1.1400Z2(a)-1 to (f)-1
            </a>
            .
          </li>
          <li>
            IRS guidance: <a href="https://www.irs.gov/pub/irs-drop/n-26-40.pdf">Notice 2026-40</a> (transition),{" "}
            <a href="https://www.irs.gov/pub/irs-drop/n-25-50.pdf">Notice 2025-50</a> (rural substantial improvement) and{" "}
            <a href="https://www.irs.gov/pub/irs-drop/rp-26-14.pdf">Rev. Proc. 2026-14</a> (nominations).
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
