/**
 * Size and speed budget for the committed tract payload.
 *
 * The whole serving design rests on one claim: ~85,000 tracts with ~60 fields
 * fit a Vercel deployment and decode fast enough to answer a request on a cold
 * start. This script measures that claim against synthetic data shaped like the
 * real thing, so the number can be re-checked whenever a field is added.
 *
 *   npx tsx scripts/measure-payload.ts
 */

import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { decodePayload, encodePayload, type ColumnSpec } from "../lib/data/columnar";

const COUNT = 85_000;

function syntheticGeoids(): string[] {
  const out: string[] = [];
  let s = 1;
  let c = 1;
  let t = 100;
  for (let i = 0; i < COUNT; i++) {
    out.push(
      `${String(s).padStart(2, "0")}${String(c).padStart(3, "0")}${String(t).padStart(6, "0")}`
    );
    t += 100;
    if (t > 999900) {
      t = 100;
      c += 1;
    }
    if (c > 999) {
      c = 1;
      s += 1;
    }
  }
  return out;
}

/**
 * xorshift32. Bitwise operations are exact on 32 bits, unlike a textbook LCG
 * whose multiply overflows 2^53 in JavaScript and silently degenerates into a
 * short, highly compressible cycle — which would make this whole measurement
 * report a compression ratio the real data could never reach.
 */
let seed = 0x9e3779b9;
function rand(): number {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  seed |= 0;
  return (seed >>> 0) / 0x100000000;
}
const SEED0 = seed;

/**
 * Real tract data sits between two extremes and neither alone is an honest
 * estimate, so both are measured.
 *
 * White noise is the pessimistic bound: every tract independent, nothing for the
 * compressor to find. An AR(1) series is the optimistic one: the payload is
 * ordered by GEOID, which is roughly geographic, so neighboring tracts do
 * resemble each other. `phi` is deliberately moderate — a near-1.0 walk produces
 * absurdly compressible data and a number that would not survive contact with
 * the real pipeline.
 */
type Shape = "noise" | "autocorrelated";

function series(shape: Shape, phi = 0.5): () => number {
  let prev = 0.5;
  if (shape === "noise") return rand;
  return () => {
    prev = phi * prev + (1 - phi) * rand();
    return Math.min(1, Math.max(0, prev));
  };
}

function syntheticColumns(shape: Shape) {
  const columns: { spec: ColumnSpec; values: (number | null)[] }[] = [];
  const nullRate = 0.02;
  const fill = (f: () => number) =>
    Array.from({ length: COUNT }, () => (rand() < nullRate ? null : f()));

  for (let i = 0; i < 20; i++) {
    const s = series(shape);
    columns.push({ spec: { name: `share${i}`, type: "u16", scale: 1e-4 }, values: fill(s) });
  }
  for (let i = 0; i < 20; i++) {
    const s = series(shape);
    columns.push({
      spec: { name: `z${i}`, type: "i16", scale: 1e-3 },
      values: fill(() => s() * 6 - 3),
    });
  }
  for (let i = 0; i < 10; i++) {
    const s = series(shape);
    columns.push({
      spec: { name: `dollars${i}`, type: "u32" },
      values: fill(() => Math.round(s() * 250000)),
    });
  }
  for (let i = 0; i < 10; i++) {
    const s = series(shape);
    columns.push({ spec: { name: `flag${i}`, type: "u8" }, values: fill(() => (s() < 0.5 ? 1 : 0)) });
  }
  return columns;
}

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(2)} MB`;

const geoids = syntheticGeoids();

// Compressed size is the one number that depends on how lifelike the data is,
// so bracket it: white noise is the worst case the format can ever hit, and a
// moderately autocorrelated series is the best case worth believing.
for (const shape of ["noise", "autocorrelated"] as const) {
  seed = SEED0;
  const buf = encodePayload({ geoids, columns: syntheticColumns(shape) });
  const br = brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } });
  const gz = gzipSync(buf, { level: 9 });
  console.log(
    `${shape.padEnd(16)} raw ${mb(buf.length)}  gzip ${mb(gz.length)}  brotli ${mb(br.length)}`
  );
}
console.log(`\nThe real payload lands between those two. Timings below use white noise,`);
console.log(`the pessimistic case.\n`);

seed = SEED0;
const columns = syntheticColumns("noise");

const tEncode0 = performance.now();
const buf = encodePayload({ geoids, columns });
const tEncode = performance.now() - tEncode0;

const tBr0 = performance.now();
const br = brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } });
const tBr = performance.now() - tBr0;
const gz = gzipSync(buf, { level: 9 });

const tDecode0 = performance.now();
const payload = decodePayload(buf);
const tDecode = performance.now() - tDecode0;

const tLookup0 = performance.now();
let hits = 0;
for (let i = 0; i < 10_000; i++) {
  if (payload.indexOf(geoids[(i * 7919) % COUNT]) >= 0) hits++;
}
const tLookup = performance.now() - tLookup0;

// A full-column scan is what ranking every tract in the country costs.
const tScan0 = performance.now();
const col = payload.columns.get("z0")!;
let acc = 0;
for (let i = 0; i < payload.count; i++) {
  const v = col.get(i);
  if (v != null) acc += v;
}
const tScan = performance.now() - tScan0;

console.log(`tracts             ${COUNT.toLocaleString("en-US")}`);
console.log(`columns            ${columns.length}`);
console.log(`raw payload        ${mb(buf.length)}  (${(buf.length / COUNT).toFixed(1)} bytes/tract)`);
console.log(`gzip               ${mb(gz.length)}`);
console.log(`brotli q11         ${mb(br.length)}   <- committed size`);
console.log(``);
console.log(`encode             ${tEncode.toFixed(0)} ms   (pipeline only)`);
console.log(`brotli compress    ${tBr.toFixed(0)} ms   (pipeline only)`);
console.log(`decode to views    ${tDecode.toFixed(1)} ms   <- per cold start`);
console.log(`10k GEOID lookups  ${tLookup.toFixed(1)} ms  (${hits} hits)`);
console.log(`full column scan   ${tScan.toFixed(1)} ms  (sum ${acc.toFixed(0)})`);
