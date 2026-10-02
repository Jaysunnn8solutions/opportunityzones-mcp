# Launch readiness — October 1, 2026

## Current verification — October 1

**Local engineering checks passed; public deployment remains pending.** This is evidence for the current uncommitted working tree, not a signed-off release commit or a certification of security/accessibility/legal compliance.

| Check | Result |
|---|---|
| Full automated suite | 91 files, **667 tests passed**, including account/consent, MCP protocol and abuse limits, workflows, and automated accessibility tests |
| Production build | Passed; 38 static pages generated, dynamic routes and request proxy built |
| Standalone TypeScript / full ESLint | Both passed |
| Built-server HTTP checks | **21 passed**, on a temporary loopback production server with its own SQLite storage; no terms accepted or accounts created |
| Local publication audit | 85,529 tracts, 44 columns, 16 registered sources; no consistency findings |
| Historical analysis artifact | Valid against published data fingerprints; 57,748 histories, 3 exploratory models; no 2037 forecast |
| Patch whitespace check | Passed |

The HTTP checks cover public entry/legal/account pages, protected research pages and RSC navigation, API/static map-data/export consent boundaries, anonymous MCP/connection rejection, foreign-origin rejection, and refusal to accept an unchecked agreement. They do not test a public reverse proxy, TLS, CDN, physical devices, a real passkey authenticator, or an external chat client. No browser agreement was changed. Private evidence: `.runtime/release-smoke.json` and `.runtime/release-audit.json`.

One release check initially failed because the secret scanner mistook exact public metric identifiers for credentials. A file- and value-specific exception now handles those identifiers while leaving credential patterns and other assignments checked; a regression test covers the exception. The audit now also validates/fingerprints the historical indicator artifact.

### Remaining work in launch order

1. Select hosting and a domain under the October 1 policy: provider free plans are allowed with no payment method and service stops at the free limit without charges. Verify exact hosting/database plans and signup paths. The current SQLite code requires one persistent host; Vercel with managed PostgreSQL would require migration. Configure HTTPS, private storage, proxy limits and log privacy.
2. Resolve individual operator/public contact disclosures and final document accuracy. Paid attorney review was declined and is not a technical requirement. Do not invent a company or publish a home address by assumption.
3. Identify/commit the final release candidate and rerun checks after any further changes or deployment-specific configuration.
4. On that deployment, verify real passkey/account/MCP client flows, authenticated consent, proxy/CDN boundaries, restart persistence, isolated backup restoration and rollback.
5. Complete human keyboard/screen-reader, phone/touch/reflow and slow-network checks; record owner release approval.

Commands: `npm test -- --testTimeout 15000`, `npm run type-check`, `npm run lint`, `npm run build`, `npm run release:audit`, then `npm run release:smoke`. The smoke script stops its own server and deletes only its unique test database directory. Keep deployment checklist boxes open until verified on the actual host.

## Earlier implementation record — September 28

Status: engineering changes implemented locally; **not approved for public launch**. No production deployment, operator identity, attorney approval, or real-device certification is implied. This working tree contains earlier user-requested changes as well as this implementation; it has not been committed as a release candidate.

**Owner clarification after this report:** this is a personal community project; hosting is undecided and paid attorney review is declined. Attorney review is a recommendation, not an established legal prerequisite. References below to attorney approval describe the original proposed review plan, not a mandatory expense or technical launch gate. Operator identification/contact disclosures need to be resolved for an individual operator without inventing a company or presuming a home-address disclosure requirement. See the updated pre-launch checklist.

## Work in the agreed order

