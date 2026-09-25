/**
 * Validate the statutory engine against Treasury's own determination.
 *
 * Treasury published its OZ 2.0 eligibility file on 2026-03-23 with a row for
 * every 2020 census tract: the inputs it used, the comparison-area median family
 * income it derived, and its `eligible_lic` verdict. That makes the engine in
 * `lib/oz/eligibility.ts` checkable rather than merely plausible — run it over
 * the same 85,529 rows and every disagreement is either a bug here or a
 * documented departure.
 *
 * This deliberately feeds Treasury's OWN denominators in, so the test isolates
 * the statutory logic from the pipeline's ACS fetching. The pipeline's numbers
 * get compared against Treasury's separately.
 *
 *   npx tsx scripts/validate-eligibility.ts [path/to/oz2-eligible.csv]
 *
 * The CSV comes from the published workbook:
 *   https://home.treasury.gov/system/files/131/OZ2-Eligible-LIC-Tracts-Data-Transparency-03232026.xlsx
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import {
  classifyTract,
  stateCap,
  type Denominators,
  type EligibilityResult,
  type MetroBasis,
  type TractInput,
} from "../lib/oz/eligibility";

const csvPath =
  process.argv[2] ?? path.resolve(import.meta.dirname, "..", "pipeline", "cache", "oz2-eligible.csv");

interface Row {
  geoid: string;
  state: string;
  county: string;
  cbsa: string;
  povertyRate: number | null;
  mfi: number | null;
  stateMfi: number | null;
  cbsaMfi: number | null;
  areaMfi: number | null;
  mfiRatio: number | null;
  eligible: boolean;
  rural: boolean;
}

function num(s: string): number | null {
  if (s == null) return null;
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** The file has no embedded commas or quotes in practice, but be safe. */
function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

function load(): Row[] {
  let text: string;
  try {
    text = readFileSync(csvPath, "utf8");
  } catch {
    console.error(
      `Cannot read ${csvPath}.\n` +
        `Run the pipeline's eligibility stage first, or pass the CSV path as an argument.`
    );
    process.exit(1);
  }
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  const header = splitCsv(lines[0]);
  const at = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`Column "${name}" missing; got ${header.join(",")}`);
    return i;
  };
  const idx = {
    geoid: at("census_tract_number"),
    state: at("state"),
    county: at("county"),
    cbsa: at("cbsa"),
    poverty: at("poverty_rate"),
    mfi: at("mfi"),
    stateMfi: at("state_mfi"),
    cbsaMfi: at("cbsa_mfi"),
    areaMfi: at("area_mfi"),
    ratio: at("mfi_ratio"),
    eligible: at("eligible_lic"),
    rural: at("rural_status"),
  };

  return lines.slice(1).map((line) => {
    const c = splitCsv(line);
    return {
      geoid: c[idx.geoid].trim(),
      state: c[idx.state].trim(),
      county: c[idx.county].trim(),
      cbsa: c[idx.cbsa].trim(),
      // Treasury reports poverty as a percent (17.4) and mfi_ratio as a
      // fraction (0.939), despite the data dictionary calling the ratio a
      // percent. The engine works in shares, so poverty is divided by 100.
      povertyRate: num(c[idx.poverty]) == null ? null : num(c[idx.poverty])! / 100,
      mfi: num(c[idx.mfi]),
      stateMfi: num(c[idx.stateMfi]),
      cbsaMfi: num(c[idx.cbsaMfi]),
      areaMfi: num(c[idx.areaMfi]),
      mfiRatio: num(c[idx.ratio]),
      eligible: c[idx.eligible].trim() === "1",
      rural: c[idx.rural].trim() === "1",
    };
  });
}

