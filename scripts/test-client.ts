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
  await client.connect(new StreamableHTTPClientTransport(endpoint));
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
    ["check_address", { address: "55 Trinity Ave SW, Atlanta, GA 30303" }],
    ["get_tract", { geoid: "13121003500" }],
    ["list_tracts", { state: "DE", eligible2027: true, sortBy: "poverty_rate", limit: 3 }],
    ["compare_tract", { geoid: "13121003500" }],
    ["oz1_findings", { section: "headline" }],
    ["nearby", { lat: 33.7486, lon: -84.3907, radiusMiles: 1 }],
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
