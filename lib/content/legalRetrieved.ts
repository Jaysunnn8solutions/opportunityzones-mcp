import { readFileSync } from "node:fs";
import path from "node:path";
import type { LegalSourceId } from "./rules";

/** The date each saved source text was read (its "Retrieved:" header), for server components. */
export function retrievedOn(id: LegalSourceId): string | null {
  try {
    const head = readFileSync(path.join(process.cwd(), "legal", "text", `${id}.txt`), "utf8").slice(0, 1000);
    return /^Retrieved: (\d{4}-\d{2}-\d{2})$/m.exec(head)?.[1] ?? null;
  } catch {
    return null;
  }
}
