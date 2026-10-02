# Pre-launch checklist

Owner/operator release checklist · Created September 27, 2026

October 1 local verification is recorded in [LAUNCH_READINESS.md](LAUNCH_READINESS.md): 667 automated tests, production build, TypeScript/lint, publication audit, and 21 isolated production HTTP checks passed. Hosting/recovery steps are in [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md), and owner/review inputs are collected in [LEGAL_REVIEW_HANDOFF.md](LEGAL_REVIEW_HANDOFF.md). Unchecked release verification below remains unchecked until completed on the intended deployment.

Use this document before opening the hosted service to the public. Check an item only after verifying it on the intended release and deployment; record the reviewer, date, and evidence. An unchecked item means release verification is outstanding, even when the feature is already implemented.

This checklist is maintained in the repository, not shown in the website's visitor flow. It is a manual release gate, not an automated deployment block. Removing the visitor-facing draft notice does not complete the work below.

## 1. Operator transparency and document review

Owner clarification, September 28, 2026: this is a personal community project, with no separate business entity supplied. The owner does not wish to pay for attorney review. Attorney review is a recommended precaution, not an established legal prerequisite or a technical launch requirement. Earlier blanket attorney-sign-off requirements are superseded by this clarification. Applicable disclosure obligations still depend on jurisdiction and actual operation; no legal clearance is implied. Do not invent a company or publish a residential address without the owner's direction.

- [ ] **Resolve accurate operator identification and a working public contact method appropriate to the personal project.** Confirm which disclosures apply before filling `LEGAL_OPERATOR` in `lib/content/siteTerms.ts`; the present three-field completeness check is an implementation assumption, not a determination of legal requirements. Do not put private credentials or personal account data in this checklist.
- [ ] **Review the disclaimer, Terms of Use, Privacy Notice, and acceptance flow for accuracy.** Professional legal review remains an option; the owner has declined paid review. Record that limitation honestly and do not describe the documents as attorney-approved or guaranteed enforceable.
- [ ] Review the actual website and MCP outputs for informational-only language, source attribution, independent-site/Treasury distinction, and the absence of investment recommendations, personalized tax outcomes, solicitation, or housing steering.
- [ ] Confirm the privacy notice matches actual account records, connection labels, usage counts, last-used timestamps, consent retention, exports, hosting logs, backups, deletion, and external chat-client behavior.
- [ ] Finalize the terms version and date, archive the exact accepted documents, and verify that changes require renewed acceptance. Complete operator details before creating production acceptance records.

## 2. Hosting and access boundaries — release blockers

- [ ] Select hosting and dependencies under the October 1 policy: **free plans are acceptable, with no payment method and service stops at the limit**. Verify the exact signup route (including marketplace billing), no automatic upgrades/overage charges, quotas, exhaustion behavior, permitted use and backup/retention limits. Record evidence for both the hosting and database plans. Provider paid offerings are no longer an automatic exclusion; trials remain excluded.
- [ ] Configure the public domain and HTTPS. Verify `OZ_ORIGIN`, persistent private `OZ_STORAGE_PATH`, and the confirmed single-host setting `OZ_SINGLE_HOST=1`. The current SQLite design requires a shared persistent store, not independent ephemeral serverless instances.
- [ ] Verify direct page, RSC, API, map-data, and static-boundary requests cannot bypass terms acceptance through a CDN or alternate origin. Keep account setup and legal documents accessible; their endpoints must enforce their own authentication and acceptance rules.
- [ ] Verify production origin checks, secure cookies, private/no-store responses, and trusted-proxy header handling. The proxy must strip any client-supplied trusted IP header.
- [ ] Keep provider keys and the access database out of public files, client bundles, Git, logs, screenshots, and error messages. Review host/proxy logging for Authorization headers, cookies, request bodies, and precise locations.
- [ ] Test storage-unavailable behavior, restart persistence, backup restoration, and a documented rollback procedure. Confirm restored backups cannot unintentionally reactivate credentials revoked after the backup.

## 3. Accounts, acceptance, and MCP connections

