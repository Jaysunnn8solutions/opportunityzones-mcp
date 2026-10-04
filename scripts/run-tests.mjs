import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { testEnvironment } from "./test-environment.mjs";

const runner = fileURLToPath(new URL("../node_modules/vitest/vitest.mjs", import.meta.url));
const result = spawnSync(process.execPath, [runner, ...process.argv.slice(2)], {
  env: testEnvironment(process.env), stdio: "inherit", windowsHide: true,
});
if (result.error) console.error("Unable to start the isolated test runner:", result.error.message);
process.exitCode = result.status ?? 1;
