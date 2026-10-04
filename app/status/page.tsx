import { SOURCES, type SourceId } from "@/pipeline/sources";
import ServiceStatus from "../ui/ServiceStatus";
import DataFreshness from "../ui/DataFreshness";
import { loadTractData } from "@/lib/data/tracts";
export default function Page() {
  const { manifest } = loadTractData();
  return <main className="page account-page"><h1>Service status & data dates</h1><ServiceStatus /><DataFreshness version={manifest.generated} sources={manifest.sources.map((s) => ({ name: s.name, vintage: s.vintage, url: SOURCES[s.id as SourceId]?.homepage ?? "/workbench#tab=data" }))} /></main>;
}
