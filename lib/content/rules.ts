/**
 * The Opportunity Zone rules this site states, each with the exact words of an
 * authoritative source behind it.
 *
 * Every citation names a source in legal/sources.json (the statute from the
 * Office of the Law Revision Counsel, Public Law 119-21 from govinfo, the
 * regulations from eCFR, and IRS pages and notices), a pinpoint, and a quote
 * copied from that source. The saved text of each source is in legal/text/, and
 * rules.test.ts fails if a quote is not found there word for word. Refresh the
 * texts with the "Fetch legal sources" workflow.
 *
 * The plain-language `text` restates only what its quotes say. Where the rules
 * turn on facts (what a gain is, whether a business qualifies), the text says
 * so rather than deciding. General information, not tax or legal advice.
 */

import SOURCES from "@/legal/sources.json";

export type LegalSourceId =
  | "usc-1400Z-2"
  | "usc-1400Z-1"
  | "plaw-119-21"
  | "cfr-1.1400Z2a-1"
  | "cfr-1.1400Z2c-1"
  | "cfr-1.1400Z2d-1"
  | "cfr-1.1400Z2d-2"
  | "cfr-1.1400Z2f-1"
  | "irs-oz-faq"
  | "irs-oz"
  | "irs-i8996"
  | "irs-invest-qof"
  | "irs-certify-qof"
  | "irs-n-2026-40"
  | "irs-rp-2026-14"
  | "irs-n-2026-55"
  | "irs-n-2025-50"
  | "cdfi-oz"
  | "usc-42"
  | "usc-45D"
  | "usc-1221";

export interface LegalSource {
  id: LegalSourceId;
  title: string;
  publisher: string;
  url: string;
}

export interface Citation {
  source: LegalSourceId;
  /** Where in the source, e.g. "§ 1400Z-2(a)(1)(A)" or "Q&A 23". */
  pin: string;
  /** Copied word for word from the source (whitespace aside). */
  quote: string;
  /** Said when the source is older than a later change, so it is read in context. */
  note?: string;
}

export interface Rule {
  id: string;
  /** Short heading. */
  title: string;
  /** The rule in plain language, restating only what the citations say. */
  text: string;
  cites: Citation[];
}

const IRS_FAQ_NOTE = "The IRS FAQ describes the rules before the 2025 amendments.";

