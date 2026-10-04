import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Bound process/memory use on both large desktops and small hosted builders.
    maxWorkers: 2,
    environment: "node",
    setupFiles: ["./tests/access-setup.ts"],
    include: ["lib/**/*.test.ts", "pipeline/**/*.test.ts", "tests/**/*.test.ts", "app/**/*.test.ts"],
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