const rows = load();
console.log(`Treasury file: ${rows.length.toLocaleString("en-US")} tracts`);
console.log(`  eligible_lic = 1 : ${rows.filter((r) => r.eligible).length.toLocaleString("en-US")}`);
console.log(`  rural_status = 1 : ${rows.filter((r) => r.rural).length.toLocaleString("en-US")}`);
console.log(
  `  both             : ${rows.filter((r) => r.eligible && r.rural).length.toLocaleString("en-US")}`
);
console.log(`  mfi missing      : ${rows.filter((r) => r.mfi == null).length.toLocaleString("en-US")}`);
console.log(
  `  poverty missing  : ${rows.filter((r) => r.povertyRate == null).length.toLocaleString("en-US")}`
);

// Treasury's own denominators, so only the statutory logic is under test.
const stateMfi = new Map<string, number | null>();
const cbsaMfi = new Map<string, number | null>();
for (const r of rows) {
  const fips = r.geoid.slice(0, 2);
  if (!stateMfi.has(fips)) stateMfi.set(fips, r.stateMfi);
  if (r.cbsa !== "" && !cbsaMfi.has(r.cbsa)) cbsaMfi.set(r.cbsa, r.cbsaMfi);
}
const denominators: Denominators = { stateMfi, cbsaMfi };
console.log(`\nDenominators: ${stateMfi.size} states/territories, ${cbsaMfi.size} CBSAs`);

function run(metroBasis: MetroBasis) {
  const results: EligibilityResult[] = [];
  let agree = 0;
  let falsePos = 0;
  let falseNeg = 0;
  let indeterminateVsZero = 0;
  let indeterminateVsOne = 0;
  const mismatches: Array<{ row: Row; got: EligibilityResult }> = [];
  let ratioMaxDelta = 0;
  let ratioChecked = 0;

  for (const r of rows) {
    const input: TractInput = {
      geoid: r.geoid,
      stateFips: r.geoid.slice(0, 2),
      mfi: r.mfi,
      povertyRate: r.povertyRate,
      cbsa: r.cbsa === "" ? null : r.cbsa,
      // Treasury matched tracts to any CBSA, metropolitan or micropolitan, so
      // under its own reading every CBSA tract counts as metropolitan.
      cbsaIsMetro: true,
      population: null,
    };
    const got = classifyTract(input, denominators, metroBasis);
    results.push(got);

    if (got.mfiRatio != null && r.mfiRatio != null) {
      ratioChecked++;
      ratioMaxDelta = Math.max(ratioMaxDelta, Math.abs(got.mfiRatio - r.mfiRatio));
    }

    const saysEligible = got.status === "eligible";
    if (saysEligible === r.eligible) {
      agree++;
    } else if (got.status === "indeterminate") {
      if (r.eligible) indeterminateVsOne++;
      else indeterminateVsZero++;
      if (r.eligible && mismatches.length < 12) mismatches.push({ row: r, got });
    } else if (saysEligible && !r.eligible) {
      falsePos++;
      if (mismatches.length < 12) mismatches.push({ row: r, got });
    } else {
      falseNeg++;
      if (mismatches.length < 12) mismatches.push({ row: r, got });
    }
  }

  const decided = agree + falsePos + falseNeg;
  console.log(`\n--- metroBasis = ${metroBasis} ---`);
  console.log(`  exact agreement on eligible/not : ${agree.toLocaleString("en-US")} / ${rows.length.toLocaleString("en-US")}`);
  console.log(`  disagreements (real)            : ${falsePos + falseNeg}  (${falsePos} we say eligible, Treasury 0; ${falseNeg} we say not, Treasury 1)`);
  console.log(`  we say indeterminate, Treasury 0: ${indeterminateVsZero.toLocaleString("en-US")}  (deliberate: suppressed input, not a verdict)`);
  console.log(`  we say indeterminate, Treasury 1: ${indeterminateVsOne.toLocaleString("en-US")}  (would be a real problem)`);
  if (decided > 0) {
    console.log(`  agreement among decided rows    : ${((agree / decided) * 100).toFixed(4)}%`);
  }
  console.log(`  max |mfiRatio delta| over ${ratioChecked.toLocaleString("en-US")} rows: ${ratioMaxDelta.toExponential(2)}`);

  if (mismatches.length > 0) {
    console.log(`\n  first ${mismatches.length} disagreements:`);
    for (const m of mismatches) {
      console.log(
        `   ${m.row.geoid} ${m.row.state}/${m.row.county} cbsa="${m.row.cbsa}"\n` +
          `     treasury: eligible=${m.row.eligible ? 1 : 0} mfi=${m.row.mfi} area_mfi=${m.row.areaMfi} ratio=${m.row.mfiRatio} pov=${m.row.povertyRate}\n` +
          `     engine  : ${m.got.status} (income=${m.got.incomeTest} poverty=${m.got.povertyTest} ratio=${m.got.mfiRatio?.toFixed(6)}) basis=${m.got.applicable.basis} areaMfi=${m.got.applicable.value}\n` +
          `     reason  : ${m.got.reason}`
      );
    }
  }
  return results;
}

