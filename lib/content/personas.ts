/**
 * Common starting points, and how the program's rules apply to each, in
 * general terms. Facts about the statute and about this tool only: no
 * recommendation, no tax calculation, no named fund (AGENTS.md).
 *
 * Every statement of a rule carries `cite`: the rules in lib/content/rules.ts
 * it restates, each quoted word for word from the statute, regulations or IRS
 * guidance. personas.test.ts fails if a rule line has no citation. Where no
 * official text settles a point, it is asked as a question, not stated.
 */

import type { RuleId } from "./rules";

export type PersonaGroup = "invest" | "build" | "support";

export const PERSONA_GROUPS: Array<{ id: PersonaGroup; title: string }> = [
  { id: "invest", title: "Investing a gain" },
  { id: "build", title: "Building, owning and operating" },
  { id: "support", title: "Working with investors and places" },
];

/** A line of text, and the rules (with their sources) it relies on. */
export interface Line {
  text: string;
  cite?: RuleId[];
}

export interface Persona {
  slug: string;
  group: PersonaGroup;
  who: string;
  title: string;
  summary: string;
  /** How the program fits this situation. */
  fit: Line[];
  /** The rules that matter most here. Each must be cited. */
  rules: Array<Required<Line>>;
  /** Questions to take further (a tax adviser or attorney unless askLabel says otherwise). */
  ask: string[];
  askLabel?: string;
  /** Where on this site the next question is answered. */
  tools: Array<{ href: string; label: string; why: string }>;
  example?: { title: string; steps: Line[]; weigh: string[] };
}

