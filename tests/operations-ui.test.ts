// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import axe from "axe-core";
import OperatorConsole from "@/app/ui/OperatorConsole";
import ServiceStatus from "@/app/ui/ServiceStatus";
import ConnectionNotice from "@/app/ui/ConnectionNotice";
const account = vi.hoisted(() => ({ member: true, operator: true }));
vi.mock("@/app/ui/AccountAccess", () => ({ useAccount: () => ({ account }) }));
let root: ReturnType<typeof createRoot> | undefined;
afterEach(async () => { if (root) await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren(); vi.unstubAllGlobals(); account.operator = true; });
async function render(component: React.ReactElement) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  document.documentElement.lang = "en-US"; document.title = "Operations check";
  const container = document.createElement("main"); document.body.append(container); root = createRoot(container);
  await act(async () => root!.render(createElement("section", null, createElement("h1", null, "Service management"), component)));
}
it("shows no operator controls to ordinary accounts", async () => {
  account.operator = false;
  await render(createElement(OperatorConsole));
  expect(document.body.textContent).toContain("separately authorized");
  expect(document.querySelector("button")).toBeNull();
});
it("labels loaded operator controls and requires explicit confirmation for account actions", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ asOf: Date.now(), accounts: { count: 2 }, exports: { count: 0, bytes: 0 }, usage: [], failures: [], audit: [], paused: { exports: false, signup: false, mcp: false }, proxy: { configured: false, verified: false }, storage: "SQLite", storageNote: "Local test" })));
  await render(createElement(OperatorConsole));
  await act(async () => document.querySelector<HTMLButtonElement>("button")!.click());
  const apply = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent === "Apply account change")!;
  expect(apply.disabled).toBe(true);
  for (const control of document.querySelectorAll<HTMLInputElement>("input,select")) expect(control.labels?.length).toBeGreaterThan(0);
  const result = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] }, rules: { "color-contrast": { enabled: false } } });
  expect(result.violations.map((v) => v.id)).toEqual([]);
});
it("shows an honest status failure with retry and preserves an offline notice", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
  await render(createElement("div", null, createElement(ServiceStatus), createElement(ConnectionNotice)));
  expect(document.body.textContent).toContain("Status could not be loaded");
  expect(document.querySelector<HTMLButtonElement>("button")!.disabled).toBe(false);
  await act(async () => window.dispatchEvent(new Event("offline")));
  expect(document.body.textContent).toContain("Save on this device before refreshing");
  await act(async () => window.dispatchEvent(new Event("online")));
  expect(document.body.textContent).toContain("selections have not been reset");
});
