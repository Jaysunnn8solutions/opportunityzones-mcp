// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import axe from "axe-core";
import ExploreWorkspace from "@/app/ui/ExploreWorkspace";
import ComparisonRows from "@/app/ui/ComparisonRows";
import { ComparisonButton } from "@/app/ui/ResearchActions";
import { ResearchSession, useResearchState } from "@/app/ui/ResearchSession";
import { lookupPlace, type PlaceResult } from "@/lib/client/place";

const accountState = vi.hoisted(() => ({ member: true, resume: vi.fn(), open: vi.fn() }));
vi.mock("@/app/ui/AccountAccess", () => ({ useAccount: () => ({ account: { member: accountState.member }, open: accountState.open, resumeAfterSignIn: accountState.resume }) }));
vi.mock("@/lib/client/place", async (original) => ({ ...await original<typeof import("@/lib/client/place")>(), lookupPlace: vi.fn() }));
vi.mock("@/app/ui/MapApp", () => ({ default: ({ onSelect, matches }: { onSelect: (id: string) => void; matches: string[] | null }) => createElement("button", { onClick: () => onSelect("13001000100"), "data-map-matches": JSON.stringify(matches) }, "Select map tract") }));

const ids = Array.from({ length: 26 }, (_, i) => String(13001000100 + i));
const place: PlaceResult = {
  point: null, matched: null,
  profile: { geoid: ids[0], state: "Georgia", county: "Test County", rural: { treasury: null },
    designation2027: { status: "pending", text: "Eligible; designation not recorded.", stateEligible: 10, stateCap: 2 },
    measures: { population: { value: 4200, source: "acs5" }, median_household_income: { value: 60000, source: "acs5" } },
    sources: { acs5: { name: "ACS", publisher: "Census", geography: "tract", vintage: "2020–2024", url: "https://www.census.gov/programs-surveys/acs" } }, publishedAt: "2026-09-27" },
};
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const settle = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); }); };
const click = async (label: string) => {
  const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === label || b.getAttribute("aria-label") === label)!;
  expect(button, label).toBeDefined();
  await act(async () => { button.focus(); button.click(); });
  return button;
};
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  accountState.member = true; accountState.resume.mockReset(); vi.mocked(lookupPlace).mockReset();
  window.history.replaceState({}, "", "/map");
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
  vi.stubGlobal("cancelAnimationFrame", clearTimeout);
  vi.stubGlobal("scrollTo", vi.fn());
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value() { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value() { this.removeAttribute("open"); } });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("opens two compact tract actions, adds a comparison, then expands the report and restores focus on Escape", async () => {
  let resolve!: (value: PlaceResult) => void;
  vi.mocked(lookupPlace).mockImplementation(() => new Promise((done) => { resolve = done; }));
  await act(async () => root.render(createElement(ResearchSession, null, createElement(ExploreWorkspace, { states: [] })))); await settle();
  const trigger = await click("Select map tract");
  const designations = host.querySelector("aside fieldset")!;
  expect(designations.querySelector("legend")?.textContent).toBe("Designations");
  expect(designations.compareDocumentPosition(host.querySelector("aside .explorer-location")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(host.querySelector("dialog[open]")?.textContent).toContain("Loading this tract");
  await act(async () => resolve(place));
  const dialog = host.querySelector<HTMLDialogElement>(".tract-quick-view")!;
  expect(dialog.classList.contains("tract-quick-view-compact")).toBe(true);
  expect([...dialog.querySelectorAll(".tract-compact-actions button")].map((button) => button.textContent)).toEqual(["Add to comparison", "Detailed report"]);
  expect(dialog.textContent).not.toContain("4,200");
  expect(dialog.textContent).not.toContain("Export tract data");
  await click("Add to comparison");
  expect(dialog.textContent).toContain("1 / 25");
  const compactAudit = await axe.run(dialog, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] }, rules: { "color-contrast": { enabled: false } } });
  expect(compactAudit.violations.map((v) => v.id)).toEqual([]);
  await click("Detailed report");
  expect(dialog.classList.contains("tract-quick-view-compact")).toBe(false);
  expect(dialog.textContent).toContain("4,200"); expect(dialog.textContent).toContain("$60,000");
  expect(dialog.textContent).toContain("Census · 2020–2024");
  expect(dialog.textContent).toContain("View full tract report");
  expect(dialog.textContent).toContain("Export report / PDF"); expect(dialog.textContent).toContain("Export tract data");
  expect(document.activeElement).toBe(dialog.querySelector("h2"));
  expect(dialog.textContent).toContain("1 / 25");
  expect(dialog.querySelector('a[href="/compare"]')).not.toBeNull();
  const audit = await axe.run(dialog, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] }, rules: { "color-contrast": { enabled: false } } });
  expect(audit.violations.map((v) => v.id)).toEqual([]);
  await act(async () => dialog.dispatchEvent(new Event("cancel", { cancelable: true }))); await settle();
  expect(host.querySelector(".tract-quick-view")).toBeNull(); expect(document.activeElement).toBe(trigger);
  expect(host.querySelector(".comparison-tray")?.textContent).toContain("1 place selected");
});

