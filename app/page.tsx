import Link from "next/link";
import { PERSONA_GROUPS, PERSONAS } from "@/lib/content/personas";
import { stateSummaries } from "@/lib/data/stateViews";
import { designationNote, designationPublication, designationRoundTotals } from "@/lib/data/tracts";
import FrontDoor from "./ui/FrontDoor";
import { Cite } from "./ui/Cite";

/** Start: what the program is, where things stand, and where to go next. */
export default function StartPage() {
  const totals = designationRoundTotals();
  const published = designationPublication();
  const states = stateSummaries();
  const n = (v: number) => v.toLocaleString("en-US");
  return (
    <main className="page">
      <section className="hero">
        <p className="card-kicker">2027 Opportunity Zones</p>
        <h1>Is this place in an Opportunity Zone, and what would that mean?</h1>
        <p className="lead">
          Check any address, census tract or state against the 2027 rules, in plain English, with the public data behind it. Then
          see how the program works for your situation.
        </p>
        <FrontDoor states={states} />
      </section>

      <section className="how">
        <h2>How the program works, in three parts</h2>
        <ol className="flow" aria-label="The three parts">
          <li>
            <span className="flow-n">1</span>
            <strong>A capital gain</strong>
            <span>From selling stock, a business, or real estate held as an investment. Generally 180 days to reinvest it.</span>
          </li>
          <li className="flow-arrow" aria-hidden="true">
            →
          </li>
          <li>
            <span className="flow-n">2</span>
            <strong>A Qualified Opportunity Fund</strong>
            <span>An existing fund, or one set up for a project, holding at least 90% of its assets in zones.</span>
          </li>
          <li className="flow-arrow" aria-hidden="true">
            →
          </li>
          <li>
            <span className="flow-n">3</span>
            <strong>A designated zone</strong>
            <span>New or substantially improved property, or an operating business, in a designated tract.</span>
          </li>
        </ol>
        <p>
          <Link className="button" href="/guide">
            Start the guided check
          </Link>{" "}
          <Link className="button secondary" href="/how-it-works">
            How it works
          </Link>
        </p>
      </section>

      <section>
        <h2>Which describes you?</h2>
        {PERSONA_GROUPS.map((g) => (
          <div key={g.id} className="persona-group">
            <h3>{g.title}</h3>
            <div className="cards personas">
              {PERSONAS.filter((p) => p.group === g.id).map((p) => (
                <Link key={p.slug} className="card" href={`/for/${p.slug}`}>
                  <span className="card-kicker">{p.who}</span>
                  <strong>{p.title}</strong>
                  <span>{p.summary}</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section>
        <h2>Or go straight to a tool</h2>
        <div className="cards">
          <Link className="card" href="/how-it-works">
            <span className="card-kicker">New to this</span>
            <strong>Understand the program</strong>
            <span>The gain, the fund and the zone; the 180-day window; what the 2027 rules change; eligible versus designated.</span>
          </Link>
          <Link className="card" href="/map">
            <span className="card-kicker">I have a place in mind</span>
            <strong>Look up a location</strong>
            <span>Search an address or browse a state: 2027 eligibility, rural status, the state&apos;s cap, and the data around it.</span>
          </Link>
          <Link className="card" href="/funds">
            <span className="card-kicker">I&apos;m considering a fund</span>
            <strong>Find and review funds</strong>
            <span>Where funds can be found, and the questions to ask a sponsor before investing a gain.</span>
          </Link>
          <Link className="card" href="/check">
            <span className="card-kicker">I have a list of properties</span>
            <strong>Check where properties sit</strong>
            <span>Paste a fund&apos;s property addresses or tract numbers and see each one&apos;s zone status in one table.</span>
          </Link>
        </div>
      </section>

      <section>
        <h2>Where the 2027 round stands</h2>
        <div className="stats">
          <div>
            <strong>{n(totals.eligible)}</strong>
            <span>census tracts are eligible for 2027 (Treasury&apos;s list)</span>
          </div>
          <div>
            <strong>{n(totals.maxDesignated)}</strong>
            <span>at most can be designated: each state picks up to about a quarter of its eligible tracts</span>
          </div>
          <div>
            <strong>Jan 1, 2027</strong>
            <span>new zones take effect, for ten years</span>
          </div>
        </div>
        <ol className="timeline">
          <li>
            <strong>2026:</strong> governors nominate tracts from their state&apos;s eligible list; Treasury certifies them.{" "}
            {designationNote()}{" "}
            {published.certified < published.jurisdictions && (
              <>
                Until a state&apos;s list is out, this tool shows its eligible tracts as <em>pending</em>.
              </>
            )}
          </li>
          <li>
            <strong>December 31, 2026:</strong> gains deferred under the original rules are taxed no later than the tax year
            that includes this date. <Cite rules={["investedBy2026"]} />
          </li>
          <li>
            <strong>January 1, 2027:</strong> the new zones (to December 31, 2036) and the new rules begin. The new rules apply to
            amounts invested from this date, including gains from 2026 sales still within their 180 days.{" "}
            <Cite rules={["zonePeriod", "gain2026Invested2027"]} />
          </li>
          <li>
            <strong>Through 2028:</strong> the 2018 zones remain designated, but property bought in them after 2026 generally does
            not qualify. <Cite rules={["zones2018End", "boughtAfterStart"]} />
          </li>
        </ol>
        <p className="note">
          Counts are computed from Treasury&apos;s 2027 eligibility file across {totals.jurisdictions} states and territories. See{" "}
          <Link href="/how-it-works">How it works</Link> for the rules and sources.
        </p>
      </section>

      <section>
        <h2>Use it from Claude</h2>
        <p>
          The same data is available to Claude as an MCP server: look up an address, profile a tract, list and compare tracts in a
          state, and see flood, earthquake, wildfire and other context around a site.{" "}
          <Link href="/use-with-claude">How to connect it and what to ask</Link>.
        </p>
      </section>
    </main>
  );
}
