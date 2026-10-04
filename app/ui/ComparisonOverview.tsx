import type { PlaceProfile } from "@/lib/client/place";
import { displayValue } from "@/lib/client/presentation";
import { comparisonOverview } from "@/lib/research/measures";

export default function ComparisonOverview({ profiles, keys }: { profiles: PlaceProfile[]; keys: string[] }) {
  const overview = comparisonOverview(profiles, keys);
  if (!overview.tractCount || !overview.statistics.length) return null;
  return <section className="comparison-overview" aria-labelledby="comparison-overview-heading">
    <h2 id="comparison-overview-heading">Your selection at a glance</h2>
    <p>{overview.tractCount} {overview.tractCount === 1 ? "tract" : "tracts"} across {overview.countyCount} {overview.countyCount === 1 ? "county or equivalent" : "counties or equivalents"} in {overview.stateCount} {overview.stateCount === 1 ? "state or territory" : "states or territories"}.</p>
    <dl className="comparison-overview-stats">
      {overview.statistics.map((stat) => <div key={stat.key}>
        <dt>{stat.label}<span>{stat.method}</span></dt>
        <dd>
          <strong className={stat.value == null ? "stat-unavailable" : undefined}>{stat.value == null ? "Not summarized" : displayValue(stat.value, stat.unit)}</strong>
          <span>{stat.available} of {stat.total} tracts with published values{stat.partial && stat.available > 0 ? " · partial coverage" : ""}</span>
          {stat.reason ? <span>{stat.reason}</span> : stat.source && <a href={stat.source.url} target="_blank" rel="noopener noreferrer">{stat.source.publisher} · {stat.source.vintage}</a>}
        </dd>
      </div>)}
    </dl>
    <p className="hint">Totals add published counts. Medians describe the middle tract value, with each tract weighted equally; they are not combined household medians or population-wide rates. Missing values are excluded, never treated as zero. Statistical uncertainty is not assessed.</p>
  </section>;
}
