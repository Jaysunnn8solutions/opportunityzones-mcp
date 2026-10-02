# Terms acceptance and deployment

Updated September 28, 2026, terms version 2026-09-28.1. See `MCP_IMPLEMENTATION.md` for the current protection and optional OAuth flow.

## Website

Every hosted research page, RSC request, API, and map data file passes the Next.js server proxy. Missing or invalid consent redirects pages to `/entry` and returns 401 for data requests. The entry page does not serialize a protected research page behind its UI. Legal documents, accessibility help, MCP connection instructions, and the decorative entry assets remain public so people can review the agreement.

The checkbox is initially unchecked. Both entry controls remain disabled until checked. Clicking either posts explicit current-version acceptance to a same-origin endpoint. Entry proceeds only after the receipt is stored. Browser storage, a login cookie, or an MCP token cannot substitute for a valid website receipt.

Receipts are random 256-bit credentials stored as hashes, with terms version, SHA-256 document fingerprint, channel, acceptance time, expiry, and revocation status. The corresponding complete legal document is archived. No identity, raw IP, user agent, search, or tool arguments are part of the receipt. Records expire from storage after 90 days during routine pruning. Browser credentials expire after seven days; MCP credentials after 30 days. A changed document or terms version invalidates older credentials. These records evidence receipt issuance after an acceptance request, not verified human identity or proof someone read the document.

## MCP

`/use-with-claude` and `/account` provide an explicit MCP acceptance form. A signed-in free passkey account with current terms is required to issue a token. Checking the box while signed out preserves the choice through sign-in, then requires a final acceptance action; sign-in never issues a token automatically. `/mcp` checks the token, account, current document, expiry, revocation and connection ownership before initialization, discovery, and tool calls. Website receipts and legacy anonymous MCP tokens are not accepted.

`/api/mcp-connections` lists safe metadata and supports creation, atomic replacement, single revocation, and revocation of all connections. Every mutation requires a same-origin authenticated request. Revocation remains available when account terms are outdated. Tokens are revealed only at issuance and stored only as hashes. Acceptance records link the account, connection, exact archived document and timestamp. Deleting an account cascades to connections and its MCP acceptance records. Records expire during pruning 90 days after acceptance. A coarse last-used timestamp is operational metadata; questions and tool arguments are not recorded.

Limits: five unexpired, unrevoked connections per account; ten issuances/replacements per rolling day; 300 MCP requests per minute across all connections, in addition to network limits. Rotation does not reset usage. Account suspension blocks its connections. Revocation stops later requests, not already-returned information. The account page also supports passkey addition/removal, recovery codes, signing out other sessions, and deletion. Removing the last passkey is blocked, and security mutations require recent verification.

Account setup pages and account/connection endpoints are reachable without a website receipt, but protected research remains behind its own gate. These endpoints validate authentication and acceptance independently. Never put tokens in URLs, shared config, logs, or chat messages.

Direct-token clients must support a private Authorization header. Optional browser OAuth now supports public clients, dynamic registration, S256 PKCE, exact callbacks and explicit approval; deployment must opt in and verify each supported client. OAuth connections expire within one hour and do not use refresh tokens. See `MCP_IMPLEMENTATION.md` for limits and verification. Tool-use approval by an AI client is not terms acceptance.

## Hosting requirements and limits

- Run Next.js on one Node host with persistent private SQLite storage (`OZ_SINGLE_HOST=1`, `OZ_STORAGE_PATH`) and a configured HTTPS `OZ_ORIGIN`. Existing limits and optional passkeys use the same storage. Research fails closed if storage is unavailable.
- Proxy and route processes must use the same persistent database path. Do not deploy this configuration as independent ephemeral serverless instances.
- Route all research and data requests through the gate. Do not expose `public/boundaries`, research APIs, or the origin through an unguarded CDN/static hosting route. Protected responses use private/no-store caching. Upstream dataset caching remains separate from access checks.
- Development and production headers, reverse-proxy stripping, SQLite backups, file permissions, credential redaction, consent retention, and tamper-resistant backup/audit practices need deployment review. Purge previously public CDN caches when deploying this change.
- Tokens are bearer credentials and can be copied. This implementation does not prove personal identity, prevent an accepted user copying public outputs, or guarantee legal enforceability. The owner/operator details and legal review remain required before release.
- Firebase was researched, not configured. Firebase App Hosting uses the billed Blaze plan. Classic Hosting can serve static assets on Spark, but does not replace this application's Node/MCP/SQLite backend. A public CDN must not bypass the gate. BigQuery is an analytics store, not this live authorization store. Its no-card sandbox expires tables after 60 days. The October 1 policy permits provider free plans with no payment method and a hard stop at free limits; billing-enabled deployments remain excluded. Reverify provider details before selection.

## Verification

`lib/access/consent.test.ts` covers rejected consent, origin checks, receipt hashing, revocation, expiry, version mismatch, cross-channel rejection, and direct page/API/data paths. UI accessibility checks cover an unchecked initial gate and disabled entry. The MCP smoke client requires an independently accepted private `OZ_MCP_TOKEN`; it never accepts terms automatically.

Sources: [Firebase App Hosting costs](https://firebase.google.com/docs/app-hosting/costs), [Hosting limits](https://firebase.google.com/docs/hosting/usage-quotas-pricing), [BigQuery sandbox](https://docs.cloud.google.com/bigquery/docs/sandbox).
