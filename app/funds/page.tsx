import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Finding and reviewing Opportunity Zone funds" };

/**
 * Where funds are found and what to ask them, in general terms. By rule
 * (AGENTS.md) this page names no fund, sponsor or deal and ranks nothing; it
 * sends the reader to public records and to the property checker.
 */

const EDGAR_UI = "https://www.sec.gov/edgar/search/#/q=%22opportunity%20zone%22&forms=D";

const QUESTIONS: Array<[string, string[]]> = [
  [
    "Where the money goes",
    [
      "A list of every property and business the fund owns or plans to buy, with street addresses. Check each one on the Check properties page.",
      "Are those tracts designated zones? A 2018 zone runs through 2028; a tract that is only eligible for 2027 is not a zone until Treasury certifies it.",
      "If the assets are not chosen yet (a \"blind pool\"), how and by when will locations be picked?",
      "Does the fund intend to qualify as a rural opportunity fund, which carries a larger step-up under the 2027 rules?",
    ],
  ],
  [
    "Staying qualified",
    [
      "Has the fund certified itself on IRS Form 8996, and has it met the 90% asset test at each testing date?",
      "For existing buildings: what is the substantial-improvement budget, and the schedule to finish it within 30 months?",
      "How is uninvested cash handled while projects get going (the working-capital safe harbor)?",
      "How will the fund meet the reporting requirements added in 2025?",
    ],
  ],
  [
    "Timing",
    [
      "When do investments close, and does that fit within 180 days of the sale that produced the gain?",
      "Does the fund plan to hold for at least ten years, and how does it expect to exit?",
    ],
  ],
  [
    "Costs, people and paperwork",
    [
      "Fees, carried interest, leverage and any capital calls.",
      "The sponsor's track record, audited financial statements, and when investors receive tax forms (K-1s).",
      "Whether an independent attorney or accountant has reviewed the offering documents for you.",
    ],
  ],
];

export default function FundsPage() {
  return (
    <main className="page prose">
      <h1>Finding and reviewing Opportunity Zone funds</h1>
      <p className="lead">
        This tool does not list, rate or recommend funds: it describes places. There is also no official registry. Funds certify
        themselves to the IRS on Form 8996 with their tax returns, which are confidential. So finding a fund, and seeing where it
        actually invests, takes some legwork. This page lays out where to look and what to ask.
      </p>

      <section>
        <h2>Where funds can be found</h2>
        <ul className="steps">
          <li>
            <strong>Public securities filings.</strong> Many funds raising money from investors file a <em>Form D</em> with the
            SEC. A <a href={EDGAR_UI}>search of EDGAR for &quot;opportunity zone&quot; in Form D filings</a> is a starting
            point. A Form D shows who is raising money and how much, but not where it will be invested.
          </li>
          <li>
            <strong>Financial advisers and broker-dealers.</strong> Many funds are private offerings, often limited to accredited
            investors and sold through advisers, broker-dealers or investment platforms.
          </li>
          <li>
            <strong>Sponsors and directories.</strong> Fund sponsors and commercial directories publish offerings. Treat these as
            marketing, and verify the details independently.
          </li>
          <li>
            <strong>State and local economic development offices.</strong> Many publish Opportunity Zone project lists or
            prospectuses for projects looking for investment.
          </li>
          <li>
            <strong>A fund of your own.</strong> A fund can be set up for a single project, with an attorney and accountant,
            instead of investing in someone else&apos;s.
          </li>
        </ul>
        <p className="note">The EDGAR link opens the SEC&apos;s own search; results include unrelated filings.</p>
      </section>

      <section>
        <h2>Questions to ask a fund</h2>
        {QUESTIONS.map(([title, items]) => (
          <div key={title} className="checklist">
            <h3>{title}</h3>
            <ul>
              {items.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="callout">
        <h2>Check the answers against the map</h2>
        <p>
          Paste the fund&apos;s property addresses (or census tract numbers) into <Link href="/check">Check properties</Link>. For
          each one you get its census tract, whether it is in a 2018 zone, whether it is eligible for 2027 and where its state
          stands in the designation round, and whether it is rural. From there, each tract page shows the place in detail.
        </p>
        <p>
          <Link className="button" href="/check">
            Check a fund&apos;s properties
          </Link>
        </p>
      </section>

      <p className="note">
        General information, not investment, tax or legal advice. An independent adviser should review any offering before you
        invest.
      </p>
    </main>
  );
}
