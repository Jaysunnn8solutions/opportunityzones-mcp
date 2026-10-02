# Owner and attorney review handoff

Prepared September 28, 2026. This is a review brief, not an attorney's approval or a claim that the documents prevent liability.

Owner clarification: this is a personal project for community benefit. No separate entity or business office has been supplied; do not assume either exists. The owner has declined paid attorney review. This document is an optional review resource, not a requirement to retain counsel. The project must not claim attorney review or guaranteed protection. Identify appropriate operator/contact disclosures based on the actual operation and jurisdiction; do not presume a residential address must be published.

## Owner information required

- Accurate identification of the individual operator; no separate business entity is presumed.
- Working public contact method and operating jurisdiction; resolve applicable disclosure requirements before publishing personal details or assuming a home address is required.
- Final domain, deployment operator, logging practices, backup location and retention.
- Supported chat clients and the final enabled access methods.

Do not substitute invented values. Publish approved operator details through `LEGAL_OPERATOR` in `lib/content/siteTerms.ts`.

## Materials for counsel

- `/legal`: disclaimer, terms and privacy notice.
- `/entry/agreement`: website acceptance.
- `/use-with-claude`, `/account`, `/oauth/authorize`: MCP consent, connection controls and OAuth approval.
- `lib/content/siteTerms.ts`: versioned source documents.
- `docs/CONSENT_ENFORCEMENT.md`, `docs/DEPLOYMENT_RUNBOOK.md` and `docs/MCP_IMPLEMENTATION.md`: actual enforcement and retention behavior.
- Representative tract, comparison, historical-analysis, export and MCP outputs.

## Questions to resolve

1. Does the actual service and language remain an informational research service without personal recommendations, solicitation, investment/tax advice, or housing steering?
2. Are independent-government notices, source licenses, uncertainty, eligibility/designation distinctions, AI limitations and correction procedures accurate and sufficiently prominent?
3. Does the acceptance design provide adequate notice and records for the operator's jurisdiction and intended audience?
4. Are limitations, dispute provisions, privacy promises, retention/deletion, account security and external-client disclosures appropriate and consistent with operations?
5. What accessibility contact, complaint handling, and jurisdiction-specific disclosures are needed?

Record the owner's review and remaining limitations in `PRE_LAUNCH_CHECKLIST.md`; if counsel is later engaged, record their actual reviewed version and findings separately. Changing a terms document or operator details changes its fingerprint and requires fresh acceptance. No material is sent externally without the owner's explicit authorization.