const RULE_DEFS = {
  window180: {
    id: "window180",
    title: "180 days to invest",
    text: "The gain has to be invested in a Qualified Opportunity Fund within 180 days. The period generally starts on the day the gain would otherwise be taxed, which for a sale is the date of the sale.",
    cites: [
      { source: "usc-1400Z-2", pin: "§ 1400Z-2(a)(1)(A)", quote: "invested by the taxpayer in a qualified opportunity fund during the 180-day period beginning on the date of such sale or exchange" },
      {
        source: "cfr-1.1400Z2a-1",
        pin: "§ 1.1400Z2(a)-1(b)(7)(i)",
        quote: "begins on the day on which the gain would be recognized for Federal income tax purposes if the eligible taxpayer did not elect",
      },
    ],
  },
  gainOnly: {
    id: "gainOnly",
    title: "Only the gain",
    text: "Only the amount of the gain needs to be invested, and only that amount gets the benefits. Other money put into the same fund is treated as a separate investment without them.",
    cites: [
      {
        source: "irs-oz-faq",
        pin: "Q&A 13",
        quote: "If you only invest part of your eligible gain in a QOF, you can elect to defer tax on only the part of the eligible gain that was invested in this way.",
      },
      { source: "usc-1400Z-2", pin: "§ 1400Z-2(e)(1)", quote: "such investment shall be treated as 2 separate investments" },
      { source: "usc-1400Z-2", pin: "§ 1400Z-2(e)(1)(B)", quote: "subsections (a), (b), and (c) shall only apply to the investment described in subparagraph (A)(i)." },
    ],
  },
  eligibleGains: {
    id: "eligibleGains",
    title: "Which gains",
    text: "Eligible gains are capital gains and qualified section 1231 gains, from a sale to an unrelated person. Ordinary income is not eligible. Property held for sale to customers, such as a dealer's inventory, is not a capital asset, so profit on selling it is not a capital gain.",
    cites: [
      { source: "cfr-1.1400Z2a-1", pin: "§ 1.1400Z2(a)-1(b)(11)(i)(A)", quote: "Is treated as a capital gain for Federal income tax purposes or is a qualified 1231 gain" },
      { source: "usc-1400Z-2", pin: "§ 1400Z-2(a)(1)", quote: "In the case of gain from the sale to, or exchange with, an unrelated person of any property held by the taxpayer" },
      { source: "irs-oz-faq", pin: "Q&A 29", quote: "Ordinary gain is not eligible for deferral." },
      {
        source: "usc-1221",
        pin: "§ 1221(a)(1)",
        quote: "property held by the taxpayer primarily for sale to customers in the ordinary course of his trade or business",
      },
    ],
  },
  passThroughTiming: {
    id: "passThroughTiming",
    title: "Gains from a partnership or S corporation",
    text: "Partners, S corporation shareholders and beneficiaries of estates and non-grantor trusts can choose when their 180 days start: the last day of the entity's tax year, the day the entity's own 180 days start, or the due date of the entity's tax return, without extensions.",
    cites: [
      {
        source: "irs-oz-faq",
        pin: "Q&A 23",
        quote:
          "Partners in a partnership, shareholders of an S corporation, and beneficiaries of estates and non-grantor trusts have the option to start the 180-day investment period on any of the following dates:",
      },
      {
        source: "cfr-1.1400Z2a-1",
        pin: "§ 1.1400Z2(a)-1(c)(8)(iii)",
        quote: "generally begins on the last day of the partnership taxable year in which the partner's distributive share of the partnership's eligible gain is taken into account",
      },
      { source: "cfr-1.1400Z2a-1", pin: "§ 1.1400Z2(a)-1(c)(8)(iii)(B)(2)", quote: "The 180-day period beginning on the due date for the partnership's tax return, without extensions" },
    ],
  },
  installmentTiming: {
    id: "installmentTiming",
    title: "Installment sales",
    text: "For a gain reported on the installment method, the 180 days can start when each payment is received, or on the last day of the tax year in which the gain would be recognized.",
    cites: [
      {
        source: "cfr-1.1400Z2a-1",
        pin: "§ 1.1400Z2(a)-1(b)(11)(viii)(B)",
        quote:
          "an eligible taxpayer may treat the date the payment on the installment sale is received or the last day of the taxable year in which the eligible taxpayer would have recognized the gain under the installment method as the beginning of the 180-day period",
      },
    ],
  },
  section1231Timing: {
    id: "section1231Timing",
    title: "Section 1231 gains",
    text: "For a section 1231 gain (from business property such as a rental building), the IRS FAQ says the 180 days begin on the day the gain was realized.",
    cites: [
      { source: "irs-oz-faq", pin: "Q&A 15", quote: "if the amount of the gain was invested in a QOF during the 180-day period that begins on the day the 1231 gain was realized" },
    ],
  },
  gain2026Invested2027: {
    id: "gain2026Invested2027",
    title: "A 2026 gain invested in 2027",
    text: "A gain from a sale in 2026 can be invested on or after January 1, 2027, under the new rules, as long as it is invested within its 180 days. What decides which rules apply is when the money is invested, not when the sale happened.",
    cites: [
      {
        source: "irs-n-2026-40",
        pin: "Notice 2026-40, § 4.02(2)",
        quote:
          "In the case of a taxpayer with eligible gain realized on, before, or after December 31, 2026, who timely invests a corresponding amount in a QOF on or after January 1, 2027, the taxpayer may elect to defer the recognition of that gain",
      },
      {
        source: "usc-1400Z-2",
        pin: "P.L. 119-21 § 70421(c)(5)(A), effective date note",
        quote: "the amendments made by this subsection [amending this section] shall apply to amounts invested in qualified opportunity funds after December 31, 2026.",
      },
    ],
  },
  investedBy2026: {
    id: "investedBy2026",
    title: "Invested on or before December 31, 2026",
    text: "Gain invested under the original rules, on or before December 31, 2026, is taxed no later than the tax year that includes December 31, 2026. The ten-year benefit can still apply to that investment.",
    cites: [
      { source: "usc-1400Z-2", pin: "§ 1400Z-2(b)(1)", quote: "Gain to which subsection (a)(1)(B) applies shall be included in income in the taxable year which includes the earlier of-" },
      { source: "usc-1400Z-2", pin: "§ 1400Z-2(b)(1)(B)", quote: "(B) December 31, 2026." },
      {
        source: "irs-n-2026-40",
        pin: "Notice 2026-40, § 4.01(3)",
        quote: "the taxpayer remains potentially eligible to make an election under § 1400Z-2(c) on the later sale or exchange of that qualifying investment",
      },
    ],
  },
  deferralFiveYears: {
    id: "deferralFiveYears",
    title: "Deferral up to five years",
    text: "For amounts invested after December 31, 2026, the deferred gain is taxed in the year the investment is sold or exchanged, or the year that includes the date five years after the investment was made, whichever comes first.",
    cites: [
      {
        source: "usc-1400Z-2",
        pin: "§ 1400Z-2(b)(1), as amended by P.L. 119-21",
        quote: "the date which is 5 years after the date the investment in the qualified opportunity fund was made.",
      },
    ],
  },
  stepUp: {
    id: "stepUp",
    title: "10% or 30% of the gain after five years",
    text: "For amounts invested after December 31, 2026, holding the investment at least five years raises its basis by 10% of the deferred gain, or 30% for an investment in a qualified rural opportunity fund, so that share of the gain is not taxed.",
    cites: [
      {
        source: "usc-1400Z-2",
        pin: "§ 1400Z-2(b)(2)(B)(iii), as amended by P.L. 119-21",
        quote:
          "In the case of any investment held for at least 5 years, the basis of such investment shall be increased by an amount equal to 10 percent (30 percent in the case of any investment in a qualified rural opportunity fund) of the amount of gain deferred",
      },
    ],
  },
  tenYears: {
    id: "tenYears",
    title: "Tax-free growth after ten years",
    text: "If the investment is held at least ten years, the investor can elect to set its basis to its fair market value when it is sold, so the growth in value is not taxed. For amounts invested after 2026, the value is fixed at 30 years if the investment is held longer.",
    cites: [
      { source: "usc-1400Z-2", pin: "§ 1400Z-2(c)", quote: "In the case of any investment held by the taxpayer for at least 10 years" },
      {
        source: "usc-1400Z-2",
        pin: "§ 1400Z-2(c)(B), as amended by P.L. 119-21",
        quote: "in any other case, the fair market value of such investment on the date that is 30 years after the date of the investment.",
      },
      {
        source: "irs-oz-faq",
        pin: "Q&A 5",
        quote: "As a result of this basis adjustment, the appreciation in the QOF investment is never taxed.",
        note: IRS_FAQ_NOTE,
      },
    ],
  },
  fund: {
    id: "fund",
    title: "What a fund is",
    text: "A Qualified Opportunity Fund is a corporation or partnership for tax purposes (an LLC can be one if it is taxed as either) that holds at least 90% of its assets in opportunity zone property, measured twice a year. It self-certifies by filing Form 8996 with its return each year.",
    cites: [
      {
        source: "usc-1400Z-2",
        pin: "§ 1400Z-2(d)(1)",
        quote: "any investment vehicle which is organized as a corporation or a partnership for the purpose of investing in qualified opportunity zone property",
      },
      { source: "usc-1400Z-2", pin: "§ 1400Z-2(d)(1)", quote: "that holds at least 90 percent of its assets in qualified opportunity zone property" },
      { source: "irs-oz-faq", pin: "Q&A 38", quote: "elects to self-certify by annually filing Form 8996 with its federal income tax return." },
      { source: "irs-oz-faq", pin: "Q&A 39", quote: "An LLC that chooses to be treated either as a partnership or corporation for federal income tax purposes" },
    ],
  },
  fundPenalty: {
    id: "fundPenalty",
    title: "Penalty for missing the 90% test",
    text: "A fund that fails the 90% test pays a monthly penalty unless the failure is due to reasonable cause.",
    cites: [
      { source: "usc-1400Z-2", pin: "§ 1400Z-2(f)(1)", quote: "the qualified opportunity fund shall pay a penalty for each month it fails to meet the requirement" },
      { source: "usc-1400Z-2", pin: "§ 1400Z-2(f)(3)", quote: "No penalty shall be imposed under this subsection with respect to any failure if it is shown that such failure is due to reasonable cause." },
    ],
  },
  fundReinvest: {
    id: "fundReinvest",
    title: "Reinvesting sale proceeds",
    text: "When a fund gets proceeds from selling zone property (or a return of capital), the proceeds count as zone property for its 90% test if they are reinvested in zone property within 12 months and held in cash, cash equivalents or debt of 18 months or less until then.",
    cites: [
      {
        source: "cfr-1.1400Z2f-1",
        pin: "§ 1.1400Z2(f)-1(b)(1)",
        quote: "if the QOF reinvests some or all of the proceeds in qualified opportunity zone property by the last day of the 12-month period beginning on the date of the distribution, sale, or disposition",
      },
      { source: "cfr-1.1400Z2f-1", pin: "§ 1.1400Z2(f)-1(b)(1)", quote: "the proceeds are continuously held in cash, cash equivalents, or debt instruments with a term of 18 months or less." },
    ],
  },
  fundReporting: {
    id: "fundReporting",
    title: "Fund reporting added in 2025",
    text: "The 2025 law requires every Qualified Opportunity Fund to file an annual information return, for taxable years beginning after July 4, 2025.",
    cites: [
      { source: "plaw-119-21", pin: "P.L. 119-21 § 70421(d), new 26 U.S.C. § 6039K(a)", quote: "Every qualified opportunity fund shall file an annual return" },
      { source: "plaw-119-21", pin: "P.L. 119-21 § 70421(d)(5)", quote: "The amendments made by this subsection shall apply to taxable years beginning after the date of the enactment of this Act." },
    ],
  },
  equityNotLoan: {
    id: "equityNotLoan",
    title: "Funds invest by equity",
    text: "A fund's zone property is stock, a partnership interest or business property. It buys stock or a partnership interest in a zone business solely for cash, so a loan to a business is not zone property.",
    cites: [
      { source: "usc-1400Z-2", pin: "§ 1400Z-2(d)(2)(A)", quote: "(i) qualified opportunity zone stock, (ii) qualified opportunity zone partnership interest, or (iii) qualified opportunity zone business property." },
      { source: "usc-1400Z-2", pin: "§ 1400Z-2(d)(2)(C)(i)", quote: "from the partnership solely in exchange for cash" },
    ],
  },
  businessUse: {
    id: "businessUse",
    title: "Used in a business",
    text: "Property a fund owns must be used in its trade or business. For a business the fund invests in, owning and operating real property, including leasing it, counts as an active business, but merely entering into a triple-net lease does not.",
    cites: [
      { source: "usc-1400Z-2", pin: "§ 1400Z-2(d)(2)(D)(i)", quote: "tangible property used in a trade or business of the qualified opportunity fund" },
      { source: "cfr-1.1400Z2d-1", pin: "§ 1.1400Z2(d)-1(d)(3)(iii)(A)", quote: "the ownership and operation (including leasing) of real property is the active conduct of a trade or business." },
      {
        source: "cfr-1.1400Z2d-1",
        pin: "§ 1.1400Z2(d)-1(d)(3)(iii)(B)",
        quote: "Merely entering into a triple-net-lease with respect to real property owned by a taxpayer does not constitute the active conduct of a trade or business by such taxpayer.",
      },
    ],
  },
  purchaseUnrelated: {
    id: "purchaseUnrelated",
    title: "Bought, from an unrelated seller",
    text: "The fund has to buy the property from a seller that is not related to it. Related is defined by the tests in sections 267(b) and 707(b)(1), with 20 percent in place of 50 percent. Property contributed to a fund in exchange for an interest was not bought by the fund.",
    cites: [
      { source: "cfr-1.1400Z2d-2", pin: "§ 1.1400Z2(d)-2(b)(1)(i)", quote: "by purchase as defined by section 179(d)(2) from a person that is not a related person" },
      {
        source: "usc-1400Z-2",
        pin: "§ 1400Z-2(e)(2)",
        quote: 'persons are related to each other if such persons are described in section 267(b) or 707(b)(1), determined by substituting "20 percent" for "50 percent" each place it occurs in such sections.',
      },
      { source: "irs-oz-faq", pin: "Q&A 44", quote: "is not QOZ business property because it was not purchased by the QOF." },
    ],
  },
  boughtAfterStart: {
    id: "boughtAfterStart",
    title: "Bought after the zone starts",
    text: "Property bought after December 31, 2026, has to be bought after the start date of a zone designated under the 2025 law, which for the 2027 zones is January 1, 2027. Zones designated in 2018 have no such start date, so new purchases there qualify only under narrow transition rules (a written working-capital plan adopted by December 31, 2026, or ordinary-course replacements).",
    cites: [
      {
        source: "irs-n-2026-40",
        pin: "Notice 2026-40, § 5.01(1)",
        quote: "such property must be purchased, as defined in § 179(d)(2), after the applicable start date, as defined in § 1400Z-1(e)(2), with respect to the QOZ",
      },
      {
        source: "irs-n-2026-40",
        pin: "Notice 2026-40, § 5.01(1)",
        quote: "A previously designated QOZ does not have an “applicable start date” under § 1400Z-1(e)(2) because its designation took place before the date of enactment of OBBBA.",
      },
      {
        source: "irs-n-2026-40",
        pin: "Notice 2026-40, § 5.01(1)",
        quote: "(i) the property is acquired for use in a QOZ that is designated after July 4, 2025, or (ii) one of the exceptions in section 5.01(2) and (3) of this notice applies.",
      },
    ],
  },
  designatedNotEligible: {
    id: "designatedNotEligible",
    title: "Eligible is not designated",
    text: "A tract is an Opportunity Zone only once its state's governor nominates it and the Treasury certifies and designates it. Being eligible is not enough.",
    cites: [
      { source: "usc-1400Z-1", pin: "§ 1400Z-1(a)", quote: "a population census tract that is a low-income community that is designated as a qualified opportunity zone." },
      { source: "usc-1400Z-1", pin: "§ 1400Z-1(b)(1)(B)", quote: "the Secretary certifies such nomination and designates such tract as a qualified opportunity zone" },
    ],
  },
  useInZone: {
    id: "useInZone",
    title: "Used in the zone",
    text: "During at least 90% of the time the fund holds the property, at least 70% of its use has to be in an Opportunity Zone.",
    cites: [
      {
        source: "usc-1400Z-2",
        pin: "§ 1400Z-2(d)(2)(D)(i)(III)",
        quote: "during substantially all of the qualified opportunity fund's holding period for such property, substantially all of the use of such property was in a qualified opportunity zone.",
      },
      { source: "irs-oz-faq", pin: "Q&A 52", quote: "The first of these two “substantially all” references means at least 90 percent, and the second means at least 70 percent." },
    ],
  },
  originalUse: {
    id: "originalUse",
    title: "New property: original use",
    text: "Property no one has yet placed in service in the zone, such as a new building bought before anyone uses it, meets the original-use test. So can a building vacant for at least one calendar year before the zone was listed and still vacant when bought, or vacant for three calendar years after the zone was listed.",
    cites: [
      {
        source: "cfr-1.1400Z2d-2",
        pin: "§ 1.1400Z2(d)-2(b)(3)(i)(A)",
        quote: "the original use of tangible property in a qualified opportunity zone commences on the date any person first places the property in service in the qualified opportunity zone",
      },
      {
        source: "cfr-1.1400Z2d-2",
        pin: "§ 1.1400Z2(d)-2(b)(3)(i)(B)",
        quote:
          "has been vacant for an uninterrupted period of at least one calendar year beginning on a date prior to the date on which the qualified opportunity zone in which the property is located is listed as a designated qualified opportunity zone",
      },
      { source: "cfr-1.1400Z2d-2", pin: "§ 1.1400Z2(d)-2(b)(3)(i)(B)", quote: "or if the property has been vacant for an uninterrupted three calendar year period" },
    ],
  },
  substantialImprovement: {
    id: "substantialImprovement",
    title: "Existing buildings: substantial improvement",
    text: "An existing building that is not original use has to be substantially improved: in any 30 months after it is bought, the fund must add more to the building's basis than the building's basis at the start (roughly, spend more than it paid for the building). The land under it is measured separately and does not need improving.",
    cites: [
      {
        source: "usc-1400Z-2",
        pin: "§ 1400Z-2(d)(2)(D)(ii)",
        quote:
          "during any 30-month period beginning after the date of acquisition of such property, additions to basis with respect to such property in the hands of the qualified opportunity fund exceed an amount equal to the adjusted basis of such property",
      },
      {
        source: "cfr-1.1400Z2d-2",
        pin: "§ 1.1400Z2(d)-2(b)(4)(iv)(A)",
        quote: "a substantial improvement to the building is measured by the eligible entity's additions to the basis of the building",
      },
      {
        source: "cfr-1.1400Z2d-2",
        pin: "§ 1.1400Z2(d)-2(b)(4)(iii)(D)(1)(ii), Example 1",
        quote: "Because the amount of basis allocated to the hotel was $4 million, QOF A must expend $4 million to improve the hotel",
      },
    ],
  },
  ruralImprovement: {
    id: "ruralImprovement",
    title: "Rural zones: a 50% improvement bar",
    text: "In a zone made up entirely of a rural area, the improvement bar is 50% of the building's basis instead of 100%. The 2025 law says this change took effect on July 4, 2025, and the IRS applies it to property in rural 2018 zones for determinations made from that date.",
    cites: [
      {
        source: "usc-1400Z-2",
        pin: "§ 1400Z-2(d)(2)(D)(ii)",
        quote: "(50 percent of such adjusted basis in the case of property in a qualified opportunity zone comprised entirely of a rural area",
      },
      {
        source: "usc-1400Z-2",
        pin: "P.L. 119-21 § 70421(c)(5)(C), effective date note",
        quote: "The amendment made by paragraph (4)(C) [amending this section] shall take effect on the date of the enactment of this Act [July 4, 2025].",
      },
      {
        source: "irs-n-2025-50",
        pin: "Notice 2025-50, § 2.03",
        quote: "The OBBBA amendment reduced the substantial improvement threshold for required additions to the basis for such property from 100 percent to 50 percent.",
      },
      {
        source: "irs-n-2025-50",
        pin: "Notice 2025-50, § 5",
        quote: "For any determination made on or after July 4, 2025, as to whether any tangible property located in a 2018 QOZ comprised entirely of a rural area meets the substantial improvement test",
      },
    ],
  },
  land: {
    id: "land",
    title: "Land",
    text: "Unimproved land bought in a zone does not have to be substantially improved, unless it is bought expecting to improve it by no more than an insubstantial amount within 30 months; then it does not qualify.",
    cites: [
      {
        source: "cfr-1.1400Z2d-2",
        pin: "§ 1.1400Z2(d)-2(b)(4)(iv)(B)",
        quote: "Unimproved land that is within a qualified opportunity zone and acquired by purchase in accordance with section 1400Z-2(d)(2)(D)(i)(I) is not required to be substantially improved",
      },
      {
        source: "cfr-1.1400Z2d-2",
        pin: "§ 1.1400Z2(d)-2(b)(4)(iv)(C)",
        quote: "purchases the land with an expectation or an intention to not improve the land by more than an insubstantial amount within 30 months after the date of purchase",
      },
    ],
  },
  zoneBusiness: {
    id: "zoneBusiness",
    title: "Opportunity zone business tests",
    text: "A business a fund invests in must have at least 70% of its tangible property qualify as zone business property, earn at least 50% of its gross income from active business in the zone, use at least 40% of its intangible property there, and keep nonqualified financial property (beyond reasonable working capital) under 5%.",
    cites: [
      {
        source: "cfr-1.1400Z2d-1",
        pin: "§ 1.1400Z2(d)-1(d)(2)(i)",
        quote: "at least 70 percent of the tangible property owned or leased by the trade or business is qualified opportunity zone business property",
      },
      { source: "irs-oz-faq", pin: "Q&A 56", quote: "Each taxable year, a QOZ business must earn at least 50 percent of its gross income from business activities within a QOZ." },
      { source: "cfr-1.1400Z2d-1", pin: "§ 1.1400Z2(d)-1(d)(3)(ii)(A)", quote: "the term substantial portion means at least 40 percent." },
      {
        source: "irs-n-2026-40",
        pin: "Notice 2026-40, § 2.03(4)(a)",
        quote: "less than five percent of the average of the aggregate unadjusted bases of the entity’s property must be attributable to nonqualified financial property.",
      },
    ],
  },
  excludedBusinesses: {
    id: "excludedBusinesses",
    title: "Excluded businesses",
    text: "These cannot be opportunity zone businesses, nor can businesses leasing more than a small amount of property to them: golf courses, country clubs, massage parlors, hot tub facilities, suntan facilities, racetracks or other gambling facilities, and stores whose principal business is selling alcoholic beverages for consumption off premises.",
    cites: [
      {
        source: "cfr-1.1400Z2d-1",
        pin: "§ 1.1400Z2(d)-1(d)(4)(i)",
        quote:
          "the following trades or businesses, and businesses leasing more than a de minimis amount of property to the following trades or businesses, cannot qualify as a qualified opportunity zone business:",
      },
      { source: "cfr-1.1400Z2d-1", pin: "§ 1.1400Z2(d)-1(d)(4)(i)(A)-(G)", quote: "( A ) Any private or commercial golf course;" },
      {
        source: "cfr-1.1400Z2d-1",
        pin: "§ 1.1400Z2(d)-1(d)(4)(i)(G)",
        quote: "Any store the principal business of which is the sale of alcoholic beverages for consumption off premises.",
      },
    ],
  },
  workingCapital: {
    id: "workingCapital",
    title: "Working capital",
    text: "A business a fund invests in can hold cash for development if it is designated in writing for the business in the zone, with a written schedule to spend it within 31 months, and is used consistently with that plan.",
    cites: [
      {
        source: "irs-n-2026-40",
        pin: "Notice 2026-40, § 5.01(2)(a)",
        quote: "the working capital assets must be designated in writing for the development of a trade or business in a QOZ",
      },
      { source: "irs-n-2026-40", pin: "Notice 2026-40, § 5.01(2)(a)", quote: "the working capital assets must be spent within 31 months of the receipt by the business of the assets." },
    ],
  },
  eligibility: {
    id: "eligibility",
    title: "Which tracts are eligible",
    text: "For the zones designated under the 2025 law, a tract is eligible (a low-income community) if its median family income is at most 70% of its state's (outside metro areas) or its metro area's, or if its poverty rate is at least 20% and its median family income is at most 125% of that benchmark.",
    cites: [
      { source: "usc-1400Z-1", pin: "§ 1400Z-1(c)(1)(A)(i)", quote: "does not exceed 70 percent of the statewide median family income" },
      { source: "usc-1400Z-1", pin: "§ 1400Z-1(c)(1)(A)(ii)", quote: "does not exceed 70 percent of the metropolitan area median family income" },
      { source: "usc-1400Z-1", pin: "§ 1400Z-1(c)(1)(B)(i)", quote: "has a poverty rate of at least 20 percent" },
      { source: "usc-1400Z-1", pin: "§ 1400Z-1(c)(1)(B)(ii)(II)", quote: "does not exceed 125 percent of the metropolitan area median family income." },
    ],
  },
  noContiguous: {
    id: "noContiguous",
    title: "No more neighbouring tracts",
    text: "The 2025 law removed the rule that let states designate some tracts that were not low-income communities because they bordered one.",
    cites: [
      {
        source: "usc-1400Z-1",
        pin: "Amendment notes, subsec. (f)",
        quote: "struck out former subsec. (e) which related to designation of tracts contiguous with low-income communities.",
      },
    ],
  },
  stateCap: {
    id: "stateCap",
    title: "How many each state can designate",
    text: "A state may have at most 25% of its low-income communities designated in any period, or 25 tracts if it has fewer than 100.",
    cites: [
      { source: "usc-1400Z-1", pin: "§ 1400Z-1(d)(1)", quote: "may not exceed 25 percent of the number of low-income communities in the State." },
      { source: "usc-1400Z-1", pin: "§ 1400Z-1(d)(2)", quote: "If the number of low-income communities in a State is less than 100, then a total of 25 of such tracts may be designated" },
    ],
  },
  zonePeriod: {
    id: "zonePeriod",
    title: "Ten-year zones, new rounds every ten years",
    text: "Zones certified in 2026 run from January 1, 2027, to December 31, 2036. Nominations restart every ten years, from July 1, 2026.",
    cites: [
      {
        source: "irs-n-2026-40",
        pin: "Notice 2026-40, § 3.01(2)",
        quote: "for every LIC certified and designated by the Secretary as a QOZ under § 1400Z-1(b) during 2026, the QOZ designation period begins on January 1, 2027, and ends on December 31, 2036.",
      },
      { source: "usc-1400Z-1", pin: "§ 1400Z-1(c)(2)(C)", quote: "each July 1 of the year that is 10 years after the preceding decennial determination date" },
    ],
  },
  zones2018End: {
    id: "zones2018End",
    title: "When the 2018 zones end",
    text: "The zones designated in 2018 remain designated through December 31, 2028 (December 31, 2027, for the Puerto Rico tracts deemed designated in 2017).",
    cites: [
      { source: "irs-n-2026-40", pin: "Notice 2026-40, § 2.04(2)(c)", quote: "(ii) December 31, 2028, for all other QOZs." },
      {
        source: "irs-n-2026-40",
        pin: "Notice 2026-40, § 2.04(2)(c)",
        quote: "(i) December 31, 2027, for QOZs deemed certified and designated in Puerto Rico under prior § 1400Z-1(b)(3)",
      },
    ],
  },
  nominationTimeline: {
    id: "nominationTimeline",
    title: "The 2026 nomination timeline",
    text: "Governors nominate in the 90 days from July 1, 2026 (to October 28, 2026, with an extension). Treasury then has 30 days to certify, to November 27, 2026, or December 28, 2026, at the latest with an extension.",
    cites: [
      {
        source: "irs-rp-2026-14",
        pin: "Rev. Proc. 2026-14",
        quote: "the term “determination period” means the 90-day period beginning on the decennial determination date (including any extension), the first decennial determination date being July 1, 2026.",
      },
      { source: "irs-rp-2026-14", pin: "Rev. Proc. 2026-14", quote: "which would conclude, at the latest, on October 28, 2026." },
      { source: "irs-rp-2026-14", pin: "Rev. Proc. 2026-14", quote: "would conclude on November 27, 2026, at the latest." },
      { source: "irs-rp-2026-14", pin: "Rev. Proc. 2026-14", quote: "which would extend it to December 28, 2026, at the latest." },
    ],
  },
  ruralFund: {
    id: "ruralFund",
    title: "Qualified rural opportunity fund",
    text: "A qualified rural opportunity fund holds at least 90% of its assets in zone property used in, or in businesses operating in, zones made up entirely of rural areas. A rural area is anywhere other than a city or town of more than 50,000 people and the urbanized area next to it.",
    cites: [
      {
        source: "usc-1400Z-2",
        pin: "§ 1400Z-2(b)(2)(C)(i), as amended by P.L. 119-21",
        quote: "means a qualified opportunity fund that holds at least 90 percent of its assets in qualified opportunity zone property which-",
      },
      { source: "usc-1400Z-2", pin: "§ 1400Z-2(b)(2)(C)(ii), as amended by P.L. 119-21", quote: "a city or town that has a population of greater than 50,000 inhabitants" },
      { source: "usc-1400Z-2", pin: "§ 1400Z-2(b)(2)(C)(ii), as amended by P.L. 119-21", quote: "any urbanized area contiguous and adjacent to a city or town described in subclause (I)." },
    ],
  },
  otherProgramsHousing: {
    id: "otherProgramsHousing",
    title: "HUD Qualified Census Tracts and Difficult Development Areas",
    text: "These are a separate program. For the low-income housing credit (LIHTC), a building in a HUD Qualified Census Tract or Difficult Development Area can have its eligible basis (for a new building) or rehabilitation expenditures (for an existing one) counted at 130%.",
    cites: [
      {
        source: "usc-42",
        pin: "§ 42(d)(5)(B)(i)",
        quote: "In the case of any building located in a qualified census tract or difficult development area which is designated for purposes of this subparagraph-",
      },
      { source: "usc-42", pin: "§ 42(d)(5)(B)(i)(I)", quote: "in the case of a new building, the eligible basis of such building shall be 130 percent of such basis" },
      { source: "usc-42", pin: "§ 42(d)(5)(B)(i)(II)", quote: "in the case of an existing building, the rehabilitation expenditures taken into account under subsection (e) shall be 130 percent of such expenditures" },
    ],
  },
  otherProgramsNmtc: {
    id: "otherProgramsNmtc",
    title: "New Markets Tax Credit low-income communities",
    text: "The New Markets Tax Credit is a separate program with its own low-income community test for a census tract: a poverty rate of at least 20%, or a median family income of at most 80% of the statewide median (in a metro area, 80% of the greater of the statewide and metro-area medians). The statute adds further cases not shown here.",
    cites: [
      { source: "usc-45D", pin: "§ 45D(e)(1)", quote: 'The term "low-income community" means any population census tract if-' },
      { source: "usc-45D", pin: "§ 45D(e)(1)(A)", quote: "the poverty rate for such tract is at least 20 percent" },
      { source: "usc-45D", pin: "§ 45D(e)(1)(B)(i)", quote: "the median family income for such tract does not exceed 80 percent of statewide median family income" },
      {
        source: "usc-45D",
        pin: "§ 45D(e)(1)(B)(ii)",
        quote: "the median family income for such tract does not exceed 80 percent of the greater of statewide median family income or the metropolitan area median family income.",
      },
    ],
  },
  hudQct: {
    id: "hudQct",
    title: "HUD Qualified Census Tract (QCT)",
    text: "A census tract designated by HUD where at least half of households have incomes below 60% of the area median gross income, or where the poverty rate is at least 25%. It is part of the low-income housing credit (LIHTC), not the Opportunity Zone program: a new building there can have its eligible basis counted at 130%, or an existing building its rehabilitation expenditures.",
    cites: [
      {
        source: "usc-42",
        pin: "§ 42(d)(5)(B)(ii)(I)",
        quote:
          'The term "qualified census tract" means any census tract which is designated by the Secretary of Housing and Urban Development and, for the most recent year for which census data are available on household income in such tract, either in which 50 percent or more of the households have an income which is less than 60 percent of the area median gross income for such year or which has a poverty rate of at least 25 percent.',
      },
      { source: "usc-42", pin: "§ 42(d)(5)(B)(i)(I)", quote: "in the case of a new building, the eligible basis of such building shall be 130 percent of such basis" },
      { source: "usc-42", pin: "§ 42(d)(5)(B)(i)(II)", quote: "in the case of an existing building, the rehabilitation expenditures taken into account under subsection (e) shall be 130 percent of such expenditures" },
    ],
  },
  hudDda: {
    id: "hudDda",
    title: "HUD Difficult Development Area (DDA)",
    text: "An area designated by HUD as having high construction, land and utility costs relative to area median gross income. Like a QCT, it is part of the low-income housing credit (LIHTC), not the Opportunity Zone program, and brings the same 130% basis boost.",
    cites: [
      {
        source: "usc-42",
        pin: "§ 42(d)(5)(B)(iii)(I)",
        quote:
          'The term "difficult development areas" means any area designated by the Secretary of Housing and Urban Development as an area which has high construction, land, and utility costs relative to area median gross income.',
      },
      {
        source: "usc-42",
        pin: "§ 42(d)(5)(B)(i)",
        quote: "In the case of any building located in a qualified census tract or difficult development area which is designated for purposes of this subparagraph-",
      },
    ],
  },
  zones2018: {
    id: "zones2018",
    title: "2018 Opportunity Zones",
    text: "The zones certified and designated by Treasury in 2018 (plus the Puerto Rico tracts deemed designated), listed in IRS Notices 2018-48 and 2019-42. They remain designated through December 31, 2028, but property bought in them after December 31, 2026, generally does not qualify.",
    cites: [
      { source: "irs-n-2026-40", pin: "Notice 2026-40, § 2.04(2)(b)", quote: "provides a list of LICs certified and designated as QOZs by the Secretary in 2018" },
      { source: "irs-n-2026-40", pin: "Notice 2026-40, § 2.04(2)(c)", quote: "(ii) December 31, 2028, for all other QOZs." },
      {
        source: "irs-n-2026-40",
        pin: "Notice 2026-40, § 5.01(1)",
        quote: "A previously designated QOZ does not have an “applicable start date” under § 1400Z-1(e)(2) because its designation took place before the date of enactment of OBBBA.",
      },
    ],
  },
} satisfies Record<string, Rule>;

