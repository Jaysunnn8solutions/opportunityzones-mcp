import Link from "next/link";
import { PERSONA_GROUPS, PERSONAS } from "@/lib/content/personas";
import { designationNote, designationPublication, designationRoundTotals } from "@/lib/data/tracts";

/** Start: what the program is, where things stand, and where to go next. */
export default function StartPage() {
  const totals = designationRoundTotals();
  const published = designationPublication();
  const n = (v: number) => v.toLocaleString("en-US");
  return (
    <main className="page">
      <section className="hero">
        <h1>Opportunity Zones, step by step</h1>
        <p className="lead">
          The Opportunity Zone program gives federal tax benefits to people who reinvest <strong>capital gains</strong> through
          a <strong>Qualified Opportunity Fund</strong> into property or businesses in <strong>designated low-income census
          tracts</strong>. A new round of zones takes effect on January 1, 2027.
        </p>
        <ol className="pipeline" aria-label="The three parts">
          <li>
            <span className="pipeline-n">1</span>
            <strong>A capital gain</strong>
            <span>from selling stock, a business, real estate or other assets</span>
          </li>
          <li>
            <span className="pipeline-n">2</span>
            <strong>A Qualified Opportunity Fund</strong>
            <span>an existing fund, or one you set up, that holds at least 90% of its assets in zones</span>
          </li>
          <li>
            <span className="pipeline-n">3</span>
            <strong>A designated zone</strong>
            <span>new or substantially improved property, or an operating business, in a designated tract</span>
          </li>
        </ol>
        <p>
          <Link className="button" href="/guide">
            Start the guided check
          </Link>{" "}
          <span className="hint">A few questions, then a checklist of how the rules apply and what to ask an adviser.</span>
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
            <strong>December 31, 2026:</strong> gains deferred under the original rules become taxable.
          </li>
          <li>
            <strong>January 1, 2027:</strong> the new zones and the new rules for newly invested gains begin.
          </li>
          <li>
            <strong>Through 2028:</strong> the 2018 zones remain in effect.
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
