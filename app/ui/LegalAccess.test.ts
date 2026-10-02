import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import LegalAccess from "./LegalAccess";
import LegalDocument from "./LegalDocument";
import { DISCLAIMER_SECTIONS, TERMS_SECTIONS, PRIVACY_SECTIONS } from "@/lib/content/siteTerms";

const navigation = vi.hoisted(() => ({ path: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.path }));

describe("legal entry boundary", () => {
  it("does not render research controls before acknowledgment", () => {
    navigation.path = "/map";
    const html = renderToStaticMarkup(createElement(LegalAccess, null, createElement("p", null, "PRIVATE_RESEARCH_CONTENT")));
    expect(html).not.toContain("PRIVATE_RESEARCH_CONTENT");
    expect(html).toContain("I agree and enter");
    expect(html).toMatch(/type="submit"[^>]*disabled/);
    expect(html).not.toMatch(/type="checkbox"[^>]*checked/);
    expect(html).toContain("I do not agree");
  });
  it("keeps the dedicated legal page accessible without acceptance", () => {
    navigation.path = "/legal";
    const html = renderToStaticMarkup(createElement(LegalAccess, null, createElement("p", null, "LEGAL_DOCUMENT")));
    expect(html).toContain("LEGAL_DOCUMENT");
    expect(html).not.toContain("I agree and enter");
  });
  it("includes every legal section in both entry disclosure and the standalone document", () => {
    for (const compact of [false, true]) {
      const html = renderToStaticMarkup(createElement(LegalDocument, { compact }));
      for (const section of [...DISCLAIMER_SECTIONS, ...TERMS_SECTIONS, ...PRIVACY_SECTIONS]) expect(html).toContain(`id="${compact ? "entry-" : ""}${section.id}"`);
    }
  });
});
