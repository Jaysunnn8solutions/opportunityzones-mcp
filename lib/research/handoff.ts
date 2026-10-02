import { specification, sharedSpecification, type Specification } from "./workbench";

/** Only public research fields cross the website/chat boundary. */
export function chatHandoff(input: Specification, origin: string) {
  const clean = specification(input);
  const url = new URL(origin);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Unsupported website address.");
  const website = `${url.origin}/workbench${sharedSpecification(clean)}`;
  return [
    "Use the Opportunity Zone Research MCP tools to explain these user-selected public research parameters.",
    "Return published facts, source links, observation periods, and missing-data limitations. Do not recommend locations, investments, or personal tax actions.",
    `Research parameters: ${JSON.stringify(clean)}`,
    "Respect the server's limits: comparisons support two tracts and six measures per request. Do not silently omit selections, change filters, or loop requests to bypass limits. Explain unsupported criteria and use the website for member features and downloads.",
    `Open the same selections on the website: ${website}`,
    "Informational only, not investment, tax or legal advice.",
  ].join("\n\n");
}

export function comparisonPath(geoids: string[], measures: string[]) {
  return `/compare#${new URLSearchParams({ tracts: geoids.join(","), measures: measures.join(",") })}`;
}
