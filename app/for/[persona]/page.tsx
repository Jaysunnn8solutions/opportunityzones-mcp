import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PERSONAS, personaBySlug } from "@/lib/content/personas";

export function generateStaticParams() {
  return PERSONAS.map((p) => ({ persona: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ persona: string }> }): Promise<Metadata> {
  const p = personaBySlug((await params).persona);
  return { title: p ? `${p.who}: Opportunity Zones` : "Opportunity Zones" };
}

export default async function PersonaPage({ params }: { params: Promise<{ persona: string }> }) {
  const p = personaBySlug((await params).persona);
  if (!p) notFound();
  return (
    <main className="page prose">
      <p className="crumbs">
        <Link href="/">Start</Link> / {p.who}
      </p>
      <h1>{p.title}</h1>
      <p className="lead">{p.summary} Here is how the program&apos;s rules apply to situations like this, in general terms.</p>

      <section>
        <h2>How the program fits</h2>
        <ul>
          {p.fit.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </section>

      {p.example && (
        <section className="callout">
          <h2>{p.example.title}</h2>
          <ol>
            {p.example.steps.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ol>
          <h3>Things people weigh with an adviser</h3>
          <ul>
            {p.example.weigh.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2>Rules that matter most here</h2>
        <ul>
          {p.rules.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Next: find the answers here</h2>
        <div className="cards">
          {p.tools.map((t) => (
            <Link key={t.href + t.label} className="card" href={t.href}>
              <strong>{t.label}</strong>
              <span>{t.why}</span>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2>Questions for a tax adviser or attorney</h2>
        <ul>
          {p.ask.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </section>

      <p className="note">
        General information about the statute, not investment, tax or legal advice. Rules have details and exceptions not shown
        here; see <Link href="/how-it-works#sources">sources</Link>.
      </p>
    </main>
  );
}
