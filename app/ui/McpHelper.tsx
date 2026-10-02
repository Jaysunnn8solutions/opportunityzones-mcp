"use client";

/**
 * A small floating panel on every page (except the map, whose corners hold its
 * own controls, and the full instructions page): how to connect this site's
 * MCP server to Claude, or another MCP client, in three steps. People use
 * their own AI subscription; this site never calls a model itself (AGENTS.md).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const noop = () => () => {};
const HIDDEN_ON = ["/map", "/use-with-claude"];
const EXAMPLE = "Give me the published profile and sources for census tract 13001950100.";

export default function McpHelper() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  // The address depends on where the site is running; read it in the browser (empty while rendering on the server).
  const origin = useSyncExternalStore(
    noop,
    () => window.location.origin,
    () => "",
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    panel.current?.querySelector<HTMLElement>("button, a, input")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (HIDDEN_ON.some((p) => path === p || path.startsWith(`${p}/`))) return null;

  const url = origin ? `${origin}/mcp` : "/mcp";
  // Claude's custom connectors reach servers over the internet, so they cannot use a site running on this computer.
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(origin);
  const code = `claude mcp add --transport http opportunityzones ${url}`;

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  }

  return (
    <div className="mcp-helper">
      {open && (
        <div className="mcp-panel" role="dialog" aria-label="Use this site from Claude" ref={panel}>
          <div className="mcp-panel-head">
            <strong>Use it from Claude</strong>
            <button type="button" className="mcp-close" onClick={() => setOpen(false)} aria-label="Close">
              ×
            </button>
          </div>
          <p className="mcp-lead">Ask about places in plain English, with your own Claude. The site&apos;s tools answer with sources.</p>
          <ol className="mcp-steps">
            <li>
              <strong>Copy the server address</strong>
              <span className="mcp-copy">
                <code>{url}</code>
                <button type="button" onClick={() => copy(url, "url")}>
                  {copied === "url" ? "Copied" : "Copy"}
                </button>
              </span>
            </li>
            <li>
              <strong>Add it to Claude</strong>
              <span>
                {local ? (
                  <>The site is running on this computer, so use Claude Code (below) or Claude Desktop (full instructions). Claude Code:</>
                ) : (
                  <>
                    Claude app: <em>Settings → Connectors → Add custom connector</em>, paste the address. Claude Code:
                  </>
                )}
              </span>
              <span className="mcp-copy">
                <code>{code}</code>
                <button type="button" onClick={() => copy(code, "code")}>
                  {copied === "code" ? "Copied" : "Copy"}
                </button>
              </span>
            </li>
            <li>
              <strong>Ask a question</strong>
              <span className="mcp-copy">
                <code>{EXAMPLE}</code>
                <button type="button" onClick={() => copy(EXAMPLE, "ask")}>
                  {copied === "ask" ? "Copied" : "Copy"}
                </button>
              </span>
            </li>
          </ol>
          <p className="mcp-foot">
            <Link href="/use-with-claude" onClick={() => setOpen(false)}>
              Full instructions, Claude Desktop and more questions
            </Link>
          </p>
          <p className="mcp-note">Public MCP uses published data with traffic limits. Live lookups and account exports are available on the website. This site never calls an AI model or logs research arguments. See the Privacy Notice for usage-record retention.</p>
        </div>
      )}
      <button type="button" className="mcp-fab" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span aria-hidden="true">✦</span> {open ? "Close" : "Use with Claude"}
      </button>
    </div>
  );
}