const results = run("cbsa");

// The alternative "metropolitan area = MSA only" reading CANNOT be tested from
// this file: Treasury publishes a CBSA name but not whether it is metropolitan or
// micropolitan, so every row here is fed cbsaIsMetro=true and the msa-only run
// is a no-op that reproduces the CBSA numbers exactly. Testing it for real needs
// the OMB delineation file joined in, which the pipeline does. Running it anyway
// would produce an identical table that looks like evidence and is not.
console.log(
  `\n--- metroBasis = msa-only ---\n` +
    `  Not evaluated. Treasury's file names each CBSA but does not flag metropolitan\n` +
    `  versus micropolitan, so this run would duplicate the CBSA result rather than\n` +
    `  test the alternative reading. The pipeline joins the OMB delineation file and\n` +
    `  quantifies the difference there.`
);

// Per-jurisdiction caps, derived from our own eligible counts.
const byState = new Map<string, number>();
for (const [i, r] of results.entries()) {
  if (r.status === "eligible") {
    const fips = rows[i].geoid.slice(0, 2);
    byState.set(fips, (byState.get(fips) ?? 0) + 1);
  }
}
const treasuryByState = new Map<string, { name: string; eligible: number }>();
for (const r of rows) {
  const fips = r.geoid.slice(0, 2);
  const e = treasuryByState.get(fips) ?? { name: r.state, eligible: 0 };
  if (r.eligible) e.eligible++;
  treasuryByState.set(fips, e);
}

let totalCap = 0;
let totalEligible = 0;
let floorStates = 0;
for (const [, v] of treasuryByState) {
  totalCap += stateCap(v.eligible);
  totalEligible += v.eligible;
  if (v.eligible > 0 && v.eligible < 100) floorStates++;
}
console.log(`\n--- designation capacity, from Treasury's eligible counts ---`);
console.log(`  jurisdictions              : ${treasuryByState.size}`);
console.log(`  eligible tracts nationally : ${totalEligible.toLocaleString("en-US")}`);
console.log(`  designations permitted      : ${totalCap.toLocaleString("en-US")}  (${((totalCap / totalEligible) * 100).toFixed(1)}% of eligible)`);
console.log(`  jurisdictions on the small-state floor: ${floorStates}`);

const ranked = [...treasuryByState.entries()]
  .map(([fips, v]) => ({ fips, ...v, cap: stateCap(v.eligible) }))
  .sort((a, b) => b.eligible - a.eligible);
console.log(`\n  most eligible tracts:`);
for (const s of ranked.slice(0, 8)) {
  console.log(`   ${s.name.padEnd(22)} eligible ${String(s.eligible).padStart(5)}  cap ${String(s.cap).padStart(4)}`);
}
console.log(`\n  fewest (small-state floor territory):`);
for (const s of ranked.slice(-6)) {
  console.log(`   ${s.name.padEnd(22)} eligible ${String(s.eligible).padStart(5)}  cap ${String(s.cap).padStart(4)}`);
}