- [ ] Test real passkey registration, sign-in, and recovery on the production domain with supported desktop and mobile devices. Document that this account model uses passkeys, not email/password login.
- [ ] Test adding/removing passkeys, the last-passkey safeguard, recent verification for security changes, recovery-code replacement, and signing out other website sessions.
- [ ] Confirm signed-out MCP users see a sign-in/create-account prompt, keep their checkbox selection through sign-in, and must explicitly confirm afterward. A checkbox or sign-in alone must not issue a token.
- [ ] Verify acceptance records contain the account, connection, timestamp, terms version, and exact document fingerprint; token storage contains hashes, never usable credentials.
- [ ] Test token issuance, one-time display, expiration, replacement, individual revocation, revoke-all, account suspension, and account deletion. Tokens issued under the previous anonymous model must fail.
- [ ] Verify one account cannot list, replace, or revoke another account's connections. Confirm account deletion removes its linked MCP records and stops its tokens.
- [ ] Test shared account/network allowances across multiple MCP tokens, daily issuance limits, active-connection limits, oversized requests, and direct API requests. Creating or replacing a token must not reset research usage.
- [ ] Verify compatibility and private credential storage with each client advertised as supported. Manual bearer credentials are supported; optional OAuth requires deployment configuration and real-client verification before enabling or advertising it.

## 4. Data, exports, and informational accuracy

- [ ] Verify the historical indicator artifact matches the deployed tract release. Keep 2037 selection probabilities unavailable until a separately validated and calibrated selection model exists. Review the exploratory model limitations and timing-label gates in [INDICATOR_ANALYSIS.md](INDICATOR_ANALYSIS.md).
- [ ] Refresh or verify source vintages and program status against the official published sources. Clearly distinguish eligibility, certified designation, unavailable data, and historical boundary vintages.
- [ ] Confirm every external source is registered in `pipeline/sources.ts` with a commercially compatible license and attribution. Recheck source changes before the release.
- [ ] Spot-check address, city/state, tract, map, list, comparison, and bulk-lookup workflows against representative known records. City search centers the map; it must not imply city-wide eligibility or municipal-boundary filtering.
- [ ] Verify export fields, units, missing values, source dates, geographic identifiers, and file contents. Confirm sign-in requirements, row/download allowances, and one-hour export-artifact retention.
- [ ] Verify saved projects remain device-local and require explicit saving. Shared links, API examples, and server exports must exclude private notes, project names, addresses, and exact searched points.

## 5. Accessibility, usability, and performance

- [ ] Perform a manual keyboard and screen-reader walkthrough of the entry agreement, navigation, account page, connection controls, filters, text results, comparisons, and exports. Check focus after dialogs, errors, and sign-in.
- [ ] Check contrast, visible focus, zoom/reflow, touch targets, mobile layouts, and clear status/error announcements. Automated checks alone do not establish accessibility compliance.
- [ ] Confirm equivalent useful text workflows are available without operating the map. Check reduced-motion behavior and controls for the animated entry background.
- [ ] Test initial loading and map interaction on representative phones and lower-powered computers, plus slow or interrupted connections. Verify service limits fail clearly without losing the user's work.
- [ ] Review launch copy, American English, navigation labels, source links, and account/MCP instructions. Confirm the draft reminder and empty operator placeholders are absent from visitor pages and the completed operator details are present.

## 6. Final release verification and operations

- [ ] Run the production build, TypeScript checks, required tests, and lint against the release candidate. Record the commit and results rather than relying on earlier development checks.
- [ ] Run the critical website and MCP workflows against the deployed candidate, using test accounts and explicit test consent. Verify failure cases as well as successful requests.
- [ ] Confirm consent/connection pruning, export expiration, operational log retention, and backup retention/deletion procedures on the deployed host.
- [ ] Establish an operator procedure for abuse reports, account suspension, emergency access revocation, source outages, factual corrections, and security incidents. Verify the public contact path works.
- [ ] Record final owner approval and outstanding limitations. Do not release while a blocker above remains unresolved.

## Release record

| Field | Value |
|---|---|
| Release commit/version | Pending |
| Public domain / deployment | Pending |
| Owner/operator reviewer | Pending |
| Legal review version / approval reference | No attorney review; owner declined paid review September 28, 2026 |
| Security and privacy verification / date | Pending |
| Accessibility and device verification / date | Pending |
| Test/build evidence | October 1 local working tree: 667 tests, build, TypeScript, lint, audit and 21 production HTTP checks passed; final committed/deployed candidate verification pending |
| Remaining launch decisions | Appropriate operator/contact disclosures, hosting, and unchecked deployment verification above; legal sufficiency remains unverified |
| Owner release approval / date | Pending |

## Implementation references

- [Consent enforcement and hosting](CONSENT_ENFORCEMENT.md)
- [Account and access implementation](ACCESS_IMPLEMENTATION.md)
- [Research workspace implementation](WORKBENCH_IMPLEMENTATION.md)
- [Architecture](ARCHITECTURE.md)

OAuth connection setup is implemented as an opt-in feature; enabling it does not complete client compatibility checks. Email-based authentication is excluded by the current minimal-account-data policy.
