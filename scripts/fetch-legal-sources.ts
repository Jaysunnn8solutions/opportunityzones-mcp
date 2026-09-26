/**
 * Download the laws, regulations and IRS pages listed in legal/sources.json and
 * save each as plain text in legal/text/{id}.txt, with the date it was read.
 *
 * The rules the app states (lib/content/rules.ts) quote these files word for
 * word, and a test fails if a quote is not found in its source, so nothing is
 * stated from memory. Run by the "Fetch legal sources" workflow, because
 * development sandboxes usually cannot reach these hosts. All are U.S.
 * government works (public domain).
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

interface LegalSource {
  id: string;
  title: string;
  publisher: string;
  url: string;
  /** A machine endpoint for the same text, tried first when the page itself is a script shell. */
  api?: string;
}

const ROOT = path.resolve(import.meta.dirname, "..", "legal");
const UA = "Mozilla/5.0 (compatible; opportunityzones-mcp legal-source check; +https://github.com/Jaysunnn8solutions/opportunityzones-mcp)";

/** HTML to readable text: drop scripts and styles, keep block breaks, decode common entities. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|dd|dt)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&sect;|&#167;/g, "§")
    .replace(/&amp;/g, "&")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&#39;|&#x27;|&rsquo;|&lsquo;|&#8217;|&#8216;/g, "'")
    .replace(/&ldquo;|&rdquo;|&#8220;|&#8221;/g, '"')
    .replace(/&mdash;|&#8212;/g, "—")
    .replace(/&ndash;|&#8211;/g, "–")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

async function get(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function main() {
  const sources = JSON.parse(readFileSync(path.join(ROOT, "sources.json"), "utf8")) as LegalSource[];
  mkdirSync(path.join(ROOT, "text"), { recursive: true });
  const report: string[] = [];
  let failed = 0;
  for (const s of sources) {
    let text = "";
    let from = "";
    for (const url of [s.api, s.url].filter(Boolean) as string[]) {
      try {
        const t = htmlToText(await get(url));
        if (t.length > 2000) {
          text = t;
          from = url;
          break;
        }
        report.push(`  ${s.id}: ${url} returned only ${t.length} characters`);
      } catch (err) {
        report.push(`  ${s.id}: ${url} failed: ${(err as Error).message}`);
      }
    }
    if (!text) {
      failed++;
      report.push(`FAIL ${s.id}`);
      continue;
    }
    const header = `Source: ${s.title}\nPublisher: ${s.publisher}\nURL: ${s.url}\nRead from: ${from}\nRetrieved: ${new Date().toISOString().slice(0, 10)}\n---\n`;
    writeFileSync(path.join(ROOT, "text", `${s.id}.txt`), header + text + "\n");
    report.push(`ok   ${s.id} (${text.length.toLocaleString("en-US")} characters)`);
  }
  console.log(report.join("\n"));
  if (failed) console.log(`${failed} source(s) could not be read`);
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
