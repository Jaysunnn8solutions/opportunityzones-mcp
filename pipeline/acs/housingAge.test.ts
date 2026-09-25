import { describe, expect, it } from "vitest";
import { BUILT_2020_LATER_MOE, shapeHousingAge, YEAR_BUILT } from "./housingAge";

function row(values: Partial<Record<keyof typeof YEAR_BUILT, number | null>>, moe: number | null = 12) {
  const r: Record<string, number | null> = { [BUILT_2020_LATER_MOE]: moe };
  for (const [k, code] of Object.entries(YEAR_BUILT)) r[code] = k in values ? values[k as keyof typeof YEAR_BUILT]! : 0;
  return r;
}

describe("shapeHousingAge", () => {
  it("computes shares of recent and pre-1980 stock", () => {
    const h = shapeHousingAge(
      row({ total: 1000, built2020Later: 50, built2010to2019: 150, built1970to1979: 100, built1939Earlier: 200 })
    );
    expect(h).toMatchObject({
      units: 1000,
      built2020Later: 50,
      built2020LaterMoe: 12,
      share2020Later: 0.05,
      share2010Later: 0.2,
      sharePre1980: 0.3,
    });
  });

  it("gives no shares for a tract without housing units", () => {
    const h = shapeHousingAge(row({ total: 0 }));
    expect(h.share2020Later).toBeNull();
    expect(h.sharePre1980).toBeNull();
  });

  it("keeps a suppressed category missing rather than counting it as zero", () => {
    const h = shapeHousingAge(row({ total: 500, built1950to1959: null }));
    expect(h.sharePre1980).toBeNull();
  });
});
