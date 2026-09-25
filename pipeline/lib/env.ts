import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * The pipeline runs outside Next.js, which is what loads .env.local in the app.
 * Read it here so `npm run pipeline` works the same way, without pulling in a
 * dotenv dependency. Values already in the environment win, so CI can inject
 * the key as a secret without a file.
 */
let loaded = false;

/**
 * `.env.local` in this repo, or the file named by CENSUS_ENV_FILE. The override
 * lets one free key serve every project in the portfolio without copying the
 * secret into each repo — fewer copies, fewer places it can leak from.
 */
function envFile(): string {
  const override = process.env.CENSUS_ENV_FILE?.trim();
  return override
    ? path.resolve(override)
    : path.resolve(import.meta.dirname, "..", "..", ".env.local");
}

function loadEnvLocal(): void {
  if (loaded) return;
  loaded = true;
  const file = envFile();
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const [, key, rawValue] = m;
    if (process.env[key] !== undefined) continue;
    // Strip matched surrounding quotes, then trailing whitespace.
    const value = rawValue.trim().replace(/^(['"])(.*)\1$/, "$2");
    process.env[key] = value;
  }
}

/**
 * The Census API key. Free and instant from
 * https://api.census.gov/data/key_signup.html.
 *
 * The API authenticates by query string, so this value ends up in a URL. Every
 * path that logs or throws a URL runs it through `redact` first.
 */
export function censusApiKey(): string {
  loadEnvLocal();
  const key = process.env.CENSUS_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "CENSUS_API_KEY is not set. Copy .env.example to .env.local and add a free key " +
        "from https://api.census.gov/data/key_signup.html. Rebuilding the data is the " +
        "only thing that needs it — the app and the MCP server read data/ and need no key."
    );
  }
  return key;
}
