/**
 * Zip and spreadsheet readers. Federal sources ship as .zip, .xlsx and, for the
 * 2018 eligible-tract list, .xlsb, so the pipeline needs all three without
 * shelling out to anything platform-specific.
 */

import { createRequire } from "node:module";
import { unzipSync } from "fflate";

/**
 * The slice of SheetJS used here, typed locally. `xlsx` installs from
 * cdn.sheetjs.com as an optional dependency and only the pipeline reads
 * spreadsheets, so the app, the tests and type-check must not need it.
 */
interface SheetJs {
  read(data: Uint8Array, opts: { type: "buffer"; dense: boolean }): {
    SheetNames: string[];
    Sheets: Record<string, unknown>;
  };
  utils: {
    sheet_to_json<T>(
      sheet: unknown,
      opts: { header: 1; raw: boolean; defval: null; blankrows: boolean }
    ): T[];
  };
}

let sheetJs: SheetJs | undefined;

function loadSheetJs(): SheetJs {
  if (sheetJs) return sheetJs;
  try {
    sheetJs = createRequire(import.meta.url)("xlsx") as SheetJs;
    return sheetJs;
  } catch (err) {
    if ((err as { code?: string }).code !== "MODULE_NOT_FOUND") throw err;
    throw new Error(
      "Reading spreadsheets needs the optional `xlsx` package, which installs from " +
        "cdn.sheetjs.com. Run `npm install` with that host reachable."
    );
  }
}

/** Every file in a zip whose name matches, decoded as UTF-8 text. */
export function unzipText(buf: Uint8Array, match: RegExp): Array<{ name: string; text: string }> {
  const files = unzipSync(buf, { filter: (f) => match.test(f.name) });
  const decoder = new TextDecoder("utf-8");
  return Object.entries(files).map(([name, bytes]) => ({ name, text: decoder.decode(bytes) }));
}

/** Every file in a zip whose name matches, as raw bytes. */
export function unzipBytes(buf: Uint8Array, match: RegExp): Array<{ name: string; bytes: Uint8Array }> {
  const files = unzipSync(buf, { filter: (f) => match.test(f.name) });
  return Object.entries(files).map(([name, bytes]) => ({ name, bytes }));
}

export interface Sheet {
  name: string;
  /** Rows of raw cell values; numbers stay numbers, blanks are null. */
  rows: unknown[][];
}

/** Every worksheet in an .xlsx or .xlsb workbook. */
export function readWorkbook(buf: Uint8Array): Sheet[] {
  const XLSX = loadSheetJs();
  const wb = XLSX.read(buf, { type: "buffer", dense: true });
  return wb.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], {
      header: 1,
      raw: true,
      defval: null,
      blankrows: false,
    }),
  }));
}

/**
 * Find the header row in a sheet that has a title block above the table, by
 * looking for the first row containing every required label.
 */
export function findHeaderRow(rows: unknown[][], required: readonly RegExp[]): number {
  for (let i = 0; i < Math.min(rows.length, 50); i++) {
    const cells = rows[i].map((c) => String(c ?? ""));
    if (required.every((re) => cells.some((c) => re.test(c)))) return i;
  }
  return -1;
}
