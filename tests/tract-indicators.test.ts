// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import axe from "axe-core";
import TractIndicators from "@/app/ui/TractIndicators";
import { tractIndicators } from "@/lib/data/indicators";
import { getTract, loadTractData } from "@/lib/data/tracts";

const data = loadTractData();
const geoid = data.payload.geoids.find((_, i) => (data.payload.columns.get("oz2018_population_share")?.get(i) ?? 0) >= .5 && data.payload.columns.get("eligible_2027")?.get(i) === 0)!;
const analysis = tractIndicators(getTract(geoid)!, data);
const host = document.createElement("main");
document.body.append(host);
const root = createRoot(host);
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(async () => { await act(async () => root.render(null)); });

it("shows the historical-ineligible explanation in the compact popup", async () => {
  await act(async () => root.render(createElement(TractIndicators, { analysis, compact: true })));
  expect(host.textContent).toContain("2018 overlap · not eligible for 2027");
  expect(host.textContent).toContain("not a finding that a prior designation has been revoked");
  expect(host.textContent).not.toContain("selection probability");
});

it("keeps data and outlook visible, labels geography and limitations, and passes structural accessibility", async () => {
  await act(async () => root.render(createElement(TractIndicators, { analysis })));
  expect(host.querySelector("details")).toBeNull();
  expect(host.textContent).toContain("Likelihood: insufficient evidence to estimate");
  expect(host.textContent).toContain("County context, not construction within this tract");
  expect(host.textContent).toContain("not actual starts or completions");
  expect(host.querySelectorAll("tbody tr")).toHaveLength(6);
  expect(host.querySelectorAll(".indicator-model")).toHaveLength(3);
  const result = await axe.run(host, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] }, rules: { "color-contrast": { enabled: false } } });
  expect(result.violations.map((v) => v.id)).toEqual([]);
});
