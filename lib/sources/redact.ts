/**
 * Query parameters that carry a credential in some API this product calls.
 * Census uses `key`; others use the rest. Shared by the pipeline and the
 * runtime clients so the two cannot drift.
 */
const CREDENTIAL_PARAMS = [
  "key",
  "api_key",
  "apikey",
  "token",
  "access_token",
  "registrationkey",
  "subscription-key",
];

/**
 * Strip credential query parameters before a URL reaches a log, an error, or a
 * cache filename. A raw URL to a keyed API is a secret and must never be printed.
 */
export function redact(url: string): string {
  try {
    const u = new URL(url);
    for (const k of CREDENTIAL_PARAMS) {
      if (u.searchParams.has(k)) u.searchParams.set(k, "REDACTED");
    }
    return u.toString();
  } catch {
    return url;
  }
}
