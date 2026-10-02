import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import McpConsent from "../ui/McpConsent";

export const metadata: Metadata = { title: "Research through chat / MCP" };

const REPO = "https://github.com/Jaysunnn8solutions/opportunityzones-mcp";

const EXAMPLES: Array<[string, string]> = [
  ["What research can I do without a map? Explain population and median gross rent, including dates and units.", "describe_research"],
  ["Find the county identifier for Wake County in North Carolina.", "lookup_geography"],
  ["Show the available rule topics, then read the eligibility-versus-designation rules with official citations.", "get_rules"],
  ["Compare these two tract identifiers on the published measures I specify. Use labeled text, and do not recommend either place.", "compare_places"],
  ["List up to 25 rural tracts in Georgia that are eligible for 2027, in tract-number order.", "list_tracts"],
  ["How does tract 13121003500 compare with other eligible tracts in Georgia on income, rents and jobs?", "compare_tract"],
  ["How did the 2018 Opportunity Zones fare against similar tracts that were not chosen?", "oz1_findings"],
  ["Give me everything published for tract 13001950100, with the sources.", "get_tract"],
];

/** How to connect the MCP server to Claude, with the server URL for wherever this site is running. */
export default async function UseWithClaudePage() {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const base = process.env.OZ_ORIGIN ? new URL(process.env.OZ_ORIGIN).origin : /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? `http://${host}` : "";
  const url = base ? `${base}/mcp` : "Configure the public research origin before connecting";
  const local = /^(localhost|127\.0\.0\.1)(:|$)/.test(host);
  const desktop = JSON.stringify({ mcpServers: { opportunityzones: { command: "npx", args: ["-y", "mcp-remote", url, "--header", "Authorization:${OZ_MCP_AUTH}"], env: { OZ_MCP_AUTH: "Bearer YOUR_PRIVATE_MCP_TOKEN" } } } }, null, 2);

  return (
    <main className="page prose">
      <h1>Research through chat / MCP</h1>
      <p className="lead">
        Published place research is available through an <strong>MCP server</strong>. Claude can profile a tract, explain comparisons, and request a bounded list with sources. Account-connected MCP access has traffic limits and no live address or site enrichment. Use the website for those features and account-based exports.
      </p>
      <p>MCP is a protocol supported by compatible chat clients. You can ask for labeled lists instead of tables, read published rules with citations, and compare explicitly chosen tracts without using the map. Voice and screen-reader features depend on your client. The site does not supply or pay for a language model.</p>
      <p><Link href="/accessibility">Accessibility options and known limitations</Link> · <Link href="/map#m=list">Use website text results</Link></p>
      <McpConsent />
      {process.env.OZ_OAUTH_ENABLED === "1" && <section><h2>Connect through your browser</h2><p>In a compatible MCP client, add this server URL: <code>{url}</code>. The client can open this website for sign-in and an explicit approval. Verify the displayed callback destination before choosing Agree and connect. No token copying is needed for clients supporting this flow.</p><p>Browser connections expire after one hour and can be revoked from <Link href="/account">My account</Link>. This deployment uses public OAuth clients with PKCE and dynamic registration. Refresh tokens and client metadata URL fetching are not supported; individual client compatibility must be verified.</p></section>}
      <section>
        <h2>Available tools and limits</h2>
        <ul>
          <li><code>describe_research</code>: capabilities and definitions for up to six requested measures.</li>
          <li><code>lookup_geography</code>: state and county identifiers; county lists are capped at 25 and can be narrowed by name.</li>
          <li><code>list_tracts</code>: up to 25 tracts with public status filters, in tract-number order. Labeled lists are the default; a table is optional.</li>
          <li><code>get_tract</code>: a published tract profile with sources.</li>
          <li><code>compare_places</code>: up to two user-selected tracts and six measures, with units and source dates.</li>
          <li><code>compare_tract</code>: a tract’s position on separate published measures within its state; labeled lists are the default.</li>
          <li><code>get_rules</code>: discover rule topics or read up to three sourced statements.</li>
          <li><code>oz1_findings</code>: published historical findings and limitations.</li>
          <li><code>research_capabilities</code> and <code>usage_status</code>: effective capabilities and your account’s remaining MCP allowances.</li>
          <li><code>get_measure_definition</code>, <code>get_data_coverage</code>, and <code>get_uncertainty</code>: definitions, coverage, and published uncertainty or explicit missingness.</li>
          <li><code>preview_criteria</code> and <code>explain_criteria_match</code>: counts and evidence for criteria you supply.</li>
          <li><code>compare_selected_tracts</code>: up to 25 explicit tracts and six measures, in your selection order.</li>
          <li><code>trace_tract_boundary</code> and <code>get_source_changes</code>: historical boundary relationships and captured source changes.</li>
          <li><code>preview_research_export</code>: preview an explicit selection and continue to the website to confirm a download.</li>
        </ul>
        <p>Live address lookup, site enrichment, and file downloads are not offered as hosted MCP tools. Numeric criteria can be previewed through the account-connected tools; downloads require website confirmation. MCP allowances include 60 tool calls per minute, 500 per rolling day, 1,000 reserved tract rows per day, and 16 MiB of tool results per day. Row reservations use each tool’s bounded maximum, even if fewer rows are available. Manage and revoke connections from My account. Limits apply across all connections on your account.</p>
      </section>
      <p>
        The server address for this site is <code>{url}</code>
        {local && " (your own computer: the site has to be running, see step 1)"}.
      </p>

      <section>
        <h2>Claude Code (terminal)</h2>
        <ol className="steps">
          {local && (
            <li>
              <strong>Run the site.</strong> In a terminal, with Node.js 22 or later:
              <pre>
                <code>{`git clone ${REPO}.git\ncd opportunityzones-mcp\nnpm install\nnpm run dev`}</code>
              </pre>
              Leave it running.
            </li>
          )}
          <li>
            <strong>Add the server.</strong> In another terminal:
            <pre>
              <code>{`claude mcp add --transport http opportunityzones ${url} --header "Authorization: Bearer YOUR_PRIVATE_MCP_TOKEN"`}</code>
            </pre>
          </li>
          <li>
            <strong>Start Claude and check it is connected.</strong> Run <code>claude</code>, then type <code>/mcp</code>: you
            should see <code>opportunityzones</code> listed as connected.
          </li>
          <li>
            <strong>Ask a question</strong>, for example:
            <pre>
              <code>Give me the published profile and sources for tract 13001950100.</code>
            </pre>
            Your client may also ask permission to use a tool. That permission is separate from accepting this service’s terms.
          </li>
        </ol>
      </section>

      <section>
        <h2>Claude Desktop</h2>
        <ol className="steps">
          {local && <li>Run the site as in step 1 above.</li>}
          <li>
            In Claude Desktop, open <strong>Settings → Developer → Edit Config</strong>. That opens{" "}
            <code>claude_desktop_config.json</code>. Add:
            <pre>
              <code>{desktop}</code>
            </pre>
            (If the file already has an <code>mcpServers</code> section, add the <code>opportunityzones</code> entry inside it.)
          </li>
          <li>Quit and reopen Claude Desktop. The tools appear under the tools icon in a new chat.</li>
          <li>Ask one of the questions below.</li>
        </ol>
        <p className="note">
          <code>mcp-remote</code> is a small open-source bridge, run with <code>npx</code>, for apps that connect to servers
          through a local command. It needs Node.js installed.
        </p>
      </section>

      {!local && (
        <section>
          <h2>Claude on the web</h2>
          <p>
            This endpoint currently requires an Authorization bearer header. Use a client that supports a private custom header or the local bridge above. A connector that only supports browser OAuth cannot connect yet; an OAuth consent flow is not implemented. A URL alone does not grant access.
          </p>
        </section>
      )}

      <section>
        <h2>Questions to try</h2>
        <table className="examples">
          <thead>
            <tr>
              <th scope="col">Ask</th>
              <th scope="col">Tool the client uses</th>
            </tr>
          </thead>
          <tbody>
            {EXAMPLES.map(([q, tool]) => (
              <tr key={tool}>
                <td>{q}</td>
                <td>
                  <code>{tool}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          Ask for published facts and sources. These tools do not recommend locations, assess personal suitability, or identify compatible residents.
        </p>
      </section>

      <section>
        <h2>Good to know</h2>
        <ul>
          <li>
            Every answer ends with the sources and &quot;informational only, not investment, tax or legal advice&quot;. The tools
            describe places; they do not recommend a tract, fund or deal.
          </li>
          <li>Research arguments are not logged by the app. Short-lived usage records protect shared capacity; see the Privacy Notice for retention and hosting considerations.</li>
          <li>
            For the program itself (the gain, the fund, the zone), see <Link href="/how-it-works">How it works</Link> or run the{" "}
            <Link href="/guide">Understand the rules</Link>.
          </li>
        </ul>
      </section>
    </main>
  );
}
