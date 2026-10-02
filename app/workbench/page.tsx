import Workbench from "../ui/Workbench";
import { researchCatalog } from "@/lib/research/catalog";
export const metadata = { title: "Research workspace | Opportunity Zone Research" };
export default function WorkbenchPage() {
  return <main className="page workbench-page"><header className="workbench-heading"><p className="eyebrow">Your criteria. Published facts.</p><h1>Research workspace</h1><p className="lead">Build a repeatable research process. Organize selections, understand the data, and prepare files for your own analysis.</p></header><Workbench catalog={researchCatalog()} /></main>;
}
