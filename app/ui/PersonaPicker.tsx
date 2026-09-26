"use client";

import Link from "next/link";
import { useState } from "react";

export interface PickerPersona {
  slug: string;
  group: string;
  who: string;
  title: string;
  summary: string;
  tools: Array<{ href: string; label: string; why: string }>;
}

/**
 * "Which describes you?": one dropdown, grouped; choosing a persona shows what
 * the site has for that situation, instead of every persona at once.
 */
export default function PersonaPicker({ groups, personas }: { groups: Array<{ id: string; title: string }>; personas: PickerPersona[] }) {
  const [slug, setSlug] = useState("");
  const p = personas.find((x) => x.slug === slug) ?? null;
  return (
    <div className="persona-picker">
      <label className="persona-select">
        <span className="visually-hidden">Which describes you?</span>
        <select value={slug} onChange={(e) => setSlug(e.target.value)}>
          <option value="">Choose the one closest to you…</option>
          {groups.map((g) => (
            <optgroup key={g.id} label={g.title}>
              {personas
                .filter((x) => x.group === g.id)
                .map((x) => (
                  <option key={x.slug} value={x.slug}>
                    {x.who}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>

      {p && (
        <div className="persona-panel" aria-live="polite">
          <p className="card-kicker">{p.who}</p>
          <h3>{p.title}</h3>
          <p>{p.summary}</p>
          <p className="persona-actions">
            <Link className="button" href={`/for/${p.slug}`}>
              How the rules apply to you
            </Link>
            <Link className="button secondary" href="/guide">
              Start the guided check
            </Link>
          </p>
          <div className="cards">
            {p.tools.map((t) => (
              <Link key={t.href + t.label} className="card" href={t.href}>
                <strong>{t.label}</strong>
                <span>{t.why}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
