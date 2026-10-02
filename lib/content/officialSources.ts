/** Navigation references, not additional data feeds. */
export const OFFICIAL_SOURCES = [
  { name: "U.S. Treasury", url: "https://home.treasury.gov/policy-issues/tax-policy/data-transparency/qualified-opportunity-zones", description: "Opportunity Zone data, methodologies, and guidance", domain: "home.treasury.gov" },
  { name: "Internal Revenue Service", url: "https://www.irs.gov/credits-deductions/businesses/opportunity-zones", description: "Federal tax rules, regulations, and notices", domain: "irs.gov" },
  { name: "CDFI Fund", url: "https://www.cdfifund.gov/opportunity-zones", description: "Nomination and designation resources", domain: "cdfifund.gov" },
] as const;

export const INDEPENDENCE_NOTICE = "This is an independent informational research site. We do not represent and are not affiliated with, sponsored by, or endorsed by the U.S. Department of the Treasury, the IRS, or the CDFI Fund.";
