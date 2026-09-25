/**
 * HTTP for runtime source clients: the calls made while a user or MCP client
 * waits (docs/ARCHITECTURE.md, "A live request, step by step").
 *
 * Differs from the pipeline's fetcher on purpose:
 *  - Short timeouts and few retries, because someone is waiting and one slow
 *    source must not hold up the rest of a report.
 *  - No disk cache and no logging. Runtime URLs can carry an address or a
 *    searched site's coordinates, so they are never written anywhere.
 *  - Errors name the source and the HTTP status only, never the URL, so an
 *    error that reaches a log or a tool response cannot leak a query or a key.
 */

export type SourceErrorKind =
  /** The source did not answer in time, or answered with a server error. */
  | "unavailable"
  /** The environment lacks the key this source needs. */
  | "missing-key"
  /** The source answered, but not in the shape the client expects. */
  | "bad-response"
  /** The request itself was rejected (4xx other than 429). */
  | "rejected";

export class SourceError extends Error {
  constructor(
    readonly sourceId: string,
    readonly kind: SourceErrorKind,
    message: string
  ) {
    super(`${sourceId}: ${message}`);
    this.name = "SourceError";
  }
}

const USER_AGENT =
  "opportunityzones-mcp/0.1 (+https://github.com/Jaysunnn8solutions/opportunityzones-mcp)";

export interface RuntimeFetchOptions {
  /** Registry id of the source, used in error messages. */
  sourceId: string;
  /** Per-attempt ceiling. */
  timeoutMs?: number;
  /** Extra attempts after the first, for timeouts, 5xx and 429 only. */
  retries?: number;
  init?: RequestInit;
}

/** GET or POST a JSON endpoint, with a deadline and redaction-safe errors. */
export async function fetchJson<T = unknown>(url: string, options: RuntimeFetchOptions): Promise<T> {
  const text = await fetchText(url, options);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new SourceError(options.sourceId, "bad-response", `response was not JSON (${text.length} bytes)`);
  }
}

export async function fetchText(url: string, options: RuntimeFetchOptions): Promise<string> {
  const { sourceId, timeoutMs = 8_000, retries = 1, init } = options;
  const headers = new Headers(init?.headers);
  if (!headers.has("User-Agent")) headers.set("User-Agent", USER_AGENT);

  let last: SourceError | undefined;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(250 * 2 ** (attempt - 1));
    let res: Response;
    try {
      res = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      last = new SourceError(sourceId, "unavailable", timedOut ? `no answer within ${timeoutMs} ms` : "network error");
      continue;
    }
    if (res.ok) return res.text();
    // Drain the body so the connection can be reused; its content is not
    // reported, since some APIs echo the request (and its key) back.
    await res.body?.cancel().catch(() => undefined);
    if (res.status === 429 || res.status >= 500) {
      last = new SourceError(sourceId, "unavailable", `HTTP ${res.status}`);
      continue;
    }
    throw new SourceError(sourceId, "rejected", `HTTP ${res.status}`);
  }
  throw last ?? new SourceError(sourceId, "unavailable", "no response");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