it("ignores a lookup that completes after the popup was closed", async () => {
  let resolve!: (value: PlaceResult) => void;
  vi.mocked(lookupPlace).mockImplementation(() => new Promise((done) => { resolve = done; }));
  await act(async () => root.render(createElement(ResearchSession, null, createElement(ExploreWorkspace, { states: [] })))); await settle();
  await click("Select map tract"); await click("Close tract details and return to map");
  await act(async () => resolve(place));
  expect(host.querySelector(".tract-quick-view")).toBeNull();
  expect(new URLSearchParams(window.location.hash.slice(1)).has("t")).toBe(false);
});

it.each([false, true])("closes on a backdrop click, preserves interior clicks and drags, and restores map focus (detailed=%s)", async (detailed) => {
  vi.mocked(lookupPlace).mockResolvedValue(place);
  await act(async () => root.render(createElement(ResearchSession, null, createElement(ExploreWorkspace, { states: [] })))); await settle();
  const trigger = await click("Select map tract");
  await click("Add to comparison");
  if (detailed) await click("Detailed report");
  const dialog = host.querySelector<HTMLDialogElement>(".tract-quick-view")!;
  vi.spyOn(dialog, "getBoundingClientRect").mockReturnValue({ left: 100, right: 500, top: 100, bottom: 600, width: 400, height: 500, x: 100, y: 100, toJSON: () => ({}) });
  const pointer = (type: string, x: number, y: number) => dialog.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 }));
  expect(dialog.querySelector(".tract-quick-close-bar button")?.getAttribute("aria-label")).toBe("Close tract details and return to map");
  // Dialog padding is part of the popup, even when the event target is dialog.
  await act(async () => { pointer("pointerdown", 110, 110); pointer("click", 110, 110); });
  expect(dialog.isConnected).toBe(true);
  // A drag/text selection from inside to outside should not dismiss.
  await act(async () => { pointer("pointerdown", 200, 200); pointer("click", 50, 50); });
  expect(dialog.isConnected).toBe(true);
  await act(async () => { pointer("pointerdown", 50, 50); pointer("click", 200, 200); });
  expect(dialog.isConnected).toBe(true);
  await act(async () => { pointer("pointerdown", 50, 50); dialog.dispatchEvent(new Event("pointercancel", { bubbles: true })); pointer("click", 50, 50); });
  expect(dialog.isConnected).toBe(true);
  await act(async () => { pointer("pointerdown", 50, 50); pointer("click", 50, 50); }); await settle();
  expect(host.querySelector(".tract-quick-view")).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(host.querySelector(".comparison-tray")?.textContent).toContain("1 place selected");
  expect(new URLSearchParams(window.location.hash.slice(1)).has("t")).toBe(false);
});

