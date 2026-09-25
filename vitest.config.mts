import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "pipeline/**/*.test.ts", "tests/**/*.test.ts"],
    env: {
      // Let the integration tests find the committed data regardless of cwd.
      OZ_DATA_DIR: path.resolve(import.meta.dirname, "data"),
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname),
    },
  },
});
