import { brotliCompressSync, brotliDecompressSync, constants } from "node:zlib";
import { describe, expect, it } from "vitest";
import { decodePayload, encodePayload, type ColumnSpec } from "./columnar";

const share: ColumnSpec = { name: "povertyRate", type: "u16", scale: 1e-4 };
const score: ColumnSpec = { name: "gap", type: "i16", scale: 1e-3 };
const dollars: ColumnSpec = { name: "medianIncome", type: "u32" };
const flag: ColumnSpec = { name: "eligible", type: "u8" };
const wide: ColumnSpec = { name: "expectedLoss", type: "f32" };

describe("encode/decode round-trip", () => {
  const geoids = ["13121001100", "06001400100", "01001020100"];
  const payload = () =>
    decodePayload(
      encodePayload({
        geoids,
        columns: [
          { spec: share, values: [0.2314, 0.0521, null] },
          { spec: score, values: [1.234, -2.5, null] },
          { spec: dollars, values: [130000, null, 56432] },
          { spec: flag, values: [1, 0, null] },
          { spec: wide, values: [1234567.5, null, -0.25] },
        ],
      })
    );

  it("sorts tracts by GEOID and permutes every column to match", () => {
    const p = payload();
    expect(p.geoids).toEqual(["01001020100", "06001400100", "13121001100"]);
    // Alabama came last in the input and must carry its own values.
    expect(p.value("01001020100", "medianIncome")).toBe(56432);
    expect(p.value("13121001100", "medianIncome")).toBe(130000);
  });

  it("preserves leading zeros in GEOIDs", () => {
    // The delta encoding is numeric, so "01001020100" would come back as
    // "1001020100" without the pad. Alabama is state 01; getting this wrong
    // silently loses an entire state.
    const p = payload();
    expect(p.geoids[0]).toBe("01001020100");
    expect(p.geoids[0]).toHaveLength(11);
    expect(p.indexOf("01001020100")).toBe(0);
    expect(p.indexOf("1001020100")).toBe(-1);
  });

  it("round-trips shares at the quantized precision", () => {
    const p = payload();
    expect(p.value("13121001100", "povertyRate")).toBeCloseTo(0.2314, 6);
    expect(p.value("06001400100", "povertyRate")).toBeCloseTo(0.0521, 6);
  });

  it("round-trips signed scores", () => {
    const p = payload();
    expect(p.value("13121001100", "gap")).toBeCloseTo(1.234, 6);
    expect(p.value("06001400100", "gap")).toBeCloseTo(-2.5, 6);
  });

  it("keeps null distinct from zero in every column type", () => {
    const p = payload();
    // This is the property the eligibility test depends on.
    expect(p.value("01001020100", "povertyRate")).toBeNull();
    expect(p.value("01001020100", "gap")).toBeNull();
    expect(p.value("06001400100", "medianIncome")).toBeNull();
    expect(p.value("01001020100", "eligible")).toBeNull();
    expect(p.value("06001400100", "expectedLoss")).toBeNull();
    // A real zero survives as zero.
    expect(p.value("06001400100", "eligible")).toBe(0);
  });

  it("returns null for an unknown tract or column rather than throwing", () => {
    const p = payload();
    expect(p.value("99999999999", "povertyRate")).toBeNull();
    expect(p.value("13121001100", "nosuchcolumn")).toBeNull();
    expect(p.indexOf("99999999999")).toBe(-1);
  });

  it("exposes columns for whole-column scans without per-tract objects", () => {
    const p = payload();
    const col = p.columns.get("povertyRate")!;
    expect(col.raw.length).toBe(3);
    expect(col.spec.scale).toBe(1e-4);
  });
});

describe("validation", () => {
  it("rejects a column whose length does not match the tract count", () => {
    expect(() =>
      encodePayload({ geoids: ["01001020100"], columns: [{ spec: share, values: [0.1, 0.2] }] })
    ).toThrow(/has 2 values but there are 1 tracts/);
  });

  it("rejects duplicate column names", () => {
    expect(() =>
      encodePayload({
        geoids: ["01001020100"],
        columns: [
          { spec: share, values: [0.1] },
          { spec: share, values: [0.2] },
        ],
      })
    ).toThrow(/Duplicate column name/);
  });

  it("rejects duplicate GEOIDs", () => {
    expect(() =>
      encodePayload({
        geoids: ["01001020100", "01001020100"],
        columns: [{ spec: share, values: [0.1, 0.2] }],
      })
    ).toThrow(/Duplicate tract GEOID/);
  });

  it("refuses to silently clip a value out of the column's range", () => {
    // A rate accidentally expressed as a percentage rather than a share would
    // quantize to 231400 and overflow a u16. Better to fail the build than to
    // ship a wrapped number.
    expect(() =>
      encodePayload({ geoids: ["01001020100"], columns: [{ spec: share, values: [23.14] }] })
    ).toThrow(/outside u16 range/);
  });

  it("refuses a negative value in an unsigned column", () => {
    expect(() =>
      encodePayload({ geoids: ["01001020100"], columns: [{ spec: dollars, values: [-5] }] })
    ).toThrow(/outside u32 range/);
  });

  it("rejects a buffer that is not a payload", () => {
    expect(() => decodePayload(Buffer.from("not a payload at all"))).toThrow(/Not an OZ tract payload/);
  });
});

