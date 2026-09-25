import { createMcpHandler } from "mcp-handler";
import { checkAddressConfig, checkAddressHandler } from "@/lib/tools/checkAddress";
import { compareTractConfig, compareTractHandler } from "@/lib/tools/compareTract";
import { getTractConfig, getTractHandler } from "@/lib/tools/getTract";
import { listTractsConfig, listTractsHandler } from "@/lib/tools/listTracts";
import { nearbyConfig, nearbyHandler } from "@/lib/tools/nearby";
import { oz1FindingsConfig, oz1FindingsHandler } from "@/lib/tools/oz1Findings";

/**
 * The Opportunity Zone screening tools over MCP (Streamable HTTP, stateless).
 *
 * Authless and read-only. Tool arguments (addresses, coordinates) are never
 * logged: verbose logging stays off and no event hook is registered.
 * Informational only, not investment, tax or legal advice.
 */
const handler = createMcpHandler(
  (server) => {
    server.registerTool("check_address", checkAddressConfig, checkAddressHandler);
    server.registerTool("get_tract", getTractConfig, getTractHandler);
    server.registerTool("list_tracts", listTractsConfig, listTractsHandler);
    server.registerTool("compare_tract", compareTractConfig, compareTractHandler);
    server.registerTool("oz1_findings", oz1FindingsConfig, oz1FindingsHandler);
    server.registerTool("nearby", nearbyConfig, nearbyHandler);
  },
  {
    serverInfo: { name: "opportunityzones-mcp", version: "0.1.0" },
    verboseLogs: false,
  }
);

export { handler as GET, handler as POST };
