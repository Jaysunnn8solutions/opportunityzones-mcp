// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import axe from "axe-core";
import LegalAccess from "@/app/ui/LegalAccess";
import PlaceSearch from "@/app/ui/PlaceSearch";
import { FindAreas } from "@/app/ui/FindAreas";
import ResearchEntryTabs from "@/app/ui/ResearchEntryTabs";
import { ResearchSession } from "@/app/ui/ResearchSession";
import AccessibilityPage from "@/app/accessibility/page";
import ExploreWorkspace from "@/app/ui/ExploreWorkspace";
import { NO_FILTERS } from "@/lib/explore/filter";
import { isPublicLegalPage } from "@/lib/client/termsConsent";

const navigation = vi.hoisted(() => ({ path: "/map" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.path }));
vi.mock("@/app/ui/AccountAccess", () => ({ useAccount: () => ({ account: { member: false }, open: () => {} }) }));
vi.mock("@/app/ui/FrontDoor", () => ({ default: () => createElement("p", null, "Search controls") }));
vi.mock("@/app/ui/MapApp", () => ({ default: ({ viewControls }: { viewControls?: React.ReactNode }) => createElement("div", { className: "screening-map" }, viewControls) }));

afterEach(() => { document.body.replaceChildren(); navigation.path = "/map"; });
async function audit(element: React.ReactElement) {
  document.documentElement.lang = "en-US";
  document.title = "Accessibility regression check";
  document.body.innerHTML = renderToStaticMarkup(element);
  const result = await axe.run(document, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] },
    // jsdom has no visual layout or canvas. Real-browser contrast and reflow remain manual gates.
    rules: { "color-contrast": { enabled: false } },
  });
  expect(result.violations.map((v) => ({ rule: v.id, targets: v.nodes.map((n) => n.target) }))).toEqual([]);
}
const page = (child: React.ReactElement) => createElement("main", null, createElement("h1", null, "Research"), child);

