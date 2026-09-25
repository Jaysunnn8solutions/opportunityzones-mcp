/**
 * Minimal delimited-text I/O for the pipeline's tidy tables.
 *
 * Every cleaned table is a CSV with a header row, GEOIDs as quoted-if-needed
 * strings, and empty cells for nulls. Nulls stay empty rather than becoming 0 or
 * "NA", so a suppressed estimate can never be read back as a real zero.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export type Cell = string | number | boolean | null | undefined;

function formatCell(v: Cell): string {
  if (v == null) return "";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "";
    // Trim float noise without losing precision a downstream ratio needs.
    return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e8) / 1e8);
  }
  if (typeof v === "boolean") return v ? "1" : "0";
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function writeCsv(file: string, header: readonly string[], rows: Iterable<readonly Cell[]>): number {
  mkdirSync(path.dirname(file), { recursive: true });
  const lines = [header.join(",")];
  let n = 0;
  for (const r of rows) {
    if (r.length !== header.length) {
      throw new Error(`Row ${n} of ${path.basename(file)} has ${r.length} cells, header has ${header.length}`);
    }
    lines.push(r.map(formatCell).join(","));
    n++;
  }
  writeFileSync(file, lines.join("\n") + "\n");
  return n;
}

/** Split one line on a delimiter, honouring double-quoted fields. */
export function splitLine(line: string, delim = ","): string[] {
  if (!line.includes('"')) return line.split(delim);
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

export interface Table {
  header: string[];
  rows: string[][];
  /** Column index by name; throws on a missing column so schema drift is loud. */
  col(name: string): number;
}

export function parseDelimited(text: string, delim = ","): Table {
  // Strip a UTF-8 byte-order mark; several Census files carry one.
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = clean.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) throw new Error("Empty table");
  const header = splitLine(lines[0], delim).map((h) => h.trim());
  const rows = lines.slice(1).map((l) => splitLine(l, delim));
  return {
    header,
    rows,
    col(name) {
      const i = header.indexOf(name);
      if (i < 0) throw new Error(`Column "${name}" not found; have ${header.join(", ")}`);
      return i;
    },
  };
}

export function readCsv(file: string): Table {
  return parseDelimited(readFileSync(file, "utf8"), ",");
}

/** Parse a cell to a finite number or null. Empty and non-numeric are null. */
export function num(s: string | undefined): number | null {
  if (s == null) return null;
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Normalise a tract GEOID to 11 characters. Spreadsheets store GEOIDs as
 * numbers and drop the leading zero for states 01-09, which would silently
 * orphan every tract in Alabama through Connecticut.
 */
export function tractGeoid(raw: unknown): string | null {
  if (raw == null) return null;
  let s = typeof raw === "number" ? String(Math.round(raw)) : String(raw).trim();
  if (s.includes(".")) s = s.split(".")[0];
  if (!/^\d{10,11}$/.test(s)) return null;
  return s.padStart(11, "0");
}
