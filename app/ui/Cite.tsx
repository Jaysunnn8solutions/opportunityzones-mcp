import Link from "next/link";
import { citeLabel, legalSource, RULES, type RuleId } from "@/lib/content/rules";

/**
 * The sources behind a statement: each citation links to the official page it
 * quotes, with the quote on hover, and "all sources" goes to the rule on /rules.
 */
export function Cite({ rules }: { rules: readonly RuleId[] }) {
  if (rules.length === 0) return null;
  const seen = new Set<string>();
  const cites = rules.flatMap((id) => RULES[id].cites).filter((c) => {
    const key = `${c.source}|${c.pin}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return (
    <span className="cite">
      Sources:{" "}
      {cites.map((c, i) => (
        <span key={`${c.source}|${c.pin}`}>
          {i > 0 && "; "}
          <a href={legalSource(c.source).url} title={`“${c.quote}”`} rel="noopener">
            {citeLabel(c)}
          </a>
        </span>
      ))}
      {" · "}
      <Link href={`/rules#${rules[0]}`}>quotes</Link>
    </span>
  );
}
