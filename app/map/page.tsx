import ExploreWorkspace from "../ui/ExploreWorkspace";
import { stateSummaries } from "@/lib/data/stateViews";

export default function MapPage() {
  return <ExploreWorkspace states={stateSummaries()} />;
}