describe("payload at national scale", () => {
  // 85,000 tracts is the real thing. This checks the format holds at that size,
  // that alignment survives an odd number of columns, and that the compressed
  // size is inside the budget the Vercel deployment has to live in.
  const COUNT = 85_000;

  function national() {
    const geoids: string[] = [];
    // Realistic GEOID spread: 52 state codes, many counties, many tracts.
    let s = 1;
    let c = 1;
    let t = 100;
    for (let i = 0; i < COUNT; i++) {
      geoids.push(
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

    // xorshift32: exact on 32 bits. A textbook LCG's multiply overflows 2^53 in
    // JavaScript and degenerates into a short cycle, which would make this test
    // measure highly compressible data and pass a budget the real payload
    // could not meet.
    let seed = 0x9e3779b9;
    const rand = () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      seed |= 0;
      return (seed >>> 0) / 0x100000000;
    };

    const columns = [];
    // 20 shares, 20 z-scores, 10 dollar figures, 10 flags: ~60 fields, the
    // shape the scoring model will actually produce.
    for (let i = 0; i < 20; i++) {
      columns.push({
        spec: { name: `share${i}`, type: "u16" as const, scale: 1e-4 },
        values: Array.from({ length: COUNT }, () => (rand() < 0.02 ? null : rand())),
      });
    }
    for (let i = 0; i < 20; i++) {
      columns.push({
        spec: { name: `z${i}`, type: "i16" as const, scale: 1e-3 },
        values: Array.from({ length: COUNT }, () => (rand() < 0.02 ? null : rand() * 6 - 3)),
      });
    }
    for (let i = 0; i < 10; i++) {
      columns.push({
        spec: { name: `dollars${i}`, type: "u32" as const },
        values: Array.from({ length: COUNT }, () =>
          rand() < 0.02 ? null : Math.round(rand() * 250000)
        ),
      });
    }
    for (let i = 0; i < 10; i++) {
      columns.push({
        spec: { name: `flag${i}`, type: "u8" as const },
        values: Array.from({ length: COUNT }, () => (rand() < 0.5 ? 1 : 0)),
      });
    }
    return { geoids, columns };
  }

  it("encodes, compresses and decodes 85,000 tracts inside the serving budget", () => {
    const input = national();
    const buf = encodePayload(input);
    // Quality 5, not the pipeline's 11: q11 on 11 MB of incompressible bytes
    // takes ~15 s, and this test is about the format holding at scale, not about
    // the last few percent. `scripts/measure-payload.ts` reports the real q11
    // figure.
    const compressed = brotliCompressSync(buf, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 5 },
    });

    // Budget, not a loose bound: `npx tsx scripts/measure-payload.ts` measures
    // 10.87 MB raw and 7.5 MB brotli for this shape, white noise being the worst
    // case the format can hit. These ceilings leave room for a few more fields
    // and fail the build if someone adds a column that blows the serving budget.
    expect(buf.length).toBeLessThan(16 * 1024 * 1024);
    expect(compressed.length).toBeLessThan(12 * 1024 * 1024);

    const p = decodePayload(brotliDecompressSync(compressed));
    expect(p.count).toBe(COUNT);
    expect(p.geoids).toHaveLength(COUNT);

    // Spot-check that the sort and the permutation agree at scale.
    const probe = input.geoids[42_000];
    const expected = input.columns[0].values[42_000];
    const got = p.value(probe, "share0");
    if (expected == null) expect(got).toBeNull();
    else expect(got).toBeCloseTo(expected, 4);
  }, 60_000);

  it("binary-searches a GEOID without building a Map of 85,000 keys", () => {
    const input = national();
    const p = decodePayload(encodePayload(input));
    expect(p.indexOf(input.geoids[0])).toBeGreaterThanOrEqual(0);
    expect(p.indexOf(input.geoids[COUNT - 1])).toBeGreaterThanOrEqual(0);
    expect(p.indexOf("99999999999")).toBe(-1);
  });
});
