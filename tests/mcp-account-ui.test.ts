// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import axe from "axe-core";
import { AccountAccess, AccountSettings } from "@/app/ui/AccountAccess";
import McpConsent from "@/app/ui/McpConsent";
import { TERMS_VERSION } from "@/lib/content/siteTerms";
import { summarizeAllowance } from "@/lib/access/allowance";
import AccountCenter from "@/app/ui/AccountCenter";
import { PREFERENCE_STORAGE, readPreferences } from "@/app/ui/DevicePreferences";

const location = vi.hoisted(() => ({ path: "/use-with-claude" }));
vi.mock("next/navigation", () => ({ usePathname: () => location.path }));
vi.mock("@simplewebauthn/browser", () => ({ startAuthentication: async () => ({ test: true }), startRegistration: async () => ({ test: true }) }));
let root: Root, container: HTMLDivElement;
let member: boolean, issued: number, revoked: boolean;
const connection = { id: "connection-1", label: "My chat app", created: Date.now(), accepted: Date.now(), expires: Date.now() + 86400000, lastUsed: null, version: TERMS_VERSION, digest: "fingerprint", status: "active" };
const settle = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 45)); }); };
async function click(text: string) {
  const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent === text)!;
  expect(button).toBeDefined(); await act(async () => button.click()); await settle();
}
beforeEach(() => {
  localStorage.clear();
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  member = false; issued = 0; revoked = false; location.path = "/use-with-claude";
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event("close")); };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/account") {
      if (!init?.method) return Response.json({ member, id: member ? "test-account" : undefined, termsCurrent: member, asOf: Date.now(), allowances: summarizeAllowance([{ action: "exports", at: Date.now() - 1000, amount: 2 }, { action: "export-rows", at: Date.now() - 1000, amount: 400 }], [], Date.now()), credentials: { count: 1 }, passkeys: [{ id: "test-passkey", label: "Laptop" }], recovery: { remaining: 4 }, sessions: [{ id: "session-1", current: 1, created: Date.now(), lastUsed: Date.now(), expires: Date.now() + 86400000 }], acceptances: [{ version: TERMS_VERSION, accepted: Date.now() }], downloads: [], mcpUsage: [{ name: "mcp-calls", used: 12, limit: 500, remaining: 488, nextReleaseAt: null }] });
      const body = JSON.parse(String(init.body));
      if (body.action === "options") return Response.json({ options: {} });
      if (body.action === "verify") { member = true; return Response.json({ ok: true }); }
      if (body.action === "logout") { member = false; return Response.json({ ok: true }); }
    }
    if (url === "/api/mcp-connections") {
      if (!init?.method) return Response.json({ connections: issued ? [{ ...connection, status: revoked ? "revoked" : "active" }] : [] });
      const body = JSON.parse(String(init.body));
      if (body.action === "create") { issued++; return Response.json({ id: connection.id, token: "test-private-token", expires: connection.expires }); }
      if (body.action === "revoke" || body.action === "revoke-all") { revoked = true; return Response.json({ revoked: true }); }
    }
    throw new Error("Unexpected test request");
  }));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe("account and MCP connection experience", () => {
  it("preserves a checked selection through login but requires a separate final issuance action", async () => {
    await act(async () => root.render(createElement(AccountAccess, null, createElement(McpConsent)))); await settle();
    const box = container.querySelector<HTMLInputElement>(".mcp-consent input[type=checkbox]")!;
    expect(box.checked).toBe(false);
    await act(async () => box.click());
    expect(container.textContent).toContain("Sign in to continue");
    await click("Sign in / create a free account"); expect(issued).toBe(0);
    await click("Sign in with a passkey"); expect(issued).toBe(0); expect(box.checked).toBe(true);
    expect(container.querySelector<HTMLDialogElement>("dialog")?.open).toBe(false);
    await click("Accept terms and create MCP token"); expect(issued).toBe(1);
    expect(container.querySelector<HTMLInputElement>(".mcp-consent input[readonly]")?.type).toBe("password");
    expect(localStorage.getItem("test-private-token")).toBeNull();
    await click("Dismiss token"); expect(container.querySelector(".mcp-consent input[readonly]")).toBeNull();
    await click("Revoke connection"); expect(revoked).toBe(true); expect(container.textContent).toContain("Connection revoked");
  });
  it("shows an accessible dedicated account page with security controls and connections", async () => {
    member = true; location.path = "/account";
    document.documentElement.lang = "en-US"; document.title = "My account";
    await act(async () => root.render(createElement(AccountAccess, null, createElement("main", null, createElement("h1", null, "My account"), createElement(AccountSettings), createElement(McpConsent), createElement(AccountCenter))))); await settle();
    expect(container.querySelector("dialog")).toBeNull();
    expect(container.querySelectorAll("#account-title")).toHaveLength(1);
    expect(container.textContent).toContain("Passkeys and security");
    expect(container.querySelector('.account-usage')?.textContent).toContain('2 / 3');
    expect(container.querySelector('.account-usage')?.textContent).toContain('400 / 1,000');
    expect(container.querySelector('.account-usage')?.textContent).toContain('400 / 5,000');
    expect(container.querySelector('.account-usage')?.textContent).toContain('600');
    expect(container.querySelector('.account-usage')?.closest('details')).toBeNull();
    expect(container.textContent).toContain("Delete account");
    expect(container.textContent).toContain("4 unused recovery codes available");
    expect(container.textContent).toContain("This website session");
    expect(container.textContent).toContain("Recent downloads");
    expect(container.textContent).toContain("488 remaining");
    expect(container.querySelector<HTMLInputElement>('input[type="email"]')).toBeNull();
    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations.map((item) => item.id)).toEqual([]);
  });
  it("saves validated preferences only on explicit action and applies the chosen display settings", async () => {
    await act(async () => root.render(createElement(AccountCenter))); await settle();
    const theme = container.querySelector<HTMLSelectElement>('#account-preferences select')!;
    await act(async () => { theme.value = "dark"; theme.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(localStorage.getItem(PREFERENCE_STORAGE)).toBeNull();
    await click("Save device preferences");
    expect(readPreferences().theme).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(container.textContent).toContain("Preferences saved on this device.");
    await click("Reset preferences");
    expect(localStorage.getItem(PREFERENCE_STORAGE)).toBeNull();
    expect(document.documentElement.dataset.theme).toBe("system");
    localStorage.setItem(PREFERENCE_STORAGE, JSON.stringify({ theme: "unsafe", columns: ["race", "population"], format: "exe" }));
    expect(readPreferences()).toMatchObject({ theme: "system", columns: ["population"], format: "zip" });
  });
  it("clears only device research after typed confirmation, preserving other settings", async () => {
    localStorage.setItem("oz-research-projects-v1", "[]"); localStorage.setItem("unrelated", "keep");
    await act(async () => root.render(createElement(AccountCenter))); await settle();
    const clear = [...container.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent === "Clear device research")!;
    expect(clear.disabled).toBe(true);
    const input = container.querySelector<HTMLInputElement>('#account-privacy input')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "CLEAR"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(clear.disabled).toBe(false);
    await act(async () => clear.click());
    expect(localStorage.getItem("oz-research-projects-v1")).toBeNull();
    expect(localStorage.getItem("unrelated")).toBe("keep");
    expect(container.textContent).toContain("Saved research removed");
  });
});