describe("accessible entry and research controls", () => {
  it("has a labeled entry gate and semantic disclosures", async () => {
    await audit(createElement(LegalAccess, null, createElement("p", null, "Research behind consent")));
    expect(document.querySelector("#entry-agreement-title")?.nextElementSibling?.tagName).toBe("DETAILS");
    expect(document.querySelector<HTMLInputElement>(".consent-checkbox input")?.checked).toBe(false);
    expect(document.querySelector<HTMLButtonElement>(".entry-actions button")?.disabled).toBe(true);
    expect(document.querySelector<HTMLAnchorElement>(".entry-start-link")?.getAttribute("href")).toBe("/entry/agreement?next=%2F");
    expect(document.querySelector(".entry-start-link")?.hasAttribute("disabled")).toBe(false);
  });
  it("offers a standalone agreement with an unchecked acknowledgment and no research content", async () => {
    navigation.path = "/entry/agreement";
    await audit(createElement(LegalAccess, null, createElement("p", null, "Research behind consent")));
    expect(document.querySelector("h1")?.textContent).toBe("Review and acknowledge");
    expect(document.querySelector(".entry-introduction")).toBeNull();
    expect(document.querySelector(".entry-atmosphere")).toBeNull();
    expect(document.body.textContent).not.toContain("Research behind consent");
    expect(document.querySelector<HTMLInputElement>(".consent-checkbox input")?.checked).toBe(false);
    expect(document.querySelector<HTMLButtonElement>(".entry-actions button")?.disabled).toBe(true);
    expect(document.querySelector("#entry-agreement-title")?.nextElementSibling?.tagName).toBe("DETAILS");
  });
  it("associates a visible search label and persistent status region", async () => {
    await audit(page(createElement(PlaceSearch, { value: "", onChange: () => {}, onResult: () => {} })));
    const input = document.querySelector("input")!;
    expect(input.labels?.[0]?.textContent).toBe("Address or census tract");
    expect(document.getElementById(input.getAttribute("aria-describedby")!)?.getAttribute("role")).toBe("status");
  });
  it("labels filter controls and keeps duplicate filter instances independent", async () => {
    const props = { filters: { ...NO_FILTERS, flags: ["eligible", "qct"] as const }, onChange: () => {}, matches: 0, busy: false };
    const filters = { ...props, filters: { ...props.filters, flags: [...props.filters.flags] } };
    await audit(page(createElement("div", null, createElement(FindAreas, filters), createElement(FindAreas, filters))));
    const groups = [...document.querySelectorAll<HTMLInputElement>('input[type="radio"]')].map((input) => input.name);
    expect(new Set(groups).size).toBe(2);
  });
  it("keeps accessibility and connection instructions outside the consent gate", async () => {
    for (const path of ["/accessibility", "/accessibility/", "/use-with-claude", "/legal"]) expect(isPublicLegalPage(path)).toBe(true);
    expect(isPublicLegalPage("/map")).toBe(false);
    await audit(createElement(AccessibilityPage));
  });
  it("supports arrow, Home, and End keys on the research tabs", async () => {
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    try {
      await act(async () => { root.render(createElement(ResearchSession, null, createElement(ResearchEntryTabs, { states: [] }))); });
      const tabs = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
      tabs[0].focus();
      await act(async () => { tabs[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); });
      expect(document.activeElement).toBe(tabs[1]);
      expect(tabs[1].getAttribute("aria-selected")).toBe("true");
      await act(async () => { tabs[1].dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true })); });
      expect(document.activeElement).toBe(tabs[0]);
      await act(async () => { tabs[0].dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })); });
      expect(document.activeElement).toBe(tabs[1]);
    } finally { await act(async () => root.unmount()); }
  });
  it("offers a map-free results path and places the heading in the sidebar", async () => {
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const media = { matches: false, addEventListener() {}, removeEventListener() {} };
    vi.stubGlobal("matchMedia", () => media);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
    vi.stubGlobal("cancelAnimationFrame", clearTimeout);
    const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
    Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value() { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); } });
    try {
      await act(async () => { root.render(createElement(ResearchSession, null, createElement(ExploreWorkspace, { states: [] }))); });
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
      expect(container.querySelector("aside h1")?.textContent).toBe("Find areas");
      expect(container.querySelector<HTMLElement>(".result-list")?.hidden).toBe(true);
      const visibleView = (mode: string) => [...container.querySelectorAll<HTMLButtonElement>(`button[data-view="${mode}"]`)].find((control) => !control.closest("[hidden]"))!;
      await act(async () => { visibleView("list").click(); });
      expect(document.activeElement).toBe(visibleView("list"));
      await act(async () => { visibleView("map").click(); });
      expect(document.activeElement).toBe(visibleView("map"));
      await act(async () => { visibleView("map").click(); });
      const mapLinks = container.querySelector<HTMLElement>('.map-action-links[aria-label="Map results and other research methods"]')!;
      expect(mapLinks.closest(".screening-map")).toBeNull();
      expect(mapLinks.textContent).not.toContain("View Comparison List");
      expect(mapLinks.parentElement?.className).toBe("result-map");
      for (const label of ["Match a tract list", "Check a list of properties", "Research through chat"]) {
        expect(mapLinks.textContent).toContain(label);
        expect(container.querySelector("aside")?.textContent).not.toContain(label);
      }
      await act(async () => { visibleView("list").click(); });
      expect(container.querySelector<HTMLElement>(".result-list")?.hidden).toBe(false);
      expect(container.querySelector<HTMLElement>(".result-map")?.hidden).toBe(true);
      expect(document.activeElement).toBe(visibleView("list"));
      expect(container.querySelector(".result-list")?.textContent).toContain("Map interaction is not required");
      const result = await axe.run(container, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] }, rules: { "color-contrast": { enabled: false } } });
      expect(result.violations.map((v) => v.id)).toEqual([]);
    } finally {
      await act(async () => root.unmount()); vi.unstubAllGlobals();
      if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, "close", originalClose);
      else Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
    }
  });
});
