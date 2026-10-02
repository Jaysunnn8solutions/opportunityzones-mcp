// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import axe from "axe-core";
import { AccountAccess, AccountSettings } from "@/app/ui/AccountAccess";
import McpConsent from "@/app/ui/McpConsent";
import { TERMS_VERSION } from "@/lib/content/siteTerms";

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
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  member = false; issued = 0; revoked = false; location.path = "/use-with-claude";
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new Event("close")); };
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/account") {
      if (!init?.method) return Response.json({ member, id: member ? "test-account" : undefined, termsCurrent: member, credentials: { count: 1 }, passkeys: [{ id: "test-passkey" }] });
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
    await act(async () => root.render(createElement(AccountAccess, null, createElement("main", null, createElement("h1", null, "My account"), createElement(AccountSettings), createElement(McpConsent))))); await settle();
    expect(container.querySelector("dialog")).toBeNull();
    expect(container.querySelectorAll("#account-title")).toHaveLength(1);
    expect(container.textContent).toContain("Passkeys and security");
    expect(container.textContent).toContain("Delete account");
    expect(container.querySelector<HTMLInputElement>('input[type="email"]')).toBeNull();
    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations.map((item) => item.id)).toEqual([]);
  });
});
