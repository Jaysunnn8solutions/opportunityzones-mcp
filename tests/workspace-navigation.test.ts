// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import axe from "axe-core";
import Workbench from "@/app/ui/Workbench";
import { ResearchSession } from "@/app/ui/ResearchSession";
import { researchCatalog } from "@/lib/research/catalog";

vi.mock("@/app/ui/AccountAccess", () => ({ useAccount: () => ({ account: { member: false }, open: () => {}, resumeAfterSignIn: () => {} }) }));
it("takes a reviewed tract list into Prepare data, keeps it across remounts, and supports workspace deep-link actions", async () => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear(); window.history.replaceState({}, "", "/workbench#tab=list");
  const calls: unknown[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => { calls.push(JSON.parse(String(init?.body))); return Response.json({ matched: ["01001020100", "01001020200"], absent: [] }); }));
  const host = document.createElement("main"); document.body.append(host); const root = createRoot(host); const catalog = researchCatalog();
  const render = (key: string) => root.render(createElement(ResearchSession, null, createElement("h1", null, "Research workspace"), createElement(Workbench, { key, catalog })));
  const settle = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 45)); }); };
  const click = async (text: string) => { const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === text); expect(button, text).toBeDefined(); await act(async () => button!.click()); await settle(); };
  try {
    await act(async () => render("first")); await settle(); await settle();
    expect(host.textContent).toContain("Bring your own tract list");
    const input = host.querySelector<HTMLTextAreaElement>("textarea")!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, "01001020100\n01001020200\nprivate-invalid-entry"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    await click("Validate & match published tracts");
    expect(calls).toEqual([{ action: "match", geoids: ["01001020100", "01001020200"] }]);
    expect(host.textContent).toContain("1 invalid entries");
    await click("Use matched tracts for export");
    expect(host.querySelector('[aria-pressed="true"]')?.textContent).toBe("Prepare data");
    expect(host.textContent).toContain("2 explicitly selected tracts will be exported");
    expect(localStorage.getItem("oz-research-projects-v1")).toBeNull();
    await act(async () => render("second")); await settle(); await settle();
    expect(host.textContent).toContain("2 explicitly selected tracts will be exported");
    await act(async () => window.dispatchEvent(new CustomEvent("research-workspace-tab", { detail: "projects" })));
    expect(host.textContent).toContain("My research projects");
    document.documentElement.lang = "en-US"; document.title = "Research workspace test";
    const audit = await axe.run(host, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] }, rules: { "color-contrast": { enabled: false } } });
    expect(audit.violations.map((v) => v.id)).toEqual([]);
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});
