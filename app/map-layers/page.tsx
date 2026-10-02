import type { Metadata } from "next";
import Link from "next/link";
import { MAP_LAYERS } from "@/lib/content/mapLayers";
import { SOURCES } from "@/pipeline/sources";
import { RuleBlock } from "../ui/RuleBlock";

export const metadata: Metadata = { title: "Map layers explained" };

/**
 * What each way of coloring the map means: the law behind it, quoted from the
 * official source; how the map draws it; and the dataset it comes from.
 */
export default function MapLayersPage() {
  const layers = Object.values(MAP_LAYERS);
  return (
    <main className="page prose">
      <h1>Map layers explained</h1>
      <p className="lead">
        What each coloring on the <Link href="/map">map</Link> means. The law behind each one is quoted word for word from the
        official source, with a link; &quot;On this map&quot; says how this tool draws it from the data. Informational only, not
        investment, tax or legal advice.
      </p>
      <nav className="toc" aria-label="On this page">
        {layers.map((l) => (
          <a key={l.id} href={`#${l.id}`}>
            {l.title}
          </a>
        ))}
      </nav>
      {layers.map((l) => {
        const src = SOURCES[l.sourceId as keyof typeof SOURCES];
        return (
          <section key={l.id} id={l.id}>
            <h2>{l.title}</h2>
            <p>{l.short}</p>
            <h3>What the law says</h3>
            {l.rules.map((r) => (
              <RuleBlock key={r} id={r} heading="h4" />
            ))}
            <h3>On this map</h3>
            <p>{l.mapped}</p>
            <p className="note">
              Data:{" "}
              <a href={src.homepage} target="_blank" rel="noopener noreferrer">
                {src.name} ↗
              </a>
              , {src.publisher}. {src.vintage}. License: {src.license}.
            </p>
          </section>
        );
      })}
      <section id="find-areas">
        <h2>How Find areas works</h2>
        <p>
          The Find areas panel on the map narrows the map to tracts matching the facts you choose. It does not rank places or
          predict outcomes, and a match is not a recommendation.
        </p>
        <ul>
          <li>
            <strong>Designations:</strong> select any of the layers above; &quot;All of these&quot; keeps tracts that have every one,
            &quot;Any of these&quot; keeps tracts that have at least one.
          </li>
          <li>
            <strong>Surroundings:</strong> a tract&apos;s neighbors are the tracts that share a stretch of boundary with it in the
            same state (touching at a single corner does not count, and tracts across a state line are not included). For each
            measure, the neighbors&apos; published figures are averaged, weighted by their population.
          </li>
          <li>
            <strong>Higher or lower 50%, 25%, or 10%</strong> compares published neighboring-area values within the same state.
            You choose the direction for each measure. Ties at the cutoff are included; higher and lower do not mean better or worse.
          </li>
          <li>
            Net worth and household wealth are not published for census tracts, so they are not offered. Averages of neighbors&apos;
            medians are an approximation, not a median of the combined area.
          </li>
        </ul>
        <p className="note">
          Data:{" "}
          <a href={SOURCES.acs5.homepage} target="_blank" rel="noopener noreferrer">
            {SOURCES.acs5.name} ↗
          </a>
          , {SOURCES.acs5.publisher}, 2020-2024; tract boundaries from the U.S. Census Bureau&apos;s 2024 cartographic boundary
          files.
        </p>
      </section>
      <p>
        All rules the site states are on <Link href="/rules">Rules and sources</Link>.
      </p>
    </main>
  );
}
