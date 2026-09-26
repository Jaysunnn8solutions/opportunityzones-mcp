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

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

interface LegalSource {
  id: string;
  title: string;
  publisher: string;
  url: string;
  /** A machine endpoint for the same text, tried first when the page itself is a script shell. */
  api?: string;
  /** A PDF, converted with pdftotext (poppler-utils). */
  pdf?: boolean;
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

async function get(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/xml,application/pdf;q=0.9,*/*;q=0.8" }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function pdfToText(bytes: Buffer): string {
  const dir = mkdtempSync(path.join(tmpdir(), "legal-"));
  const file = path.join(dir, "doc.pdf");
  writeFileSync(file, bytes);
  return execFileSync("pdftotext", ["-enc", "UTF-8", file, "-"], { maxBuffer: 64 * 1024 * 1024 })
    .toString("utf8")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

/** Every link on a page as "anchor text <tab> absolute URL", so cited documents can be found by their real address. */
export function linksOf(html: string, base: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const text = htmlToText(m[2]).replace(/\s+/g, " ");
    try {
      if (text) out.add(`${text}\t${new URL(m[1].replace(/&amp;/g, "&"), base).toString()}`);
    } catch {
      // not a URL
    }
  }
  return [...out];
}

async function main() {
  const sources = JSON.parse(readFileSync(path.join(ROOT, "sources.json"), "utf8")) as LegalSource[];
  mkdirSync(path.join(ROOT, "text"), { recursive: true });
  mkdirSync(path.join(ROOT, "links"), { recursive: true });
  const report: string[] = [];
  let failed = 0;
  for (const s of sources) {
    let text = "";
    let from = "";
    for (const url of [s.api, s.url].filter(Boolean) as string[]) {
      try {
        const body = await get(url);
        let t: string;
        if (s.pdf) t = pdfToText(body);
        else {
          const html = body.toString("utf8");
          t = htmlToText(html);
          writeFileSync(path.join(ROOT, "links", `${s.id}.txt`), linksOf(html, url).join("\n") + "\n");
        }
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
  writeFileSync(path.join(ROOT, "fetch-report.txt"), `Retrieved ${new Date().toISOString()}\n${report.join("\n")}\n`);
  if (failed) console.log(`${failed} source(s) could not be read`);
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
