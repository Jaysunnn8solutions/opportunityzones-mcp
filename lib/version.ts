/**
 * Which build is running, so a stale checkout or cached page is easy to spot.
 *
 * Set at build (or dev-server start) by next.config.ts from package.json and
 * git: the release number, the commit it was built from, and the build date.
 * A dev server keeps the values it started with, so after a `git pull` the
 * commit shown changes only once the server is restarted.
 */

export const APP_VERSION = process.env.APP_VERSION ?? "0.0.0";
export const APP_COMMIT = process.env.APP_COMMIT ?? "";
export const APP_BUILT = process.env.APP_BUILT ?? "";

/** "v0.2.0 · 062eb86 · 2026-09-26", leaving out whatever is unknown. */
export function versionLabel(version = APP_VERSION, commit = APP_COMMIT, built = APP_BUILT): string {
  return [`v${version}`, commit, built].filter(Boolean).join(" · ");
}
