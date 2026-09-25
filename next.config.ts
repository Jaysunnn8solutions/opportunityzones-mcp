import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The committed pipeline outputs are read with fs at request time. Make sure
  // they are traced into every serverless function that needs them. The tract
  // payload is a columnar binary (.bin) plus small JSON sidecars, so both
  // extensions have to be listed.
  outputFileTracingIncludes: {
    "/api/**": ["./data/*.json", "./data/*.bin", "./data/oz1/REPORT.md"],
    "/mcp": ["./data/*.json", "./data/*.bin", "./data/oz1/REPORT.md"],
    "/tract/**": ["./data/*.json", "./data/*.bin"],
  },
};

export default nextConfig;
