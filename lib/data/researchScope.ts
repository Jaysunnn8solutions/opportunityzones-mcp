import { loadTractData, type TractData } from "./tracts";
import { researchStatusAllowed } from "../oz/researchScope";

export function canResearchTract(geoid: string, data: TractData = loadTractData()): boolean {
  const index = data.payload.indexOf(geoid);
  if (index < 0) return false;
  const value = (column: string) => data.payload.columns.get(column)?.get(index);
  return researchStatusAllowed(value("eligible_2027"), value("designated_2027"), value("oz2018_population_share"));
}
