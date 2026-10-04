# Operations, recovery, and release verification

## Operator access

Set `OZ_OPERATOR_ACCOUNT_IDS` to the exact random account ID of the owner, or a comma-separated list of authorized operators. The ID is visible in My account; it is not a password. Set this only through trusted deployment configuration. No signup or API action can grant an operator role. Do not put it in a `NEXT_PUBLIC_` variable.

After deployment, sign in, verify with a passkey, and open `/operator` within ten minutes. The API independently checks the allowlist, session, terms, recent verification, request rate, and origin. The ordinary account page exposes the operator link only for allowlisted members.

The console shows aggregate service counters, MCP failure categories, temporary export storage, configuration checks, and the latest audit events. It never shows geocode queries, tool arguments, addresses, notes, tokens, or recovery secrets. Temporary export bytes are **not** total database storage: verify that in Neon separately.

Pause/resume controls cover new exports, signup, and MCP. Environment pauses override console resumes. Existing export artifacts retain their one-hour retry period. Account suspension permanently revokes existing MCP tokens and website sessions; restoring an account does not resurrect them. Operator accounts cannot be targeted by these controls. For a compromised operator, remove its allowlist entry in deployment configuration, revoke credentials through trusted database administration, and use a different authorized operator account.

Successful account security events remain for 30 days, with up to 50 shown. Operator audit events remain for 90 days; deleting an account detaches its identifiers. Routine cleanup enforces retention.

## Quotas and trusted proxy

MCP setup binds an account to the server-derived signed browser allowance for at most 30 days. Calls, rows, bytes, discovery, and token issuance check both scopes. Deletion copies recent MCP counts into the retained browser allowance, without restarting timestamps. MCP clients cannot set their own allowance bucket. Browser/account counters are mirrored; dashboards use service counters to avoid double-counting.

This deters repeated registrations in the same browser. It does not identify a unique human, and clearing site data or using another browser remains possible. Service-wide hard limits and bounded concurrency remain essential. No device fingerprint is collected.

`OZ_TRUSTED_IP_HEADER` is ignored unless `OZ_TRUSTED_PROXY_VERIFIED=1`. Until then all clients use a conservative shared network bucket. Do not set the verification flag just to clear the dashboard warning.

Before setting that flag on the real deployment:

1. Confirm the provider's current documentation identifies a header the edge overwrites.
2. Verify that client-supplied values are overwritten, including alternate-case headers and multiple forwarded values.
3. Verify that direct origin access cannot bypass that edge.
4. Record provider, header, date, and result in private launch evidence. Do not log actual client IPs.

This repository does not infer or enable a trusted header for Vercel automatically. Shared limits are safer than trusting an arbitrary forwarding header.

## Recovery

`npm run recovery:drill` creates synthetic records in an isolated SQLite file, checkpoints and copies it, restores the copy, quarantines old credentials, checks retained usage, and removes only that temporary directory. Evidence goes to `.runtime/recovery-drill.json`. Access tests exercise the same quarantine behavior in offline PostgreSQL/PGlite.

Neither check verifies a Neon backup or its plan retention. A real provider restore must first go to a separate, private database with no serving application. Verify the exact free plan's backup/restore availability without adding billing or creating a billable branch.

Before reconnecting any restored database, run the equivalent of `quarantineRestoredAccess(store)` through a trusted maintenance process against that **isolated restored store**. It removes sessions, challenges, recovery credentials, passkeys, OAuth codes/access, and leases; revokes all agreement receipts; disables restored accounts; and pauses signup/exports/MCP. It retains usage and other records. This intentionally prevents a backup from bringing deleted or revoked credentials back to life.

Do not directly resume restored accounts. Reconcile against an independent current revocation/deletion record if one is available; otherwise reenroll users with new credentials after controlled recovery. Reconcile post-backup usage/deletions, purge expired artifacts and retention records, reauthorize the operator through deployment configuration, renew consent, then restore service deliberately. A database backup cannot contain actions that occurred after it was taken.

## Release gates and rollback

`npm run release:build` stops on the first failed type check, lint, unit test, offline PostgreSQL test, dataset audit, recovery drill, production build, or loopback HTTP smoke check. CI and `vercel.json` use this command. Confirm the deployment dashboard has not overridden the repository build command. No production deployment was performed by adding this configuration.

The release gate also runs `npm run security:audit` (`npm audit --omit=dev --audit-level=high`). It queries the free public npm advisory registry and fails on high/critical production findings or registry failures. It is not evidence of complete security and does not assess every development dependency. Do not automatically upgrade major dependencies or install paid security services. Review actionable findings and rerun the release gates after changes.

Keep the last successful application deployment and a compatible database restore plan. Schema migrations here are additive (version 3 adds operations metadata). Roll back application code only after checking schema and terms compatibility; an older legal document must not silently reaccept a newer receipt. A code rollback does not restore deleted accounts or revoke newly issued tokens.

## Remaining live acceptance checks

### Dependency review, October 3, 2026

Next.js and its matching lint configuration were updated from 16.3.4 to 16.3.8. The production-only npm audit then reported no known vulnerabilities. The prior critical [ImageResponse advisory](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j) concerns attacker-controlled SVG input to `next/og`; no `ImageResponse` use was found in this application's `app/` or `lib/` code.

The full development audit still reports the [braces recursion advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), with five affected entries in the single `eslint-config-next → eslint-plugin-next → fast-glob → micromatch → braces` chain. There is no patched braces version listed. Do not accept untrusted glob patterns into lint tooling. Do not use `npm audit fix --force`, which proposed an incompatible downgrade of the Next lint configuration to version 14. Recheck the upstream fix before updating. This is a documented remaining development dependency finding, not a claim of a clean full audit.

### Deployment and device checks

- Real deployed origin, TLS, proxy spoof resistance, and private/no-store CDN behavior.
- Real passkey signup, sign-in, backup/recovery, and revocation on desktop and phone.
- Actual external MCP client's token setup, limits, and revoked-token rejection.
- Keyboard-only completion, screen-reader announcements, 200–400% zoom/reflow, high contrast, reduced motion, and touch navigation.
- Actual Neon backup availability, retention, isolated restoration, and storage headroom.
- Published operator/contact details and an accessible support route.

Do not mark these complete based on automated local tests. `/status` reports coarse database reachability and pause flags, not upstream agency uptime or guaranteed quotas. Help links to the existing Correction desk; its drafts exclude local notes and addresses and require user review before opening a public issue.
