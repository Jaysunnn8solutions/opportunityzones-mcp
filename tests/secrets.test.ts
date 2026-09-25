import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Keys live only in .env.local (gitignored) or injected env vars. These tests
// fail before a key can be pushed: .env.example must stay blank, and no file
// git tracks, or would pick up with `git add -A`, may contain one.

const root = path.resolve(import.meta.dirname, "..");

/** Values that are clearly not a real credential. */
const PLACEHOLDER = /^(REDACTED|<[^>]*>|your[_-]\w*|x+|\*+|\$\{?\w+\}?)$/i;

const PATTERNS: Array<[string, RegExp]> = [
  ["private key block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["GitHub token", /\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ["Hugging Face token", /\bhf_[A-Za-z0-9]{30,}\b/],
  ["Anthropic or OpenAI key", /\bsk-(ant-)?[A-Za-z0-9_-]{20,}/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["Slack token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ["JWT (e.g. HUD USER token)", /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
];

/**
 * `key=…`, `token: "…"`, `HUD_USER_API_TOKEN=…` and similar, in URLs, code and
 * config. A lookbehind, not `\b`, so env-style names ending in `_TOKEN` match.
 */
const ASSIGNMENT =
  /(?<![A-Za-z])(?:api[_-]?key|apikey|key|access[_-]?token|token|secret|password)\b["']?\s*[:=]\s*["']?([A-Za-z0-9_\-./+]{16,})/gi;

function candidateFiles(): string[] {
  // Tracked files plus untracked ones .gitignore does not exclude, so a key in
  // a new file is caught before it is ever added.
  const out = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const self = path.relative(root, import.meta.filename).replaceAll("\\", "/");
  return out.split("\0").filter((f) => f && f !== self && f !== "package-lock.json");
}

describe(".env.example", () => {
  it("assigns no real value to any variable", () => {
    const text = readFileSync(path.join(root, ".env.example"), "utf8");
    const filled = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/))
      .filter((m): m is RegExpMatchArray => m !== null)
      .filter(([, , value]) => value.replace(/^["']|["']$/g, "") !== "")
      .map(([, name]) => name);
    expect(filled, "fill these in .env.local, never in .env.example").toEqual([]);
  });
});

describe("files git would commit", () => {
  it("contain nothing that looks like a credential", () => {
    const hits: string[] = [];
    for (const file of candidateFiles()) {
      let text: string;
      try {
        text = readFileSync(path.join(root, file), "utf8");
      } catch {
        continue; // deleted in the working tree but still in the index
      }
      if (text.includes("\0")) continue; // binary
      text.split(/\r?\n/).forEach((line, i) => {
        for (const [label, re] of PATTERNS) {
          if (re.test(line)) hits.push(`${file}:${i + 1} ${label}`);
        }
        for (const m of line.matchAll(ASSIGNMENT)) {
          if (!PLACEHOLDER.test(m[1]) && /\d/.test(m[1]) && /[A-Za-z]/.test(m[1])) {
            hits.push(`${file}:${i + 1} value assigned to a key/token name`);
          }
        }
      });
    }
    // Only locations are reported, never the matched text.
    expect(hits).toEqual([]);
  });
});
