"use client";

import Link from "next/link";
import { citeLabel, legalSource, RULES, type RuleId } from "@/lib/content/rules";
import { useRulePopup } from "./RulePopup";

/**
 * The sources behind a statement: each citation opens the official page it
 * quotes in a new tab (with the quote on hover), and "quotes" shows the rules
 * with their exact words in a pop-up, without leaving the page.
 */
export function Cite({ rules }: { rules: readonly RuleId[] }) {
  const popup = useRulePopup();
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
          <a href={legalSource(c.source).url} title={`“${c.quote}” (opens in a new tab)`} target="_blank" rel="noopener noreferrer">
            {citeLabel(c)}
          </a>
        </span>
      ))}
      {" · "}
      {popup ? (
        <button type="button" className="linkish" onClick={() => popup(rules)}>
          quotes
        </button>
      ) : (
        <Link href={`/rules#${rules[0]}`}>quotes</Link>
      )}
    </span>
  );
}
