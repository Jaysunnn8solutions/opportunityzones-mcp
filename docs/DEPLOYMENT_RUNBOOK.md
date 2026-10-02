# Deployment and recovery runbook

## Hosting decision

The current application needs one persistent Node.js host and private SQLite storage. As of October 1, the owner permits free plans from providers with paid offerings only when no payment method is required or on file and service stops at free limits without charges or automatic upgrades. Trials and billable overages remain excluded. Verify both hosting and database plans, including the actual marketplace signup route, before provisioning. An existing owner-controlled machine is also a candidate after the owner confirms availability, connectivity, domain, maintenance, and operating costs. No host has been selected or provisioned.

Vercel with managed PostgreSQL can now be evaluated under this policy. It requires migrating the current SQLite access layer and retesting transactions, consent, quotas and revocation; it is not a configuration-only deployment. Neither a particular provider nor its billing safeguards has been approved by the policy change.

Firebase Hosting plus Cloud Run is not a fit under the current rule: dynamic Cloud Run integration requires a billing account. See [Firebase's Cloud Run hosting documentation](https://firebase.google.com/docs/hosting/cloud-run) and [pricing plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans), checked September 28, 2026. Static hosting alone cannot run the consent, account, quota, export, or MCP endpoints.

## Release preparation

1. Run `npm ci`, `npm test`, `npm run type-check`, `npm run lint`, `npm run build`, and `npm run release:audit` on the exact candidate. Review `.runtime/release-audit.json` privately; it contains public data fingerprints and completeness findings, not secrets.
2. Resolve deployment blockers and owner decisions in `PRE_LAUNCH_CHECKLIST.md`. Confirm accurate operator/contact disclosures and review document accuracy. Paid attorney review has been declined by the owner; professional review remains an optional precaution and legal sufficiency is unverified. No automated check establishes legal compliance.
3. Keep the published data, dependency lockfile, source registry, legal captures, and their reviewed fingerprints together. Re-run the audit after a source update; unexpected columns, publisher URLs, licenses, control characters, or instruction-like source additions require human review. Do not publish an unreviewed refresh over the prior working release.
4. Configure `OZ_ORIGIN` to the exact public HTTPS origin, `OZ_STORAGE_PATH` to a private persistent database outside the web root, and `OZ_SINGLE_HOST=1`. Set a trusted IP header only if the reverse proxy strips incoming copies and writes the real connection address. Do not expose multiple independent database replicas.
5. Bind Next.js to loopback; expose HTTPS only through the chosen reverse proxy. Enforce request-body size and time limits, connection limits, and bounded access-log retention. Never log cookies, Authorization headers, request bodies, OAuth codes/state, or precise research queries. Block direct access to the backend port, `.runtime`, `.env*`, `.git`, and source directories.
6. All dynamic and protected data responses must remain private/no-store through the proxy/CDN. Do not cache protected boundary files or independently expose the public directory on a CDN that bypasses consent. Check RSC and alternate-host requests too.
7. Browser OAuth is opt-in: set `OZ_OAUTH_ENABLED=1` only after client tests on the final HTTPS origin. It supports authorization code + S256 PKCE, exact registered callbacks, `research:read`, and one-hour tokens. It does not support refresh tokens, client metadata URL fetching, or confidential client secrets. Never advertise untested client compatibility.
8. Start the release with `npm run start -- --hostname 127.0.0.1`. Use the host's service manager, with a dedicated unprivileged account and restart limits. No paid hosting or public deployment is performed by this runbook.

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

Back up private SQLite consistently using SQLite's backup API or a stopped service; copying only the main file while WAL writes are active is unsafe. Keep backups access-restricted, outside public files, with an explicit retention/deletion schedule. Store source/publication releases separately from account data.

Before restoring a backup, stop public traffic. In the restored private database, invalidate all website sessions, revoke all MCP receipts, delete pending OAuth authorization codes and sign-in challenges, and clear in-flight leases. This avoids reactivating credentials revoked since the backup. Restart privately, verify migrations and access failures, then require fresh sign-in/acceptance before reopening. Record restore date and operator, without token values or research data.

Rolling back application code must preserve additive database migrations and reject incompatible terms/token versions. Keep the previous validated data snapshot available. Test restoration on an isolated copy before launch; this document does not claim a live restore was performed.
