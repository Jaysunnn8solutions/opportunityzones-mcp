import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { redact } from "../../lib/sources/redact";
import { CACHE_DIR } from "../config";

const USER_AGENT =
  "opportunityzones-mcp-pipeline/0.1 (+https://github.com/Jaysunnn8solutions/opportunityzones-mcp)";

export { redact };

export function log(msg: string): void {
  console.log(`[pipeline] ${msg}`);
}

export interface FetchOptions extends RequestInit {
  /** Wall-clock ceiling. Federal bulk files are slow; default is generous. */
  timeoutMs?: number;
  /** Retry count for transient failures. */
  retries?: number;
}

/**
 * Download with an on-disk cache, so re-running one stage does not re-pull a
 * multi-gigabyte federal dataset. Cache hits are reported so a build log shows
 * what was actually fetched versus reused.
 */
export async function fetchCached(
  url: string,
  cacheName: string,
  options: FetchOptions = {}
): Promise<Buffer> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, cacheName);
  if (existsSync(file)) {
    const buf = readFileSync(file);
    log(`cache hit  ${cacheName} (${mb(buf.length)})`);
    return buf;
  }
  const buf = await fetchBuffer(url, options);
  writeFileSync(file, buf);
  log(`saved      ${cacheName} (${mb(buf.length)})`);
  return buf;
}

/** Fetch without caching, with retries and a redacted error message. */
export async function fetchBuffer(url: string, options: FetchOptions = {}): Promise<Buffer> {
  const { timeoutMs = 300_000, retries = 3, ...init } = options;
  const headers = new Headers(init.headers);
  if (!headers.has("User-Agent")) headers.set("User-Agent", USER_AGENT);

  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      log(`download   ${redact(url)}${attempt > 1 ? ` (attempt ${attempt})` : ""}`);
      const res = await fetch(url, {
        ...init,
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        const body = (await res.text().catch(() => "")).slice(0, 300);
        const err = new Error(
          `HTTP ${res.status} fetching ${redact(url)}${body ? `: ${redact(body)}` : ""}`
        );
        // 4xx other than 429 will not fix themselves; fail immediately.
        if (res.status < 500 && res.status !== 429) throw err;
        lastError = err;
      } else {
        return Buffer.from(await res.arrayBuffer());
      }
    } catch (err) {
      lastError = err;
      if (err instanceof Error && err.message.startsWith("HTTP 4")) throw err;
    }
    if (attempt < retries) await sleep(1000 * 2 ** (attempt - 1));
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Failed fetching ${redact(url)}: ${redact(String(lastError))}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function mb(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${(bytes / 1024).toFixed(0)} KB`;
}

/**
 * Run tasks with a bounded number in flight. Results keep input order.
 * Used for the ~52 per-state Census requests each stage makes.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}