export type RuleId = keyof typeof RULE_DEFS;
export const RULES: Record<RuleId, Rule> = RULE_DEFS;

/** How /rules groups the rules; every rule appears exactly once (rules.test.ts). */
export const RULE_GROUPS: Array<{ id: string; title: string; rules: RuleId[] }> = [
  { id: "gain", title: "The gain", rules: ["eligibleGains", "window180", "gainOnly", "passThroughTiming", "installmentTiming", "section1231Timing"] },
  { id: "timing", title: "Gains from 2026, and the switch to the new rules", rules: ["gain2026Invested2027", "investedBy2026"] },
  { id: "benefits", title: "The benefits", rules: ["deferralFiveYears", "stepUp", "tenYears"] },
  { id: "fund", title: "The fund", rules: ["fund", "fundPenalty", "fundReinvest", "fundReporting", "equityNotLoan"] },
  {
    id: "property",
    title: "The property",
    rules: ["businessUse", "purchaseUnrelated", "boughtAfterStart", "useInZone", "originalUse", "substantialImprovement", "ruralImprovement", "land"],
  },
  { id: "business", title: "A business in a zone", rules: ["zoneBusiness", "excludedBusinesses", "workingCapital"] },
  {
    id: "zones",
    title: "Zones and designation",
    rules: ["designatedNotEligible", "eligibility", "noContiguous", "stateCap", "nominationTimeline", "zonePeriod", "zones2018", "zones2018End", "ruralFund"],
  },
  { id: "other", title: "Other place-based programs", rules: ["hudQct", "hudDda", "otherProgramsHousing", "otherProgramsNmtc"] },
];

export function ruleById(id: RuleId): Rule {
  return RULES[id];
}

export function legalSource(id: LegalSourceId): LegalSource {
  const s = (SOURCES as LegalSource[]).find((x) => x.id === id);
  if (!s) throw new Error(`Unknown legal source ${id}`);
  return s;
}

/** A short label for a citation: "26 U.S.C. § 1400Z-2(a)(1)(A)", "26 CFR § 1.1400Z2(a)-1(b)(7)(i)", "IRS FAQ Q&A 23". */
export function citeLabel(c: Citation): string {
  if (c.source.startsWith("usc-")) return c.pin.startsWith("§") ? `26 U.S.C. ${c.pin}` : c.pin;
  if (c.source.startsWith("cfr-")) return `26 CFR ${c.pin}`;
  if (c.source === "irs-oz-faq") return `IRS FAQ ${c.pin}`;
  return c.pin;
}

/** Normalise text for quote matching: straight quotes, single spaces. */
export function normaliseForMatch(s: string): string {
  return s
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”‟]/g, '"')
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