it("shows comparison navigation only with selections and clears the shared list from either location", async () => {
  vi.mocked(lookupPlace).mockResolvedValue(place);
  await act(async () => root.render(createElement(ResearchSession, null, createElement(ExploreWorkspace, { states: [] })))); await settle();
  const nav = host.querySelector('.result-map .map-action-links')!;
  expect(nav.textContent).not.toContain("View Comparison List");
  expect(nav.textContent).not.toContain("View results as a list");
  await click("Select map tract");
  const dialog = host.querySelector("dialog")!;
  expect(dialog.textContent).not.toContain("View Comparison List");
  await click("Add to comparison");
  for (const container of [nav, dialog]) {
    expect(container.querySelector('a[href="/compare"]')?.textContent).toBe("View Comparison List");
    expect(container.textContent).toContain("Clear comparison list");
  }
  await act(async () => [...dialog.querySelectorAll("button")].find((button) => button.textContent === "Clear comparison list")!.click());
  expect(dialog.textContent).toContain("0 / 25");
  expect(dialog.textContent).toContain("Add to comparison");
  expect(nav.querySelector('a[href="/compare"]')).toBeNull();
  expect(document.activeElement).toBe(dialog.querySelector("h2"));
  await click("Add to comparison"); await click("Close tract details and return to map");
  await act(async () => [...nav.querySelectorAll("button")].find((button) => button.textContent === "Clear comparison list")!.click());
  expect(nav.querySelector('a[href="/compare"]')).toBeNull();
  expect(host.querySelector(".comparison-tray")).toBeNull();
});

function SelectionHarness({ seed }: { seed: string[] }) {
  const [selected, setSelected] = useResearchState<string[]>("comparison", []);
  return createElement("div", null, createElement("button", { onClick: () => setSelected(seed) }, "Seed selection"),
    createElement("output", null, selected.join(",")), createElement(ComparisonButton, { geoid: ids[24] }), createElement(ComparisonButton, { geoid: ids[25] }));
}
it("allows the 25th member selection, blocks the 26th, and allows removal", async () => {
  await act(async () => root.render(createElement(ResearchSession, null, createElement(SelectionHarness, { seed: ids.slice(0, 24) }))));
  await click("Seed selection"); await click("Add to comparison"); await click("Add to comparison");
  expect(host.querySelector("output")?.textContent).toBe(ids.slice(0, 25).join(","));
  expect(host.textContent).toContain("Compare up to 25");
  await click("Added to comparison ✓");
  expect(host.querySelector("output")?.textContent).toBe(ids.slice(0, 24).join(","));
});
it("keeps the public preview at two and offers sign-in to continue", async () => {
  accountState.member = false;
  await act(async () => root.render(createElement(ResearchSession, null, createElement(SelectionHarness, { seed: ids.slice(0, 2) }))));
  await click("Seed selection"); await click("Add to comparison");
  expect(host.querySelector("output")?.textContent).toBe(ids.slice(0, 2).join(","));
  expect(accountState.resume).toHaveBeenCalledOnce();
});
it("shows all 25 tract rows in selection order, with sources and individual removal", async () => {
  const order = ids.slice(0, 25).reverse(); const remove = vi.fn();
  const places = Object.fromEntries(order.map((id) => [id, { ...place, profile: { ...place.profile, geoid: id } }]));
  await act(async () => root.render(createElement(ResearchSession, null, createElement(ComparisonRows, { ids: order, places, keys: ["population"], brief: false, onRemove: remove }))));
  const rows = [...host.querySelectorAll("tbody tr")]; expect(rows).toHaveLength(25);
  expect(rows.map((row) => row.querySelector("strong")?.textContent)).toEqual(order);
  expect(rows[0].textContent).toContain("4,200"); expect(rows[0].textContent).toContain("Census · 2020–2024");
  await act(async () => rows[0].querySelector<HTMLButtonElement>("button")!.click()); expect(remove).toHaveBeenCalledWith(order[0]);
});

