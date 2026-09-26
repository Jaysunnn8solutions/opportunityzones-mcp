import { execSync } from "node:child_process";
import type { NextConfig } from "next";
import pkg from "./package.json";

/** The commit being built, from git or the host's build variables; empty if neither is there. */
function commit(): string {
  const fromHost = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.COMMIT_REF ?? process.env.GITHUB_SHA;
  if (fromHost) return fromHost.slice(0, 7);
  try {
    return execSync("git rev-parse --short=7 HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}

const nextConfig: NextConfig = {
  // Shown on the map and in the footer (lib/version.ts).
  env: {
    APP_VERSION: pkg.version,
    APP_COMMIT: commit(),
    APP_BUILT: new Date().toISOString().slice(0, 10),
  },
  // The committed pipeline outputs are read with fs at request time. Make sure
  // they are traced into every serverless function that needs them. The tract
  // payload is a columnar binary (.bin) plus small JSON sidecars, so both
  // extensions have to be listed.
  outputFileTracingIncludes: {
    "/api/**": ["./data/*.json", "./data/*.bin", "./data/oz1/REPORT.md"],
    "/mcp": ["./data/*.json", "./data/*.bin", "./data/oz1/REPORT.md"],
    "/tract/**": ["./data/*.json", "./data/*.bin"],
    // The site snapshot finds a tract's interior point in the boundary files.
    "/api/site": ["./public/boundaries/tracts/*.json"],
    // Rules and sources reads each saved source's retrieval date.
    "/rules": ["./legal/text/*.txt"],
  },
  // Map outlines built by the pipeline (pipeline/map/boundaries.ts). They change
  // once a year, are identical for every viewer, and carry nothing about users.
  headers() {
    return [
      {
        source: "/boundaries/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
      },
    ];
  },
};

export default nextConfig;
