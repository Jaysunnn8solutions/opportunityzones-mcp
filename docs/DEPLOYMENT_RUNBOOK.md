# Deployment and recovery runbook

## Hosting decision

### October 2: Vercel and Neon setup

The owner deployed `https://opportunityzones-mcp.vercel.app/`, confirmed Vercel Hobby with no payment method, and selected Neon Free directly (AWS us-east-1, no payment method). The owner reports a 0.5 GB storage allowance; use that account-specific limit. Neon documents compute/transfer suspension and storage-write restrictions at free limits. The owner reports saving `OZ_ORIGIN` and the pooled `DATABASE_URL` as Production secrets/settings. Credentials have not been supplied in chat. The production database connection and end-to-end access remain unverified.

1. Confirm Vercel Hobby/noncommercial permitted use, no payment method or billable services. Verify the separate database plan before any provider operations.
2. In Vercel project Settings → Environment Variables, add `OZ_ORIGIN=https://opportunityzones-mcp.vercel.app` for Production. Changes apply to a new deployment. Preview URLs need their own isolated configuration.
3. Keep the pooled PostgreSQL connection URI in server-only `DATABASE_URL`, never `NEXT_PUBLIC_DATABASE_URL`. Keep connection strings out of chat/Git. Do not add payment methods, upgrades, or marketplace billing. Recheck plan restrictions before enabling optional services.
4. The application now selects PostgreSQL when `DATABASE_URL` is present. It uses asynchronous queries, verified TLS, a pool capped at three connections per instance, bounded query/lock waits, and transaction-scoped advisory locks for shared security reservations. Run `npm run test:postgres` (offline PostgreSQL in WASM), `npm test`, type checking, lint, and build before deployment.
5. Deploy the updated application. On first database access, an atomic, versioned migration creates the account/security schema. A schema lock serializes initialization across instances. No public Census dataset is uploaded to Neon, and no existing SQLite accounts are imported. Initializing a new empty Neon project is supported; migrating existing live account records requires a separate reviewed transfer.
6. Open `/api/consent` on the production domain and expect HTTP 200 with `accepted: false` in a fresh browser. Then explicitly accept the agreement and verify the cookie, research access, and persistence after refresh/redeploy. Test passkeys, MCP issue/revoke, account deletion, export retries, and quota failures on the deployed database. These live checks and backup restoration remain outstanding.

Do not set `OZ_STORAGE_PATH=/tmp/...` or `OZ_SINGLE_HOST=1` to work around Vercel storage limitations. Production SQLite access explicitly refuses the Vercel runtime. If PostgreSQL fails or reaches its free limit, the app fails closed without falling back to local storage. The consent endpoint checks origin/storage readiness before presenting an actionable acceptance flow; visitors receive a recoverable availability message without configuration internals.

