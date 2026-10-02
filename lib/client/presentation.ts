export const DISCLAIMER = "Informational only, not investment, tax or legal advice.";
export const RESEARCH_NOTICE = "Results reflect your selected criteria and published area-level data. They do not assess suitability for any person or recommend buying, renting, or investing.";

export function overlapLabel(share: number | null | undefined): string {
  if (share == null) return "2018 overlap unknown";
  if (share <= 0) return "No 2018 overlap";
  const percent = share < 0.01 ? "<1" : share < 1 ? String(Math.min(99, Math.round(share * 100))) : "100";
  return `${percent}% population overlap with 2018 zones`;
}

export function displayValue(value: number | null | undefined, unit: "usd" | "pct" | "count" = "count"): string {
  if (value == null || !Number.isFinite(value)) return "Not available";
  if (unit === "pct") return `${(value * 100).toFixed(1)}%`;
  return `${unit === "usd" ? "$" : ""}${Math.round(value).toLocaleString("en-US")}`;
}

export function dateLabel(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "Date not available";
  return new Date(value).toLocaleDateString("en-US", { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" });
}

export function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  // Spreadsheet software must treat user-entered addresses as text, not formulas.
  if (typeof value !== "number" && /^\s*[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
