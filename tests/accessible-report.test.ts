// @vitest-environment jsdom
import { expect, it } from "vitest";
import axe from "axe-core";
import { accessibleReport } from "@/lib/access/exports";
it("provides an offline semantic report and escapes values without executing content", async () => {
  const html = accessibleReport([{ geoid: "10001040100", county: "<script>bad</script>", state: "Delaware", population: null }], ["population"], "2026-09-28", [{ name: "Census", publisher: "Census Bureau", vintage: "2020–2024", url: "https://www.census.gov" }]);
  const parsed = new DOMParser().parseFromString(html, "text/html");
  expect(parsed.querySelector("script")).toBeNull(); expect(parsed.querySelector("th")?.getAttribute("scope")).toBe("row");
  expect(parsed.querySelector("td")?.textContent).toBe("Not available"); expect(parsed.body.textContent).toContain("<script>bad</script>");
  document.documentElement.lang = "en-US"; document.title = "Selected tract research report"; document.body.innerHTML = parsed.body.innerHTML;
  const result = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] }, rules: { "color-contrast": { enabled: false } } });
  expect(result.violations.map((item) => item.id)).toEqual([]);
});
