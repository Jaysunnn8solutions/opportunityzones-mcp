# Entry experience and legal draft

Prepared September 27, 2026. Local implementation; not a legal opinion or an assurance of enforceability.

## Naming and entry structure

Candidates considered:

| Name | Fit |
| --- | --- |
| Research Hub | Recommended navigation label: covers location lookup, area discovery, comparisons, and rules. |
| Opportunity Zone Research | Clear, professional product name; longer as a navigation label. |
| Start Your Research | Clear invitation; less useful as the name of a page people return to. |
| Location Research | Precise for address lookup, but understates the broader entry page. |

The root route is the Research Hub. Its three paths are location research, finding areas by criteria, and understanding rules. The persistent top notice links to `/legal`. Existing deep links remain reachable after acknowledgment.

The hub offers Location research and Map search tabs. Map search can open a nationwide or state view. Find areas starts in Map view, including when a previous visit used List. Understand the rules provides research navigation links instead of an address search or selected-place panel; report links describe it as a general rules resource.

## Visual identity and official references

Reviewed Treasury's [Qualified Opportunity Zones page](https://home.treasury.gov/policy-issues/tax-policy/data-transparency/qualified-opportunity-zones) on September 27, 2026. The product uses blue/navy colors, restrained serif display headings, and generous spacing, with its own map icon, teal accent, cards, navigation, and dark theme. It does not reproduce Treasury's seal, official-government banner, or page layout. A persistent independent-site notice and official Treasury link appear before and after entry; the hub and rules page also link to Treasury, IRS, and CDFI Fund resources. The footer, splash, and legal text expressly state the lack of representation, affiliation, sponsorship, and endorsement. These links are navigation references, not new data feeds.

## Published examples reviewed

These references informed the coverage and interaction design. The draft is original wording for this application, not a copied policy. Public availability is not evidence that a provision has been upheld or will protect this operator.

- [OpportunityZones.com disclosure](https://opportunityzones.com/about/) and [website terms](https://opportunityzones.com/terms/): industry-specific examples separating published information from endorsements and personal advice. Their advertising and sponsorship business model is different; those disclosures were not imported.
- [OpportunityZone.com website terms](https://www.opportunityzone.com/legal/website/): example coverage for informational content, warranty disclaimers, and third-party claims. Its forums, professional listings, accounts, restrictions on commercial reuse, and dispute provisions do not describe this service and were not copied.
- [Reventure App Terms of Use, modified February 7, 2025](https://map.reventure.app/reventure-app-terms-and-conditions.pdf): example treatment of market-data reliability, external sources, and historical information. Paid accounts and subscriptions do not apply here.
- [ATTOM Developer Platform terms](https://api.developer.attomdata.com/legal): example of explicit acceptance and clearly identified contractual parties, alongside warranty and liability provisions. This app does not use ATTOM data. Its monetary cap and commercial licensing terms were not adopted.
- [Census API Terms of Service](https://www.census.gov/data/developers/about/terms-of-service.html): accuracy and availability limitations, source attribution, nonendorsement, and restrictions on identifying survey respondents. Government-agency terms are not a private operator's liability shield.
- [Berman v. Freedom Financial Network, Ninth Circuit, April 5, 2022](https://cdn.ca9.uscourts.gov/datastore/opinions/2022/04/05/20-16900.pdf): the decision discusses conspicuous notice and an unambiguous indication of assent in its specific factual and legal context. The entry design uses readable linked terms, an unchecked acknowledgment, and an explicit “I agree and enter” action. This does not establish enforceability in every jurisdiction.

## Implemented boundaries

- Full disclaimer, terms, and privacy notice share one content module, `lib/content/siteTerms.ts`. The entry disclosure and `/legal` render the same text.
- The entry, official-source sections, footer, and full disclaimer explain use at the user's own risk, authoritative-source limitations, automated-processing errors, and mistakes in generative-AI interpretations. Mandatory rights and nonexcludable liability remain preserved. This does not imply that the app makes runtime model calls.
- The research UI does not mount before acknowledgment. Reading `/legal` is always allowed. Declining keeps research closed. Acceptance is not inferred from scrolling or browsing the legal page.
- Only the accepted version is kept in tab session storage. No identity, acceptance timestamp, IP address, or consent record is collected by this feature. Storage failures fall back to the current React session; a new terms version requires renewed acknowledgment.
- This is a browser entry gate, not authentication or an API firewall. Public API/MCP endpoints retain their existing informational disclaimers; this website interaction does not establish that API consumers accepted a contract.
- There is no server-side evidence connecting an identified person to acceptance. A browser session marker is not a durable, auditable consent record. Any proposal to collect such evidence requires a separate privacy and architecture decision consistent with the project's no-personal-storage rule.
- Privacy text distinguishes app behavior from hosting, network, map, geocoding, and external AI-provider practices. It makes no blanket promise that third-party logs do not exist.
- Hosted use provisions preserve the repository's MIT license and the rights associated with public-domain and openly licensed data.

## Required before a public release

The UI marks this as a preview draft while operator details are missing. Obtain the legal operator name, business location, and public legal/contact email from the owner; configure `LEGAL_OPERATOR` in `lib/content/siteTerms.ts`.

A qualified attorney should review the draft for the actual operator, service, jurisdictions, and audience. In particular: the identity of protected parties; warranty and liability language; the scope of indemnification/reimbursement; mandatory consumer rights; governing law, venue, and dispute procedures; privacy disclosures; and whether a different acceptance record is needed. No governing-law clause, arbitration clause, class-action waiver, or arbitrary monetary liability cap has been invented for this draft.

Update `TERMS_VERSION` and `TERMS_DATE` when the accepted text changes. Preserve prior published versions and deployment records before launching revisions. Do not represent this draft as attorney-approved or as protection from all claims.
