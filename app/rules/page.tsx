import type { Metadata } from "next";
import Link from "next/link";
import SOURCES from "@/legal/sources.json";
import { retrievedOn } from "@/lib/content/legalRetrieved";
import { citeLabel, legalSource, RULE_GROUPS, RULES, type LegalSource } from "@/lib/content/rules";

export const metadata: Metadata = { title: "Rules and sources" };

/**
 * Every rule this site states, with the exact words of the statute,
 * regulations or IRS guidance behind it. The quotes are checked against saved
 * copies of each source by the test suite (lib/content/rules.test.ts).
 */
export default function RulesPage() {
  return (
    <main className="page prose">
      <h1>Rules and sources</h1>
      <p className="lead">
        Every Opportunity Zone rule this site states, in plain language, with the exact words of the law, the regulations or
        IRS guidance behind it and a link to the official page. Plain-language summaries leave out details and exceptions; the
        quoted text is what governs. Informational only, not investment, tax or legal advice.
      </p>

      <nav className="toc" aria-label="On this page">
        {RULE_GROUPS.map((g) => (
          <a key={g.id} href={`#${g.id}`}>
            {g.title}
          </a>
        ))}
        <a href="#sources">Sources</a>
      </nav>

      {RULE_GROUPS.map((g) => (
        <section key={g.id} id={g.id}>
          <h2>{g.title}</h2>
          {g.rules.map((id) => {
            const r = RULES[id];
            return (
              <article key={id} id={id} className="rule">
                <h3>{r.title}</h3>
                <p>{r.text}</p>
                <ul className="quotes">
                  {r.cites.map((c) => (
                    <li key={`${c.source}|${c.pin}|${c.quote.slice(0, 20)}`}>
                      <a href={legalSource(c.source).url} rel="noopener">
                        {citeLabel(c)}
                      </a>
                      <blockquote>{c.quote}</blockquote>
                      {c.note && <span className="legend-note">{c.note}</span>}
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </section>
      ))}

      <section id="sources">
        <h2>Sources</h2>
        <p>
          Official sources only: the U.S. Code from the House Office of the Law Revision Counsel, Public Law 119-21 from the
          Government Publishing Office, the regulations from the eCFR, and IRS pages and guidance. Each was read on the date
          shown, and the quotes above are checked against those copies.
        </p>
        <ul>
          {(SOURCES as LegalSource[]).map((s) => {
            const on = retrievedOn(s.id);
            return (
              <li key={s.id}>
                <a href={s.url} rel="noopener">
                  {s.title}
                </a>
                . {s.publisher}
                {on ? `. Read ${on}.` : "."}
              </li>
            );
          })}
        </ul>
        <p>
          See also <Link href="/how-it-works">How it works</Link> for how the pieces fit together.
        </p>
      </section>
    </main>
  );
}
