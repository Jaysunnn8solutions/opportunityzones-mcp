import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  { files: ["app/**/*.{ts,tsx}"], rules: {
    "jsx-a11y/label-has-associated-control": ["error", { assert: "either", depth: 5 }],
    "jsx-a11y/no-noninteractive-element-interactions": "error",
  } },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // MapLibre's worker, copied from node_modules (scripts/copy-maplibre-worker.ts).
    "public/maplibre/**",
    // Archived copy of the same third-party generated worker; not application code.
    "public-old/maplibre/**",
  ]),
]);

export default eslintConfig;
