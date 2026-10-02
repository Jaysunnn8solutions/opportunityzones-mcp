import { loadTractData } from "@/lib/data/tracts";
import { canResearchTract } from "@/lib/data/researchScope";
/** Select public fixtures locally without printing identifiers or querying providers. */
const ids = loadTractData().payload.geoids;
export const qualifiedTract = ids.find((id) => id.startsWith("13121") && canResearchTract(id))!;
export const qualifiedDelaware = ids.filter((id) => id.startsWith("10") && canResearchTract(id)).slice(0, 2);
export const excludedTract = ids.find((id) => !canResearchTract(id))!;
