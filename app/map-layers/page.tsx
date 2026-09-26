import type { Metadata } from "next";
import Link from "next/link";
import { MAP_LAYERS } from "@/lib/content/mapLayers";
import { SOURCES } from "@/pipeline/sources";
import { RuleBlock } from "../ui/RuleBlock";

export const metadata: Metadata = { title: "Map layers explained" };

/**
 * What each way of colouring the map means: the law behind it, quoted from the
 * official source; how the map draws it; and the dataset it comes from.
 */
export default function MapLayersPage() {
  const layers = Object.values(MAP_LAYERS);
  return (
    <main className="page prose">
      <h1>Map layers explained</h1>
      <p className="lead">
        What each colouring on the <Link href="/map">map</Link> means. The law behind each one is quoted word for word from the
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
              , {src.publisher}. {src.vintage}. Licence: {src.license}.
            </p>
          </section>
        );
      })}
      <p>
        All rules the site states are on <Link href="/rules">Rules and sources</Link>.
      </p>
    </main>
  );
}