export const PERSONAS: Persona[] = [
  {
    slug: "individual",
    group: "invest",
    who: "Individual investor",
    title: "An individual with a gain, looking at property",
    summary: "You sold stock or another asset at a gain and are looking at owning property in a zone.",
    fit: [
      {
        text: "The gain goes into a Qualified Opportunity Fund, and the fund owns the property. You own an interest in the fund, not the property directly.",
        cite: ["fund"],
      },
      {
        text: "The fund can be an existing one, or one set up for your project. It must be a corporation or a partnership for tax purposes, so a single-member LLC that is disregarded for tax purposes does not qualify as it stands.",
        cite: ["fund"],
      },
    ],
    rules: [
      {
        text: "Generally 180 days to invest the gain, counted from the sale. A gain from a 2026 sale can be invested from January 1, 2027, under the new rules, if its 180 days reach that far.",
        cite: ["window180", "gain2026Invested2027"],
      },
      { text: "Only the gain needs to go in, and only the gain gets the benefits.", cite: ["gainOnly"] },
      {
        text: "The fund must buy the property from an unrelated seller and use it in its trade or business. For a business the fund invests in, owning and leasing out real property counts; a bare triple-net lease does not.",
        cite: ["purchaseUnrelated", "businessUse"],
      },
      {
        text: "An existing house must be substantially improved: within 30 months, the fund adds more to the building's basis than the building's basis when bought (the land is measured separately). A new house that no one has yet placed in service is original use instead. In zones made up entirely of rural areas, the bar is 50%.",
        cite: ["substantialImprovement", "originalUse", "ruralImprovement"],
      },
      {
        text: "The tract must be a designated zone. Property bought after December 31, 2026, must be in a zone designated under the 2025 law (the 2027 zones), bought after its start date. Eligible tracts are not zones until Treasury certifies them.",
        cite: ["designatedNotEligible", "boughtAfterStart"],
      },
      { text: "Tax-free growth needs the fund interest held at least ten years.", cite: ["tenYears"] },
    ],
    ask: [
      "Is the gain a capital gain that qualifies, and when does its 180-day window start?",
      "Could I or my family use the property at all, and what would that mean for the fund's business use?",
      "Which entity should hold the property, and what does it cost to form and run it each year (tax returns, Form 8996, asset testing)?",
      "How would financing, other money and the rental be structured?",
    ],
    tools: [
      { href: "/guide", label: "Guided check", why: "Enter a sale date to see when its 180 days end and which rules that points to." },
      { href: "/map", label: "Map", why: "Look up an address or browse a state's eligible tracts." },
      { href: "/check", label: "Check properties", why: "Check several candidate addresses at once." },
    ],
    example: {
      title: "Can a $20,000 stock gain go into a house in a zone?",
      steps: [
        {
          text: "Generally yes, with conditions. Within 180 days of the sale, the $20,000 gain is invested in a fund: an existing fund, or one set up for this purpose (taxed as a partnership or a corporation).",
          cite: ["window180", "fund"],
        },
        { text: "The fund buys the property. It can add other money; only the $20,000 carries Opportunity Zone benefits.", cite: ["gainOnly"] },
        { text: "The fund has to buy from an unrelated seller and use the property in its business, for example by renting it out.", cite: ["purchaseUnrelated", "businessUse"] },
        {
          text: "If the house already exists, the fund must substantially improve it within 30 months. For example, a house bought for $150,000, of which $100,000 is the building, would need more than $100,000 added to the building's basis (more than $50,000 in a zone made up entirely of rural areas). A new house that no one has yet placed in service is original use instead.",
          cite: ["substantialImprovement", "ruralImprovement", "originalUse"],
        },
        { text: "The deferral runs up to five years; tax-free growth needs at least ten.", cite: ["deferralFiveYears", "tenYears"] },
      ],
      weigh: [
        "The fixed cost and paperwork of forming and running a fund, against the size of the gain.",
        "Whether an existing fund's minimum investment and investor requirements fit.",
        "Whether the tract will be designated: until Treasury publishes the 2027 list, eligible tracts are only candidates.",
      ],
    },
  },
  {
    slug: "builder",
    group: "build",
    who: "Home builder",
    title: "A builder or developer",
    summary: "You build or renovate homes and want to know how zones fit a project.",
    fit: [
      {
        text: "The benefits go to investors who hold a fund interest for years. A builder can take the developer's role, with the project owned by a fund that holds investors' gains, the builder's own, or both.",
        cite: ["fund", "tenYears"],
      },
      {
        text: "Build-and-hold projects (for example, build-to-rent) line up with the program's timing. A quick buy, renovate and sell does not: the step-up needs five years and tax-free growth ten, and selling the investment ends the deferral.",
        cite: ["stepUp", "tenYears", "deferralFiveYears"],
      },
    ],
    rules: [
      {
        text: "New construction that no one has yet placed in service is original use. Existing buildings must be substantially improved within 30 months: adding more than the building's basis, or more than 50% in zones made up entirely of rural areas.",
        cite: ["originalUse", "substantialImprovement", "ruralImprovement"],
      },
      {
        text: "A building vacant for at least one calendar year before its zone was listed, and still vacant when bought, or vacant for three calendar years after, can count as original use.",
        cite: ["originalUse"],
      },
      {
        text: "A fund that sells property has 12 months to reinvest the proceeds for its 90% test, holding them in cash or short-term debt meanwhile.",
        cite: ["fundReinvest"],
      },
      {
        text: "Property must be bought from an unrelated seller, after the zone's start date. For purchases after December 31, 2026, that means a 2027 zone.",
        cite: ["purchaseUnrelated", "boughtAfterStart"],
      },
    ],
    ask: [
      "How should the fund and the building company be separated, and how are development fees treated?",
      "Does a planned renovation meet substantial improvement, and on what schedule?",
      "What happens to investors if a project is sold before ten years?",
    ],
    tools: [
      { href: "/map", label: "Map", why: "See whole states of tracts; tract pages show housing age, vacancy, rents, permits and hazards." },
      { href: "/check", label: "Check properties", why: "Check a list of lots or houses in one pass." },
      { href: "/how-it-works#zone", label: "How it works: the zone", why: "Original use and substantial improvement." },
    ],
    example: {
      title: "Can $200,000 of profit on the last house go into the next one?",
      steps: [
        {
          text: "It depends on what kind of income the $200,000 is. Only capital gains and qualified section 1231 gains can be invested for Opportunity Zone benefits; ordinary gain cannot.",
          cite: ["eligibleGains"],
        },
        {
          text: "Property held primarily for sale to customers in the ordinary course of business is not a capital asset. If the houses were held that way, the profit is not a capital gain and cannot be deferred this way.",
          cite: ["eligibleGains"],
        },
        {
          text: "If the house was held as an investment instead, the profit may be a capital gain or a section 1231 gain, which can be invested within 180 days (for a 1231 gain, the IRS FAQ says the 180 days begin on the day it is realized).",
          cite: ["eligibleGains", "window180", "section1231Timing"],
        },
        {
          text: "If it qualifies, the fund (not the builder personally) owns the next project. A new house no one has placed in service is original use. Selling the investment ends the deferral, and the larger benefits need five and ten years.",
          cite: ["originalUse", "deferralFiveYears", "stepUp", "tenYears"],
        },
        { text: "Where the profit does not qualify, a builder can still build in a zone for a fund whose money comes from investors' gains." },
      ],
      weigh: [
        "How past sales would be characterised: property held for sale to customers, or an investment. It turns on the facts.",
        "How development fees and profit are split between the building company and the fund.",
        "Whether the project will be held long enough for the benefits to apply.",
      ],
    },
  },
  {
    slug: "corporate",
    group: "invest",
    who: "Corporate investor",
    title: "A corporation or institutional investor",
    summary: "You are screening regions or states for where to deploy capital.",
    fit: [
      {
        text: "A corporation's capital gains can be invested the same way, through an existing fund or a fund of its own.",
        cite: ["eligibleGains", "fund"],
      },
      { text: "Screening at scale means comparing many tracts: which are eligible, how many a state can designate, which are rural, and what the places look like." },
    ],
    rules: [
      {
        text: "Each state may designate at most 25% of its eligible tracts (25 in a state with fewer than 100), so most eligible tracts will not become zones.",
        cite: ["stateCap"],
      },
      {
        text: "For amounts invested after December 31, 2026, investors in a qualified rural opportunity fund get a 30% step-up after five years instead of 10%.",
        cite: ["stepUp", "ruralFund"],
      },
      {
        text: "A fund must hold at least 90% of its assets in zone property, measured twice a year, and under the 2025 law files an annual information return.",
        cite: ["fund", "fundReporting"],
      },
      {
        text: "Property bought after December 31, 2026, must be in a 2027 zone, apart from narrow transition rules. The 2018 zones remain designated through 2028; the 2027 zones run to December 31, 2036.",
        cite: ["boughtAfterStart", "zones2018End", "zonePeriod"],
      },
    ],
    ask: ["Fund structure, and whether a rural fund is feasible for the planned assets.", "How the 90% test and reporting will be met across several projects."],
    tools: [
      { href: "/map", label: "Map", why: "Colour states by eligibility, rural status, 2018 zones, HUD QCT/DDA and NMTC." },
      { href: "/use-with-claude", label: "Use it from Claude", why: "The MCP server lists, filters and compares tracts in a state by any published measure." },
      { href: "/check", label: "Check properties", why: "Check a pipeline of sites in one table, and download it as CSV." },
    ],
  },
  {
    slug: "business",
    group: "build",
    who: "Business operator",
    title: "A business looking for a location",
    summary: "You run a business and are considering a location in a zone, possibly with investment from a fund.",
    fit: [
      {
        text: "A business located in a zone can take investment from a fund if it qualifies as an opportunity zone business. The fund buys stock or a partnership interest for cash; the business owner does not need a gain of their own.",
        cite: ["zoneBusiness", "equityNotLoan"],
      },
      { text: "Location matters twice: the business must meet the zone tests, and the site has to work for the business." },
    ],
    rules: [
      {
        text: "At least 70% of the business's tangible property must qualify as zone business property, at least 50% of its gross income must come from active business in the zone, and at least 40% of its intangible property must be used there.",
        cite: ["zoneBusiness"],
      },
      {
        text: "Financial property beyond reasonable working capital must stay under 5%. Working capital for development needs a written plan and a schedule to spend it within 31 months.",
        cite: ["zoneBusiness", "workingCapital"],
      },
      {
        text: "Some businesses are excluded outright, as are businesses leasing more than a small amount of property to them: golf courses, country clubs, massage parlors, hot tub and suntan facilities, racetracks and other gambling facilities, and stores whose principal business is selling alcohol for consumption off premises.",
        cite: ["excludedBusinesses"],
      },
    ],
    ask: [
      "Does the business, as it will operate, meet the income and property tests?",
      "How would investment from a fund be structured, and what does it mean for ownership?",
    ],
    tools: [
      { href: "/map", label: "Map", why: "Search candidate addresses; tract pages show jobs, income, anchors and permits." },
      { href: "/use-with-claude", label: "Use it from Claude", why: "The MCP nearby tool reports traffic counts, amenities, anchors, hazards and the county labor market around a site." },
      { href: "/check", label: "Check properties", why: "Compare several candidate sites at once." },
    ],
    example: {
      title: "Can $100,000 of business profit be reinvested in a zone without tax?",
      steps: [
        {
          text: "Not as operating profit. The program defers capital gains and qualified section 1231 gains; ordinary income, such as profit from selling goods or services, is not eligible.",
          cite: ["eligibleGains"],
        },
        {
          text: "What can qualify is a capital gain the business or its owners realise, for example from selling real estate or an interest in another business. A partnership can invest its own gains, or its partners can invest their shares, with their own 180-day start dates.",
          cite: ["eligibleGains", "passThroughTiming"],
        },
        {
          text: "The expansion can still use the program from the other side: a new location in a designated zone can take equity from a fund whose money comes from investors' gains, if the business meets the opportunity zone business tests.",
          cite: ["zoneBusiness", "equityNotLoan"],
        },
        {
          text: "Other incentives are separate programs with their own rules. Each tract page shows whether the tract is a New Markets Tax Credit low-income community or a HUD Qualified Census Tract.",
          cite: ["otherProgramsNmtc", "otherProgramsHousing"],
        },
      ],
      weigh: [
        "Whether the business or its owners have, or will have, capital gains at all.",
        "What taking equity from a fund means for ownership and control.",
        "Whether operations at the new site would meet the property and income tests year after year.",
      ],
    },
  },
  {
    slug: "landowner",
    group: "build",
    who: "Landowner",
    title: "An owner of land or a building in a zone",
    summary: "You own property in or near a zone and are considering selling to, or partnering with, a fund.",
    fit: [
      {
        text: "A fund has to buy its property from someone unrelated to it, after the zone's start date. So an owner can take part by selling to a fund, or by partnering on a project the fund buys into.",
        cite: ["purchaseUnrelated", "boughtAfterStart"],
      },
      { text: "If the sale produces a capital gain, the owner can invest that gain in a fund within 180 days, like any other investor.", cite: ["eligibleGains", "window180"] },
    ],
    rules: [
      {
        text: "A purchase from a related party does not count. Related is defined by the tests in sections 267(b) and 707(b)(1), with 20 percent in place of 50 percent.",
        cite: ["purchaseUnrelated"],
      },
      {
        text: "Property contributed to a fund in exchange for an interest, rather than sold to it, was not bought by the fund, so it is not zone business property.",
        cite: ["purchaseUnrelated"],
      },
      {
        text: "Unimproved land does not need to be substantially improved, unless it is bought expecting to improve it by no more than an insubstantial amount within 30 months; then it does not qualify.",
        cite: ["land"],
      },
      {
        text: "An existing building bought by a fund must be substantially improved within 30 months unless it counts as original use, for example after a qualifying vacancy.",
        cite: ["substantialImprovement", "originalUse"],
      },
    ],
    ask: [
      "Would a sale or a partnership suit the property, and how would each be taxed?",
      "Are the owner and the fund related parties under the rules?",
      "Is the gain on the sale a capital gain, and when does its 180-day window start?",
    ],
    tools: [
      { href: "/check", label: "Check properties", why: "See whether each parcel's tract is in a 2018 zone or eligible for 2027." },
      { href: "/map", label: "Map", why: "See the surrounding tracts and what the data says about the place." },
      { href: "/how-it-works#zone", label: "How it works: the zone", why: "What a fund needs from the property it buys." },
    ],
  },
  {
    slug: "sponsor",
    group: "support",
    who: "Fund sponsor",
    title: "A fund sponsor or manager",
    summary: "You are forming or running a fund and screening a pipeline of sites.",
    fit: [
      {
        text: "A fund depends on its assets being in designated zones and staying qualified. Screening means confirming each site's tract, its designation, its rural status, and what the place is like.",
        cite: ["fund", "useInZone"],
      },
      { text: "Sites in tracts that are only eligible for 2027 carry designation risk until Treasury publishes the list.", cite: ["designatedNotEligible"] },
    ],
    rules: [
      {
        text: "At least 90% of the fund's assets must be zone property, measured twice a year, with a monthly penalty for a shortfall unless it is due to reasonable cause.",
        cite: ["fund", "fundPenalty"],
      },
      {
        text: "Businesses a fund invests in can hold cash for development under a written plan and schedule, spent within 31 months (the working-capital safe harbor).",
        cite: ["workingCapital"],
      },
      {
        text: "For amounts invested after December 31, 2026, investors in a qualified rural opportunity fund get a 30% step-up after five years instead of 10%. Zones made up entirely of rural areas also have a 50% improvement bar.",
        cite: ["stepUp", "ruralFund", "ruralImprovement"],
      },
      { text: "Every fund files an annual information return under the 2025 law.", cite: ["fundReporting"] },
      {
        text: "Property bought after December 31, 2026, must be in a 2027 zone; in the 2018 zones only narrow transition rules apply.",
        cite: ["boughtAfterStart"],
      },
    ],
    ask: ["Can the fund qualify as a rural opportunity fund with the planned assets?", "How will the 90% test, the working-capital plans and the reporting be met?"],
    tools: [
      { href: "/check", label: "Check properties", why: "Screen a pipeline of up to 25 sites at a time and download the results as CSV." },
      { href: "/map", label: "Map", why: "Colour a state by rural status, 2018 zones or 2027 eligibility." },
      { href: "/use-with-claude", label: "Use it from Claude", why: "The MCP server compares tracts and reports flood, earthquake, wildfire and more around a site." },
    ],
  },
  {
    slug: "adviser",
    group: "support",
    who: "Tax or financial adviser",
    title: "A CPA, attorney or financial adviser",
    summary: "You help clients with gains and want to check places and explain the rules.",
    fit: [
      {
        text: "The questions clients bring usually come down to three: is the gain eligible, is the fund or structure sound, and is the property in a designated zone. This tool answers the third, with sources, and explains the rules in general terms, with citations, for the first two.",
      },
    ],
    rules: [
      {
        text: "Eligible gains are capital gains and qualified section 1231 gains from sales to unrelated persons; ordinary gain is not eligible.",
        cite: ["eligibleGains"],
      },
      {
        text: "180 days, from the day the gain would be recognized; pass-through, installment and section 1231 gains have their own start dates.",
        cite: ["window180", "passThroughTiming", "installmentTiming", "section1231Timing"],
      },
      {
        text: "For amounts invested after December 31, 2026: deferral up to five years, a 10% step-up after five years (30% for qualified rural opportunity funds), and a fair-market-value basis election after ten years, fixed at 30.",
        cite: ["deferralFiveYears", "stepUp", "tenYears"],
      },
      {
        text: "Gains deferred under the original rules are included in the tax year that includes December 31, 2026. A gain realized in 2026 and invested from January 1, 2027, falls under the new rules.",
        cite: ["investedBy2026", "gain2026Invested2027"],
      },
    ],
    askLabel: "Points to confirm in the primary sources",
    ask: [
      "The statute (26 U.S.C. §§ 1400Z-1 and 1400Z-2 as amended by Public Law 119-21), the final regulations, and current IRS guidance: Notice 2025-50 (substantial improvement in rural 2018 zones), Notice 2026-40 (transition), and Rev. Proc. 2026-14 (nominations).",
      "Treasury's final list of 2027 designations, once published, for each property's tract.",
    ],
    tools: [
      { href: "/rules", label: "Rules and sources", why: "Every rule this site states, with the exact statutory, regulatory and IRS text behind it." },
      { href: "/check", label: "Check properties", why: "Check a client's or a fund's addresses and keep the CSV with your file." },
      { href: "/map", label: "Map", why: "Tract pages cite the source and vintage behind every figure." },
    ],
  },
  {
    slug: "lender",
    group: "support",
    who: "Lender",
    title: "A bank, CDFI or other lender",
    summary: "You finance projects and want to know where zones overlap other programs.",
    fit: [
      {
        text: "Gains supply a fund's equity and loans can supply the rest; only the part of an investment that is a reinvested gain carries Opportunity Zone benefits.",
        cite: ["gainOnly"],
      },
      { text: "Zones can overlap other place-based programs, which matters for how a project is financed; the map shows where." },
    ],
    rules: [
      {
        text: "A fund invests in a zone business by buying its stock or a partnership interest for cash; a loan to the business is not zone property.",
        cite: ["equityNotLoan"],
      },
      {
        text: "HUD Qualified Census Tracts and Difficult Development Areas are part of the low-income housing credit (LIHTC): there, a building's eligible basis or rehabilitation expenditures can count at 130%. New Markets Tax Credit low-income communities are another separate program.",
        cite: ["otherProgramsHousing", "otherProgramsNmtc"],
      },
    ],
    ask: ["How would the fund's equity and the loan sit together, and what happens to the structure if the fund fails a test?"],
    tools: [
      { href: "/map", label: "Map", why: "Colour tracts by HUD QCT, DDA or NMTC status alongside 2027 eligibility." },
      { href: "/check", label: "Check properties", why: "Check a loan pipeline's addresses in one pass." },
      { href: "/map", label: "Tract pages", why: "Mortgage applications, originations and denial rates (HMDA) for each tract." },
    ],
  },
  {
    slug: "community",
    group: "support",
    who: "Local government",
    title: "A local government or economic development office",
    summary: "You want to understand your area's tracts and attract investment to them.",
    fit: [
      { text: "Governors nominate the 2027 zones from each state's low-income communities, and Treasury certifies them.", cite: ["designatedNotEligible", "nominationTimeline"] },
      { text: "What helps is knowing which local tracts are eligible, how many the state can designate, and what the data says about each place." },
    ],
    rules: [
      {
        text: "Only low-income communities can be designated; the 2025 law removed the rule that allowed some neighbouring tracts.",
        cite: ["eligibility", "noContiguous"],
      },
      {
        text: "Each state may designate at most 25% of its eligible tracts (25 in a state with fewer than 100). Zones certified in 2026 run from January 1, 2027, through December 31, 2036, and nominations restart every ten years.",
        cite: ["stateCap", "zonePeriod"],
      },
      {
        text: "Governors nominate in the 90 days from July 1, 2026 (to October 28, 2026, with an extension); Treasury then has 30 days to certify.",
        cite: ["nominationTimeline"],
      },
      {
        text: "Rural status matters: zones made up entirely of rural areas have a 50% improvement bar, and qualified rural opportunity funds a 30% step-up.",
        cite: ["ruralImprovement", "ruralFund", "stepUp"],
      },
    ],
    askLabel: "Questions for your state's Opportunity Zone office",
    ask: ["How and when does the state take local input on nominations, and has its list been submitted?", "How will the state publicise designated zones and projects?"],
    tools: [
      { href: "/map", label: "Map", why: "See every tract in your state coloured by eligibility, rural status and 2018 zones." },
      { href: "/how-it-works#designation", label: "Eligible vs designated", why: "How nomination and the state cap work." },
      { href: "/use-with-claude", label: "Use it from Claude", why: "The MCP server lists and compares your tracts, and summarises how the 2018 zones fared." },
    ],
  },
];

export function personaBySlug(slug: string): Persona | undefined {
  return PERSONAS.find((p) => p.slug === slug);
}
