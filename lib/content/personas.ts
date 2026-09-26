/**
 * Four common starting points, and how the program's rules apply to each, in
 * general terms. Facts about the statute and about this tool only: no
 * recommendation, no tax calculation, no named fund (AGENTS.md). Rules are
 * IRC §§ 1400Z-1 and 1400Z-2 as amended by P.L. 119-21 § 70421.
 */

export type PersonaGroup = "invest" | "build" | "support";

export const PERSONA_GROUPS: Array<{ id: PersonaGroup; title: string }> = [
  { id: "invest", title: "Investing a gain" },
  { id: "build", title: "Building, owning and operating" },
  { id: "support", title: "Working with investors and places" },
];

export interface Persona {
  slug: string;
  group: PersonaGroup;
  who: string;
  title: string;
  summary: string;
  /** How the program fits this situation. */
  fit: string[];
  /** The rules that matter most here. */
  rules: string[];
  /** Questions to take further (a tax adviser or attorney unless askLabel says otherwise). */
  ask: string[];
  askLabel?: string;
  /** Where on this site the next question is answered. */
  tools: Array<{ href: string; label: string; why: string }>;
  example?: { title: string; steps: string[]; weigh: string[] };
}

export const PERSONAS: Persona[] = [
  {
    slug: "individual",
    group: "invest",
    who: "Individual investor",
    title: "An individual with a gain, looking at property",
    summary: "You sold stock or another asset at a gain and are looking at owning property in a zone.",
    fit: [
      "The gain goes into a Qualified Opportunity Fund, and the fund owns the property. You own an interest in the fund, not the property directly.",
      "The fund can be an existing one, or one set up for your project. It must be a partnership or a corporation for tax purposes, so a single-member LLC that is disregarded for tax purposes does not qualify as it stands.",
    ],
    rules: [
      "Generally 180 days from the sale to invest the gain. Only the gain needs to go in; only the gain gets the benefits.",
      "The property has to be used in a business, such as a rental. A home you or your family live in generally does not qualify, and a purchase from a related party does not count.",
      "An existing house must be substantially improved: roughly, the fund spends at least what it paid for the building (not the land) on improvements within 30 months. New construction counts as original use instead. The bar is 50% in rural zones under the 2027 rules.",
      "The tract must be a designated zone when the property is bought. Eligible tracts for 2027 are not zones until Treasury certifies them.",
      "Tax-free growth needs the fund interest held at least ten years.",
    ],
    ask: [
      "Is the gain a capital gain that qualifies, and when does its 180-day window start?",
      "Which entity should hold the property, and what does it cost to form and run it each year (tax returns, Form 8996, asset testing)?",
      "How would financing, other money and the rental be structured?",
    ],
    tools: [
      { href: "/map", label: "Map", why: "Look up an address or browse a state's eligible tracts." },
      { href: "/how-it-works", label: "How it works", why: "The gain, the fund, the zone and the timeline." },
      { href: "/check", label: "Check properties", why: "Check several candidate addresses at once." },
    ],
    example: {
      title: "Can a $20,000 stock gain go into a house in a zone?",
      steps: [
        "Generally yes, with conditions. Within 180 days of the sale, the $20,000 gain is invested in a fund: either an existing fund, or one set up for this purpose (with a second member, or as a corporation).",
        "The fund buys the property. It can add other money and a mortgage; only the $20,000 carries Opportunity Zone benefits.",
        "The property must be rented or otherwise used in a business, not lived in by the investor or family.",
        "If the house already exists, the fund must substantially improve it within 30 months: for example, a house bought for $150,000 of which $100,000 is the building would need at least about $100,000 of improvements. Building a new house on a lot avoids that test.",
        "The fund holds and rents the property. The deferral runs up to five years; tax-free growth needs at least ten.",
      ],
      weigh: [
        "The fixed cost and paperwork of forming and running a fund, against the size of the gain.",
        "That existing funds often have minimum investments and may accept only accredited investors.",
        "That the tract must actually be designated, which for 2027 is not yet known.",
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
      "The program rewards investors who hold a fund interest for years. A builder typically takes the developer's role, with the project owned by a fund that holds investors' gains, the builder's own, or both.",
      "Build-and-hold projects (for example, build-to-rent) line up with the program's timing. A quick buy, renovate and sell does not: the step-up needs five years and tax-free growth ten, and selling ends the deferral.",
    ],
    rules: [
      "New construction qualifies as original use. Existing buildings must be substantially improved within 30 months (roughly doubling the building's cost; 50% in rural zones under the 2027 rules).",
      "Vacant buildings can in some cases count as original use; the rules on how long they must have been vacant are specific.",
      "A fund that sells a property has a limited window to reinvest the proceeds without failing its asset test.",
      "Property must be bought after the zone is designated, and not from a related party.",
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
        "It depends on what kind of income the $200,000 is. Only capital gains (including net gains on business property held more than a year, under section 1231) can be invested for Opportunity Zone benefits.",
        "A builder who builds or buys houses in order to sell them generally holds them as inventory. Profit on selling inventory is ordinary income, not a capital gain, so it generally cannot be deferred this way.",
        "If the house was held as an investment instead, for example rented out for more than a year, the profit may be a capital or section 1231 gain. That gain can be invested in a fund, generally within 180 days (section 1231 gains have their own timing rules).",
        "If it qualifies, the fund (not the builder personally) owns the next project. New construction counts as original use. Selling the next house quickly ends the deferral, and the larger benefits need five and ten years.",
        "Where the profit does not qualify, a builder can still build in a zone as the developer for a fund whose money comes from investors' gains.",
      ],
      weigh: [
        "How past sales would be characterised: a dealer selling inventory, or an investor selling a capital asset. It turns on the facts.",
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
      "Corporations' capital gains can be invested the same way. Larger investors commonly use a fund of their own or a multi-asset fund.",
      "Screening at scale means comparing many tracts: which are eligible, how many a state can designate, which are rural, and what the places look like.",
    ],
    rules: [
      "Each state may designate up to 25% of its eligible tracts (up to 25 in a state with fewer than 100), so most eligible tracts will not become zones.",
      "A fund that qualifies as a rural opportunity fund earns a 30% step-up after five years, against 10% otherwise, under the 2027 rules.",
      "The fund must hold at least 90% of its assets in zone property, tested twice a year, and meet reporting requirements added in 2025.",
      "The 2018 zones remain in effect through 2028; the 2027 zones run for ten years.",
    ],
    ask: [
      "Fund structure, and whether a rural fund is feasible for the planned assets.",
      "How the 90% test and reporting will be met across several projects.",
    ],
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
      "A business located in a zone can receive money from a fund if it qualifies as an opportunity zone business. The capital can come from investors' gains; the business owner does not need a gain of their own.",
      "Location matters twice: the business must meet the zone tests, and the site has to work for the business.",
    ],
    rules: [
      "Most of the business's tangible property (70%) must be in a zone, and at least half of its gross income must come from active business there.",
      "Limits apply to cash and financial assets beyond reasonable working capital.",
      "Some businesses are excluded outright: golf courses, country clubs, massage parlors, hot tub and suntan facilities, racetracks and gambling facilities, and stores mainly selling alcohol for off-site consumption.",
    ],
    ask: [
      "Does the business, as it will operate, meet the income and property tests?",
      "How would investment from a fund be structured (equity, not a loan), and what does it mean for ownership?",
    ],
    tools: [
      { href: "/map", label: "Map", why: "Search candidate addresses; tract pages show jobs, income, anchors and permits." },
      { href: "/use-with-claude", label: "Use it from Claude", why: "The MCP nearby tool reports traffic counts, amenities, anchors, hazards and the county labor market around a site." },
      { href: "/check", label: "Check properties", why: "Compare several candidate sites at once." },
    ],
    example: {
      title: "Can $100,000 of business profit be reinvested in a zone without tax?",
      steps: [
        "Not as operating profit. The program defers capital gains. Ordinary business income, such as profit from selling goods or services, cannot be deferred by investing it in a fund.",
        "What can qualify is a capital gain the business or its owners realise: for example, from selling real estate, equipment (net section 1231 gains, with their own timing rules), or an interest in another business. A corporation or partnership can invest its own gains; partners can also invest their share.",
        "The expansion can still use the program from the other side: a new location in a designated zone can take equity investment from a fund whose money comes from investors' gains, if the business meets the opportunity zone business tests.",
        "Other incentives are separate programs with their own rules. Each tract page shows whether the tract is a New Markets Tax Credit low-income community or a HUD Qualified Census Tract.",
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
      "A fund generally has to buy its property, after the zone is designated, from someone unrelated to it. So an owner typically takes part by selling to a fund, or by partnering on a project the fund buys into.",
      "If the sale produces a capital gain, the owner can invest that gain in a fund of their own choosing, generally within 180 days, like any other investor.",
    ],
    rules: [
      "A purchase from a related party does not count: roughly, where the same people own more than 20% of both the seller and the fund.",
      "Property contributed to a fund in exchange for an interest, rather than sold to it, is generally not qualifying property for the fund, because the fund did not buy it.",
      "Land does not need to be improved, but it has to be used in an active business; holding land for its appreciation does not qualify.",
      "An existing building bought by a fund must be substantially improved within 30 months unless it counts as original use (for example, after a long vacancy under the specific rules).",
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
      "A fund lives or dies on its assets being in designated zones and staying qualified. Screening means confirming each site's tract, its designation, its rural status, and what the place is like.",
      "For 2027, sites in tracts that are only eligible carry designation risk until Treasury publishes the list.",
    ],
    rules: [
      "At least 90% of the fund's assets must be qualified opportunity zone property, tested twice a year, with penalties for shortfalls.",
      "Businesses a fund invests in can hold cash for development under a written plan (the working-capital safe harbor), within time limits.",
      "Under the 2027 rules, a qualified rural opportunity fund gives its investors a 30% step-up after five years instead of 10%, and rural zones have a lower substantial-improvement bar.",
      "Funds have reporting requirements, expanded by the 2025 law.",
    ],
    ask: [
      "Can the fund qualify as a rural opportunity fund with the planned assets?",
      "How will the 90% test, the working-capital plans and the reporting be met?",
    ],
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
      "The questions clients bring usually come down to three: is the gain eligible, is the fund or structure sound, and is the property really in a designated zone. This tool answers the third, with sources, and explains the rules in general terms for the first two.",
    ],
    rules: [
      "Eligible gains are capital gains (including net section 1231 gains); ordinary income, including inventory sales, does not qualify.",
      "Generally 180 days to invest; the fund must be a partnership or corporation certified on Form 8996, holding 90% of its assets in zones.",
      "For gains invested under the 2027 rules: deferral up to five years, a 10% step-up after five years (30% for rural funds), and exclusion of appreciation after ten years, limited at thirty.",
      "Gains deferred under the original rules are recognised on December 31, 2026.",
    ],
    askLabel: "Points to confirm in the primary sources",
    ask: [
      "The statute (26 U.S.C. §§ 1400Z-1 and 1400Z-2 as amended by Public Law 119-21), the final regulations, and current IRS notices, including Notice 2025-50 on rural areas.",
      "Treasury's final list of 2027 designations, once published, for each property's tract.",
    ],
    tools: [
      { href: "/check", label: "Check properties", why: "Check a client's or a fund's addresses and keep the CSV with your file." },
      { href: "/how-it-works", label: "How it works", why: "A plain-language summary to share, with statute and IRS links." },
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
      "Funds and the businesses they own can borrow: gains supply the equity, and loans can supply the rest. Only the equity from gains carries Opportunity Zone benefits.",
      "Zones often overlap other place-based programs, which matters for how a project is financed.",
    ],
    rules: [
      "A fund must invest in an opportunity zone business through equity (stock or a partnership interest), not a loan; the business itself can borrow from lenders.",
      "HUD Qualified Census Tracts and Difficult Development Areas raise the housing credit (LIHTC) available to a project; New Markets Tax Credit low-income communities are a separate program. Each has its own rules.",
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
      "Governors nominate the 2027 zones from each state's eligible tracts, and many states seek local input. After designation, local offices often publish project lists or prospectuses for investors.",
      "What helps is knowing which local tracts are eligible, how many the state can designate, and what the data says about each place.",
    ],
    rules: [
      "Only tracts on Treasury's eligible list can be designated; the exception for tracts next to a zone was repealed.",
      "Each state may designate up to 25% of its eligible tracts (up to 25 in a state with fewer than 100). Zones last ten years, with new rounds every ten years.",
      "Rural zones carry extra benefits under the 2027 rules, so rural status is worth knowing tract by tract.",
    ],
    askLabel: "Questions for your state's Opportunity Zone office",
    ask: [
      "How and when does the state take local input on nominations, and has its list been submitted?",
      "How will the state publicise designated zones and projects?",
    ],
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
