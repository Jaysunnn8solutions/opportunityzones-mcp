import Comparison from "../ui/Comparison";

export const metadata = { title: "Compare places | Opportunity Zone screening" };
export default function ComparePage() {
  return <main className="page comparison-page"><p className="eyebrow">Your research, side by side</p><h1>Compare places</h1><p className="lead">Compare up to 25 census tracts with a free research account, or preview two without signing in. These facts describe places and do not rank investments.</p><Comparison /></main>;
}
