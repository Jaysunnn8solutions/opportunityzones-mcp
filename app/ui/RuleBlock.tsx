import { citeLabel, legalSource, RULES, type RuleId } from "@/lib/content/rules";

/** A rule with its exact quoted sources, each linking to the official page in a new tab. */
export function RuleBlock({ id, heading = "h3" }: { id: RuleId; heading?: "h3" | "h4" }) {
  const r = RULES[id];
  const H = heading;
  return (
    <article id={id} className="rule">
      <H>{r.title}</H>
      <p>{r.text}</p>
      <ul className="quotes">
        {r.cites.map((c) => (
          <li key={`${c.source}|${c.pin}|${c.quote}`}>
            <a href={legalSource(c.source).url} target="_blank" rel="noopener noreferrer">
              {citeLabel(c)} ↗
            </a>
            <blockquote>{c.quote}</blockquote>
            {c.note && <span className="legend-note">{c.note}</span>}
          </li>
        ))}
      </ul>
    </article>
  );
}
