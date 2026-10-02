import type { Metadata } from "next";
import Link from "next/link";
import type { Lift } from "@/lib/analysis/lift";
import { loadGrowth } from "@/lib/data/growth";
import { SOURCES } from "@/pipeline/sources";

export const metadata: Metadata = { title: "Did the 2018 zones gain more money?" };

/** Display range for the lift charts, in control standard deviations. */
const RANGE = 0.2;

function pos(v: number): number {
  return Math.max(0, Math.min(100, 50 + (v / RANGE) * 50));
}

/** One estimate with its 95% interval against a zero line; filled when clear. */
function LiftBar({ lift, clear, label }: { lift: Lift; clear: boolean; label: string }) {
  const lo = pos(lift.low);
  const hi = pos(lift.high);
  return (
    <div className="liftbar" role="img" aria-label={label} title={label}>
      <span className="liftbar-zero" />
      <span className="liftbar-ci" style={{ left: `${lo}%`, width: `${Math.max(0.5, hi - lo)}%` }} />
      <span className={clear ? "liftbar-dot clear" : "liftbar-dot"} style={{ left: `${pos(lift.estimate)}%` }} />
    </div>
  );
}

const signed = (v: number, digits = 2) => {
  const s = Math.abs(v).toFixed(digits);
  return Number(s) === 0 ? s : `${v > 0 ? "+" : "−"}${s}`;
};

function natural(unit: string, direction: number, l: Lift | null): string {
  if (!l) return "n/a";
  if (unit === "log") {
    const p = (x: number) => (Math.exp(x) - 1) * 100;
    return `${signed(p(l.estimate), 1)}% (95%: ${signed(p(l.low), 1)} to ${signed(p(l.high), 1)})`;
  }
  const p = (x: number) => x * 100;
  void direction;
  return `${signed(p(l.estimate))} pts (95%: ${signed(p(l.low))} to ${signed(p(l.high))})`;
}

/**
 * The 2018-zone comparison: designated tracts against eligible tracts that
 * were not designated, on measures of money in the tract. Describes what
 * happened; it predicts nothing and recommends nothing.
 */
