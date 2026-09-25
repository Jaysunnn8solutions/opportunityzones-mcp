import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { dataDir } from "../data/tracts";
import { DESCRIPTION_SUFFIX, error, readOnly, text } from "./shared";

/** Report sections a caller can ask for, by the heading they start with. */
const SECTIONS = {
  headline: "Headline",
  robustness: "Robustness",
  pretrend: "Pre-trend check",
  "home-values": "Median values versus same-home prices",
  data: "Data that could not be obtained",
  method: "Method notes",
} as const;

export const oz1FindingsConfig = {
  title: "How the 2018 Opportunity Zones fared",
  description:
    "Published findings of this product's retrospective on the 2018 zones: 2018-designated tracts compared with similar " +
    "eligible tracts that were not designated, 2012-16 to 2020-24, on home values, same-home prices, rents, incomes, " +
    "housing, jobs and poverty, with confidence intervals and robustness checks. Descriptive: what designation came with, " +
    "not proof of what it caused." +
    DESCRIPTION_SUFFIX,
  inputSchema: z
    .object({ section: z.enum(Object.keys(SECTIONS) as [keyof typeof SECTIONS, ...Array<keyof typeof SECTIONS>]).optional() })
    .strict(),
  annotations: readOnly,
};

export function extractSection(markdown: string, heading: string): string | null {
  const parts = markdown.split(/^## /m);
  const part = parts.find((p) => p.startsWith(heading));
  return part ? `## ${part.trim()}` : null;
}

export function oz1FindingsHandler({ section = "headline" }: { section?: keyof typeof SECTIONS }) {
  let report: string;
  try {
    report = readFileSync(path.join(dataDir(), "oz1", "REPORT.md"), "utf8");
  } catch {
    return error("The 2018 retrospective report is not available on this server.");
  }
  const body = extractSection(report, SECTIONS[section]);
  if (!body) return error(`Section "${section}" was not found in the report.`);
  return text(
    `${body}\n\nOther sections: ${Object.keys(SECTIONS).filter((s) => s !== section).join(", ")}.`,
    ["oz1Designated", "oz1Eligible", "acs5", "fhfaTractHpi", "lodesWac", "blsCpi", "blockRelationship", "decennialPl"]
  );
}
