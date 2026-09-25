import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { withTable } from "../scripts/readme-sources";

const readme = readFileSync(path.resolve(import.meta.dirname, "..", "README.md"), "utf8");

describe("README.md", () => {
  it("has a source table matching pipeline/sources.ts (run: npx tsx scripts/readme-sources.ts)", () => {
    expect(readme.replace(/\r\n/g, "\n")).toBe(withTable(readme).replace(/\r\n/g, "\n"));
  });

  it("states the disclaimer", () => {
    expect(readme).toMatch(/not investment, tax or legal advice/);
  });
});