export default function Zones2018Page() {
  const g = loadGrowth();
  if (!g) {
    return (
      <main className="page prose">
        <h1>Did the 2018 zones gain more money?</h1>
        <p>The analysis has not been built yet (data/oz1/growth.json).</p>
      </main>
    );
  }
  const n = (v: number) => v.toLocaleString("en-US");
  const c = g.composite;
  const clearLift = (l: Lift | null) => !!l && (l.low > 0 || l.high < 0);
  const src = (id: keyof typeof SOURCES) => SOURCES[id];

  return (
    <main className="page prose">
      <h1>Did the 2018 zones gain more money?</h1>
      <p className="lead">
        The {n(g.treated)} tracts designated as Opportunity Zones in 2018, compared with the {n(g.controls)} tracts that were
        eligible but not picked, from 2012-2016 to 2020-2024, on measures of money in the tract. Each tract is compared with
        tracts in the same state that started at the same level and were on the same trend.
      </p>

      <div className="callout warn">
        <strong>Read this first.</strong> Governors did not pick zones at random, so this is a careful comparison, not proof of
        what designation caused. Census tract figures cannot tell whether the people living there gained, or better-off people
        moved in; population and housing changes are shown for that reason. It describes places and predicts nothing.
      </div>

      <section>
        <h2>The overall answer</h2>
        {c && (
          <div className="stats">
            <div>
              <strong>{signed(c.estimate)}</strong>
              <span>
                average lift across the measures, in standard deviations of how comparable tracts varied (95%: {signed(c.low)} to{" "}
                {signed(c.high)}). {Math.abs(c.estimate) < 0.1 ? "Small: most zones did about as well as comparable tracts." : ""}
              </span>
            </div>
            <div>
              <strong>{n(g.treated)}</strong>
              <span>2018 zones compared (50 states and DC)</span>
            </div>
            <div>
              <strong>{n(g.controls)}</strong>
              <span>eligible tracts not picked, as the comparison group</span>
            </div>
          </div>
        )}
      </section>

      <section>
        <h2>By measure</h2>
        <p>
          The dot is the difference between zones and comparable tracts; the line is its 95% range. Right of the center line is
          more money (for poverty, SNAP, vacancy and households without a vehicle, a fall counts as more money). A filled dot is
          clearly different from zero.
        </p>
        <table className="lift-table">
          <thead>
            <tr>
              <th>Measure</th>
              <th>Zones vs comparable tracts</th>
              <th className="lift-col" aria-label="Chart">
                <div className="lift-axis">
                  <span>worse</span>
                  <span>better</span>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {g.outcomes.map((o) =>
              o.lift ? (
                <tr key={o.column}>
                  <td>{o.label}</td>
                  <td>
                    {natural(o.unit, o.direction, o.natural)}
                    <span className="hint"> · {n(o.lift.nTreated)} zones</span>
                  </td>
                  <td className="lift-col">
                    <LiftBar lift={o.lift} clear={clearLift(o.lift)} label={`${o.label}: ${natural(o.unit, o.direction, o.natural)}`} />
                  </td>
                </tr>
              ) : null,
            )}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Population and housing changes</h2>
        <table className="rules">
          <thead>
            <tr>
              <th>Median change, 2016 to 2024</th>
              <th>2018 zones</th>
              <th>Comparison tracts</th>
            </tr>
          </thead>
          <tbody>
            {g.context.map((x) => (
              <tr key={x.column}>
                <td>{x.label}</td>
                {[x.treated, x.control].map((v, i) => (
                  <td key={i}>{v == null ? "n/a" : x.unit === "log" ? `${signed((Math.exp(v) - 1) * 100, 1)}%` : `${signed(v * 100)} pts`}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>For which kinds of tract was the lift larger?</h2>
        <p>
          Each 2016 condition splits a state&apos;s tracts into thirds; within each third, zones are compared with the comparison
          tracts in the same third. Many groups are tested at once, so a group is marked clear (●) only at 99% confidence.
          Where the ranges overlap, the groups are not shown to differ from one another.
        </p>
        <table className="lift-table groups">
          <thead>
            <tr>
              <th>2016 condition</th>
              <th>Group</th>
              <th>Lift (95% range)</th>
              <th className="lift-col" aria-label="Chart">
                <div className="lift-axis">
                  <span>worse</span>
                  <span>better</span>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {g.groups.flatMap((gr) =>
              gr.bins.map((b, i) =>
                b.lift ? (
                  <tr key={`${gr.feature}-${b.bin}`} className={i === 0 ? "group-start" : undefined}>
                    <td>{i === 0 ? gr.label : ""}</td>
                    <td>{b.bin}</td>
                    <td>
                      {signed(b.lift.estimate)} ({signed(b.lift.low)} to {signed(b.lift.high)}) {b.clear === "positive" ? "●" : b.clear === "negative" ? "○" : ""}
                      <span className="hint"> · {n(b.lift.nTreated)} zones</span>
                    </td>
                    <td className="lift-col">
                      <LiftBar lift={b.lift} clear={b.clear != null} label={`${gr.label}, ${b.bin}: ${signed(b.lift.estimate)}`} />
                    </td>
                  </tr>
                ) : null,
              ),
            )}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Finding 2027 tracts like the ones that benefited</h2>
        <p>
          The next step is to point to 2027-eligible tracts that share the conditions under which designation clearly lifted money
          in the tract. That waits for the full set of measures (income per person, high-income households, SNAP, public
          assistance, vehicles, mortgages) and a check that the groups differ from one another, not just from zero. Until then no
          tract is labeled as &quot;like the ones that benefited&quot;.
        </p>
      </section>

      <section>
        <h2>How it was done</h2>
        <ul>
          <li>
            Zones: the 2018 designated low-income-community tracts. Comparison: eligible low-income-community tracts not designated.
            Puerto Rico is left out (every eligible tract there was designated, so there is no comparison group).
          </li>
          <li>
            For each measure, a regression fitted on the comparison tracts predicts the 2016-2024 change from the tract&apos;s own
            2016 level and 2011-2016 trend, density, poverty, income, education and unemployment in 2016, and its state. A
            tract&apos;s lift is how far it beat or missed that prediction, scaled by how much comparison tracts varied.
          </li>
          <li>
            Dollar figures are adjusted for inflation (CPI-U). 2020-2024 figures are moved onto 2010 tract boundaries through the
            Census block relationship files, weighted by population and housing.
          </li>
          <li>
            Ranges treat tracts as independent; neighboring tracts are not, so the true ranges are somewhat wider.
          </li>
        </ul>
        <p className="note">
          Data:{" "}
          {(["oz1Designated", "oz1Eligible", "acs5", "fhfaTractHpi", "lodesWac", "hmdaLar"] as const).map((id, i) => (
            <span key={id}>
              {i > 0 && "; "}
              <a href={src(id).homepage} target="_blank" rel="noopener noreferrer">
                {src(id).name} ↗
              </a>{" "}
              ({src(id).publisher})
            </span>
          ))}
          . Generated {g.generated}. See also the full <Link href="/how-it-works">How it works</Link> and the map&apos;s 2018 zone
          layer.
        </p>
      </section>
    </main>
  );
}
