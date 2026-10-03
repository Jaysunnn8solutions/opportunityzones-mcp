import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["lib/access/**/*.test.ts", "lib/sources/gateway.test.ts", "app/mcp/route.test.ts", "lib/tools/researchExtensions.test.ts"],
    environment: "node",
    setupFiles: ["./tests/access-setup.ts"],
    env: { OZ_TEST_POSTGRES: "1", OZ_DATA_DIR: path.resolve(import.meta.dirname, "data") },
    maxWorkers: 2,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
  resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
});
