/**
 * Smoke test against a running server: calls every tool once and prints the
 * first lines of each answer. Uses public landmarks only.
 *
 *   npm run dev            (in another terminal)
 *   npm run test:client -- http://localhost:3000
 */
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const origin = process.argv.slice(2).find((a) => a !== "--") ?? "http://localhost:3000";
const PREVIEW_LINES = 8;

async function main() {
  const client = new Client({ name: "opportunityzones-smoke", version: "0.1.0" });
  const endpoint = new URL("/mcp", `${origin}/`);
  const credential = process.env.OZ_MCP_TOKEN;
  if (!credential) throw new Error("Accept the MCP terms at /use-with-claude, then set OZ_MCP_TOKEN privately before running this smoke test.");
  await client.connect(new StreamableHTTPClientTransport(endpoint, { requestInit: { headers: { Authorization: `Bearer ${credential}` } } }));
  console.log("Connected to", endpoint.toString());

  const { tools } = await client.listTools();
  console.log(`Tools (${tools.length}):`, tools.map((t) => t.name).join(", "));
  for (const t of tools) {
    if (!t.description?.includes("not investment, tax or legal advice")) {
      console.error(`Tool ${t.name} description lacks the disclaimer`);
      process.exitCode = 1;
    }
  }

  const calls: Array<[string, Record<string, unknown>]> = [
    ["describe_research", { measures: ["population"] }],
    ["lookup_geography", { state: "North Carolina", countyName: "Wake" }],
    ["get_rules", { topics: ["window180"] }],
    ["compare_places", { geoids: ["13121003500", "13001950100"], measures: ["population", "median_gross_rent"] }],
    ["get_tract", { geoid: "13121003500" }],
    ["list_tracts", { state: "DE", eligible2027: true, limit: 3 }],
    ["compare_tract", { geoid: "13121003500" }],
    ["oz1_findings", { section: "headline" }],
    ["research_capabilities", {}],
    ["usage_status", {}],
    ["get_measure_definition", { measures: ["population"] }],
    ["get_data_coverage", { measure: "population", state: "10" }],
    ["preview_criteria", { state: "10", filters: { rural: "not-rural" } }],
    ["explain_criteria_match", { geoid: "10001040100", filters: { flags: ["eligible"] } }],
    ["compare_selected_tracts", { geoids: ["10001040100", "10001040201"], measures: ["population"] }],
    ["trace_tract_boundary", { geoid: "10001040100", vintage: "2020" }],
    ["get_uncertainty", { geoid: "10001040100", measure: "population" }],
    ["get_source_changes", {}],
    ["preview_research_export", { geoids: ["10001040100"], measures: ["population"] }],
  ];

  let failures = 0;
  for (const [name, args] of calls) {
    const started = Date.now();
    const result = (await client.callTool({ name, arguments: args })) as {
      isError?: boolean;
      content?: Array<{ type: string; text?: string }>;
    };
    const ms = Date.now() - started;
    const body = result.content?.find((c) => c.type === "text")?.text ?? JSON.stringify(result);
    if (result.isError) failures++;
    if (!body.includes("not investment, tax or legal advice")) {
      console.error(`${name}: response lacks the disclaimer`);
      failures++;
    }
    console.log(`\n=== ${name} (${result.isError ? "ERROR" : "ok"}, ${ms} ms) ===`);
    console.log(body.split("\n").slice(0, PREVIEW_LINES).join("\n"));
  }

  await client.close();
  if (failures > 0) {
    console.error(`\n${failures} problem(s)`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
