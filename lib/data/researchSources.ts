import { SOURCES, type SourceId } from "@/pipeline/sources";
import { loadTractData } from "./tracts";

/** Use the built dataset's source metadata, with registry links. */
export function researchSources() {
  return Object.fromEntries(loadTractData().manifest.sources.map((source) => [source.id, {
    name: source.name, publisher: source.publisher, vintage: source.vintage,
    geography: source.geography, url: SOURCES[source.id as SourceId]?.homepage ?? "/rules",
  }]));
}