| Priority | Item | Completed locally | Remaining release evidence |
|---|---|---|---|
| 1 | MCP abuse protection | Strict request/output validation, account and service call/row/byte budgets, concurrency leases, temporary cooldowns, aggregate incident counters, per-tool/global pause controls | Verify reverse-proxy connection limits, trusted headers, log privacy, backups, and operational response on the selected host |
| 2 | Useful neutral MCP tools | 19 tools total: definitions, coverage, criteria/evidence, uncertainty, boundary relationships, captured source changes, explicit comparisons of up to 25 tracts, export previews, usage/capability discovery | Verify supported chat-client presentation and complete real-client workflows; tools do not choose a preferred tract or recommend a transaction |
| 3 | Optional OAuth setup | Public client registration, exact callbacks, S256 PKCE, account approval, current document fingerprint, two-minute single-use codes, one-hour revocable tokens, resource/scope binding | Disabled by default. Configure final HTTPS origin, test intended clients and passkey devices, then enable deliberately |
| 4 | Desktop/mobile workflow review | Automated coverage of search, filter/navigation continuity, selection, comparisons, account/MCP controls, and consent boundaries | Current browser inspection was blocked by the browser tool's security restriction on an existing error page. User must reopen a valid site page and review/accept terms themselves; desktop, phone, touch, slow-network and visual checks remain outstanding |
| 5 | Accessibility and reports | Semantic standalone report.html in tract ZIPs; source links, missing-value explanations, headings, tables, skip link, no scripts/assets; UI and report accessibility tests | Human keyboard and screen-reader walkthrough, real zoom/reflow checks, device focus/touch testing. Printed PDF is not verified as tagged/accessible; MCP accessibility also depends on the client |
| 6 | Hosting and configuration | Concrete single-host deployment, privacy, rollback, backup, and incident runbook; no paid service added | Owner must identify a permissible host and domain. Persistent private SQLite is required. No host provisioned or production restoration tested |
| 7 | Operator/document review | Review handoff, operator input list, updated terms/privacy covering OAuth and abuse records, exact acceptance records | Appropriate individual operator/contact disclosures, accurate final terms and owner release decision; paid attorney review declined |
| 8 | Data/source verification and documentation | Repeatable local publication audit; source registry/attribution validation; data/legal fingerprints; official Treasury totals and ACS period checked; stale MCP/account documentation corrected | Recheck all source vintages and licenses for the final publication, validate representative records, inspect future source changes before release |

## Verification evidence

Executed in this working tree on September 28, 2026:

- Full Vitest suite: **83 files, 633 tests passed** (`vitest run --testTimeout 15000`). Includes real MCP SDK protocol tests, OAuth replay/PKCE/resource and consent tests, quotas/concurrency/cooldowns, report escaping, and automated accessibility checks.
- Full ESLint: passed, no findings. Archived third-party MapLibre workers have the same lint exclusion as the active bundled workers.
- Production Next.js build: passed, including TypeScript and generation of 38 static pages. OAuth and MCP handlers build as dynamic routes.
- Local data audit: **85,529 distinct tract IDs, 44 columns, 16 published sources**, no consistency findings. Operator details are incomplete. Audit output and SHA-256 fingerprints are in private `.runtime/release-audit.json`; rerun with `npm run release:audit` after publication changes.
- Dataset eligibility totals: **25,332 eligible tracts**, including **8,334 eligible rural tracts**, match the [Treasury release](https://home.treasury.gov/news/press-releases/sb0550). Eligibility is not a 2027 designation. The official program page is [Treasury Opportunity Zones](https://home.treasury.gov/policy-issues/tax-policy/data-transparency/qualified-opportunity-zones).
- The ACS source period is 2020–2024. Census's [2024 release schedule](https://www.census.gov/programs-surveys/acs/news/data-releases/2024/release.html) documents the revised January 29, 2026 five-year release. A dataset build date is not its observation period. This check does not assert all 16 sources were refreshed or individually revalidated upstream.

These checks verify the stated behavior, not immunity from abuse, legal sufficiency, universal client compatibility, or ADA compliance. Source content and exported public facts remain copyable under their licenses. No model API is called by the product.

## Owner inputs needed

1. Accurate individual operator identification and a working public contact method; resolve applicable disclosures without assuming a company or publishing a home address.
2. Domain and hosting/database selection that satisfies the revised no-payment-method/hard-stop policy. Managed PostgreSQL is a candidate requiring migration, not a completed change. Firebase Hosting with Cloud Run requires billing and was not selected; see the runbook's official references.
3. Owner review of document accuracy; paid attorney review was declined and is optional, with legal sufficiency unverified.
4. Intended chat clients and real desktop/mobile devices for final compatibility and accessibility checks.

Updating the operator/terms text changes the document fingerprint and requires renewed acceptance. Complete the legal text before collecting production acceptance records. Do not bypass the consent screen to perform visual testing.

## Supporting records

- [MCP implementation and limits](MCP_IMPLEMENTATION.md)
- [Deployment and recovery runbook](DEPLOYMENT_RUNBOOK.md)
- [Legal review handoff](LEGAL_REVIEW_HANDOFF.md)
- [Pre-launch checklist](PRE_LAUNCH_CHECKLIST.md)
- [Accessibility status and remaining checks](ACCESSIBILITY.md)
- [Account, download and provider protections](ACCESS_IMPLEMENTATION.md)

The pre-launch checklist remains the owner release gate. Mark deployment checks complete only after recording the reviewer, date, and actual evidence.