References: [Vercel environment variables](https://vercel.com/docs/environment-variables), [SQLite limitations](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel), [Hobby plan](https://vercel.com/docs/plans/hobby), [Neon plan documentation](https://github.com/neondatabase/website/blob/main/content/docs/introduction/plans.md), [Neon pooled connections](https://neon.com/docs/connect/connect-from-any-app).

Local October 2 verification: 675 tests across 93 files passed (`npm test -- --maxWorkers=2`), plus 62 checks across 11 files against offline PostgreSQL (`npm run test:postgres`). TypeScript, lint, and the production build passed. PostgreSQL tests cover schema initialization/reuse, rollback, concurrent reservations, real passkey-signature verification, acceptance/revocation, account deletion, and export retries. The WASM test database validates SQL and constraints; it does not verify Neon networking, pooled TLS connections, Vercel runtime behavior, or production backups. Those require deployment checks.

### Existing architecture and candidate constraints

The application supports shared PostgreSQL for hosted instances or private SQLite on one persistent Node.js host. As of October 1, the owner permits free plans from providers with paid offerings only when no payment method is required or on file and service stops at free limits without charges or automatic upgrades. Trials and billable overages remain excluded. Verify both hosting and database plans, including the actual marketplace signup route, before provisioning.

The owner's Vercel/Neon setup is recorded above. The policy change itself does not authorize other providers or paid services. PostgreSQL support does not establish production readiness without the live checks below.

Firebase Hosting plus Cloud Run is not a fit under the current rule: dynamic Cloud Run integration requires a billing account. See [Firebase's Cloud Run hosting documentation](https://firebase.google.com/docs/hosting/cloud-run) and [pricing plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans), checked September 28, 2026. Static hosting alone cannot run the consent, account, quota, export, or MCP endpoints.

## Release preparation

1. Run `npm ci`, `npm test`, `npm run type-check`, `npm run lint`, `npm run build`, and `npm run release:audit` on the exact candidate. Review `.runtime/release-audit.json` privately; it contains public data fingerprints and completeness findings, not secrets.
2. Resolve deployment blockers and owner decisions in `PRE_LAUNCH_CHECKLIST.md`. Confirm accurate operator/contact disclosures and review document accuracy. Paid attorney review has been declined by the owner; professional review remains an optional precaution and legal sufficiency is unverified. No automated check establishes legal compliance.
3. Keep the published data, dependency lockfile, source registry, legal captures, and their reviewed fingerprints together. Re-run the audit after a source update; unexpected columns, publisher URLs, licenses, control characters, or instruction-like source additions require human review. Do not publish an unreviewed refresh over the prior working release.
4. Configure `OZ_ORIGIN` to the exact public HTTPS origin and `DATABASE_URL` for shared PostgreSQL. For the single-host SQLite alternative only, configure private `OZ_STORAGE_PATH` and `OZ_SINGLE_HOST=1`. Set a trusted IP header only if the hosting proxy strips incoming copies and writes the real connection address. Without that verified configuration, anonymous traffic shares a conservative quota bucket.
5. For self-hosting, bind Next.js to loopback and expose HTTPS only through the chosen reverse proxy. On managed hosting, verify equivalent protections. Enforce request-body size and time limits, connection limits, and bounded access-log retention. Never log cookies, Authorization headers, request bodies, OAuth codes/state, or precise research queries. Block direct access to `.runtime`, `.env*`, `.git`, and source directories.
6. All dynamic and protected data responses must remain private/no-store through the proxy/CDN. Do not cache protected boundary files or independently expose the public directory on a CDN that bypasses consent. Check RSC and alternate-host requests too.
7. Browser OAuth is opt-in: set `OZ_OAUTH_ENABLED=1` only after client tests on the final HTTPS origin. It supports authorization code + S256 PKCE, exact registered callbacks, `research:read`, and one-hour tokens. It does not support refresh tokens, client metadata URL fetching, or confidential client secrets. Never advertise untested client compatibility.
8. For self-hosting, start with `npm run start -- --hostname 127.0.0.1` under a service manager and an unprivileged account. For Vercel, deploy the reviewed Git revision. No paid hosting or upgrades are authorized by this runbook.

### Repeatable local production check

After building, run `npm run release:smoke`. It launches the built server on an unused loopback port with a unique private test database, checks 21 public/protected HTTP behaviors, then stops its child server and removes that test directory. It never accepts terms, creates accounts, calls data providers, or uses the operator's access database. Evidence is saved in `.runtime/release-smoke.json` only after success. This checks the Next.js boundary locally; repeat deployment-specific verification through the actual HTTPS proxy/CDN before launch.

## Bounded MCP operations

- `npx tsx scripts/access-admin.ts mcp-status`: aggregate events, resource counters, leases and pauses; no tool arguments.
- `npx tsx scripts/access-admin.ts mcp-pause`: stop MCP independently of browsing.
- `npx tsx scripts/access-admin.ts mcp-pause TOOL_NAME`: pause one capability.
- `npx tsx scripts/access-admin.ts mcp-resume [TOOL_NAME]`: resume after review.
- `npx tsx scripts/access-admin.ts suspend ACCOUNT_ID`: revoke website sessions and block account access, including MCP.
- `OZ_MCP_PAUSED=1` and `OZ_EXPORTS_PAUSED=1` are emergency deployment controls.

Temporary invalid-request cooldowns are not permanent bans. Review shared-network effects before escalating. Keep published data accurate; never corrupt responses to deter copying.

## Backup and rollback

For Neon, verify the actual Free plan recovery window; do not assume paid-plan backup retention. Test a private PostgreSQL dump/restore procedure within the no-charge policy. Do not create paid backup services. For SQLite, use its backup API or a stopped service; copying only the main file while WAL writes are active is unsafe. Keep backups access-restricted, outside public files, with an explicit retention/deletion schedule. Store source/publication releases separately from account data.

Before restoring a backup, stop public traffic. In the restored private database, invalidate all website sessions, revoke all MCP receipts, delete pending OAuth authorization codes and sign-in challenges, and clear in-flight leases. This avoids reactivating credentials revoked since the backup. Restart privately, verify migrations and access failures, then require fresh sign-in/acceptance before reopening. Record restore date and operator, without token values or research data.

Rolling back application code must preserve additive database migrations and reject incompatible terms/token versions. Keep the previous validated data snapshot available. Test restoration on an isolated copy before launch; this document does not claim a live restore was performed.