it("applies rural and designation filters nationwide without choosing a state, then narrows by state", async () => {
  const calls: { url: string; filters: { rural?: string; flags: string[]; eligibilityChange?: string } }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    const { filters } = JSON.parse(String(init.body)); calls.push({ url, filters });
    const matches = filters.eligibilityChange ? [ids[2]] : filters.flags.length ? [ids[1]] : filters.rural ? [ids[0], ids[1]] : ids.slice(0, 3);
    return Response.json({ matches, rows: [], total: matches.length, page: 0, pages: 0, counties: [], evidence: {}, diagnostics: [] });
  }));
  const states = [{ fips: "13", usps: "GA", name: "Georgia", eligible: 1, cap: 1, view: null }];
  const waitForSearch = async () => { await act(async () => { await new Promise((done) => setTimeout(done, 230)); }); };
  await act(async () => root.render(createElement(ResearchSession, null, createElement(ExploreWorkspace, { states })))); await settle(); await waitForSearch();
  expect(calls.at(-1)?.url).toBe("/api/explore/all");
  const map = host.querySelector("[data-map-matches]")!;
  expect(map.getAttribute("data-map-matches")).toBe("null");
  const rural = [...host.querySelectorAll<HTMLSelectElement>("aside select")].find((select) => select.querySelector('option[value="not-rural"]'))!;
  await act(async () => { rural.value = "not-rural"; rural.dispatchEvent(new Event("change", { bubbles: true })); }); await waitForSearch();
  expect(calls.at(-1)).toMatchObject({ url: "/api/explore/all", filters: { rural: "not-rural", flags: [] } });
  expect(JSON.parse(map.getAttribute("data-map-matches")!)).toEqual(ids.slice(0, 2));
  expect(host.textContent).toContain("2 tracts match nationwide");
  const designation = host.querySelector<HTMLInputElement>('aside input[type="checkbox"]')!;
  await act(async () => designation.click()); await waitForSearch();
  expect(calls.at(-1)?.filters).toMatchObject({ rural: "not-rural", flags: ["eligible"] });
  expect(JSON.parse(map.getAttribute("data-map-matches")!)).toEqual([ids[1]]);
  const state = host.querySelector<HTMLSelectElement>('[aria-label="Search state"]')!;
  await act(async () => { state.value = "13"; state.dispatchEvent(new Event("change", { bubbles: true })); }); await waitForSearch();
  expect(calls.at(-1)?.url).toBe("/api/explore/13");
  expect(calls.at(-1)?.filters).toMatchObject({ rural: "not-rural", flags: ["eligible"] });
  await act(async () => { state.value = ""; state.dispatchEvent(new Event("change", { bubbles: true })); }); await waitForSearch();
  expect(calls.at(-1)?.url).toBe("/api/explore/all");
  await click("Clear filters"); await waitForSearch();
  expect(map.getAttribute("data-map-matches")).toBe("null");
  const change = host.querySelector<HTMLSelectElement>('aside select:has(option[value="2018-ineligible2027"])')!;
  expect(change.querySelector<HTMLOptionElement>('option[value="2027-ineligible2037"]')?.disabled).toBe(true);
  await act(async () => { change.value = "2018-ineligible2027"; change.dispatchEvent(new Event("change", { bubbles: true })); }); await waitForSearch();
  expect(calls.at(-1)).toMatchObject({ url: "/api/explore/all", filters: { flags: [], eligibilityChange: "2018-ineligible2027" } });
  expect(JSON.parse(map.getAttribute("data-map-matches")!)).toEqual([ids[2]]);
  expect(JSON.parse(new URLSearchParams(window.location.hash.slice(1)).get("f")!).eligibilityChange).toBe("2018-ineligible2027");
  await click("Clear filters"); await waitForSearch();
  expect(change.value).toBe("");
  expect(map.getAttribute("data-map-matches")).toBe("null");
});
