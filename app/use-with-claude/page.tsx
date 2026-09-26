import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";

export const metadata: Metadata = { title: "Use it from Claude" };

const REPO = "https://github.com/Jaysunnn8solutions/opportunityzones-mcp";

const EXAMPLES: Array<[string, string]> = [
  ["Is 55 Trinity Ave SW, Atlanta, GA 30303 in a census tract that is eligible for the 2027 Opportunity Zone round? Is it rural?", "check_address"],
  ["List the rural tracts in Georgia that are eligible for 2027, with the highest poverty rates first.", "list_tracts"],
  ["How does tract 13121003500 compare with other eligible tracts in Georgia on income, rents and jobs?", "compare_tract"],
  ["What is the flood zone, earthquake design category and wildfire likelihood around 33.749, -84.388? Any Superfund sites or busy roads nearby?", "nearby"],
  ["How did the 2018 Opportunity Zones fare against similar tracts that were not chosen?", "oz1_findings"],
  ["Give me everything published for tract 13001950100, with the sources.", "get_tract"],
];

/** How to connect the MCP server to Claude, with the server URL for wherever this site is running. */
export default async function UseWithClaudePage() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");
  const url = `${proto}://${host}/mcp`;
  const local = /^(localhost|127\.0\.0\.1)(:|$)/.test(host);
  const desktop = JSON.stringify({ mcpServers: { opportunityzones: { command: "npx", args: ["-y", "mcp-remote", url] } } }, null, 2);

  return (
    <main className="page prose">
      <h1>Use it from Claude</h1>
      <p className="lead">
        Everything on this site is also available to Claude as an <strong>MCP server</strong>: a set of tools Claude can call to
        look up an address, profile or compare tracts, list a state&apos;s tracts, and check hazards and data around a site. You ask
        in plain English; Claude calls the tools and answers with the sources.
      </p>
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
              <code>{`claude mcp add --transport http opportunityzones ${url}`}</code>
            </pre>
          </li>
          <li>
            <strong>Start Claude and check it is connected.</strong> Run <code>claude</code>, then type <code>/mcp</code>: you
            should see <code>opportunityzones</code> listed as connected.
          </li>
          <li>
            <strong>Ask a question</strong>, for example:
            <pre>
              <code>Is 55 Trinity Ave SW, Atlanta, GA 30303 in a census tract that is eligible for the 2027 Opportunity Zone round?</code>
            </pre>
            Claude asks permission the first time it uses a tool; allow it.
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
            Where your plan offers custom connectors, add this site in Claude&apos;s settings under <strong>Connectors → Add custom
            connector</strong>, with the address <code>{url}</code>. No account or key is needed.
          </p>
        </section>
      )}

      <section>
        <h2>Questions to try</h2>
        <table className="examples">
          <thead>
            <tr>
              <th>Ask</th>
              <th>Tool Claude uses</th>
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
          Claude can chain them: &quot;Check these five addresses, then compare the eligible ones and show the hazards around each&quot;
          works in one request.
        </p>
      </section>

      <section>
        <h2>Good to know</h2>
        <ul>
          <li>
            Every answer ends with the sources and &quot;informational only, not investment, tax or legal advice&quot;. The tools
            describe places; they do not recommend a tract, fund or deal.
          </li>
          <li>Nothing is stored. Addresses go once to the Census Geocoder to find the tract; coordinates are not logged.</li>
          <li>
            For the program itself (the gain, the fund, the zone), see <Link href="/how-it-works">How it works</Link> or run the{" "}
            <Link href="/guide">Guided check</Link>.
          </li>
        </ul>
      </section>
    </main>
  );
}
