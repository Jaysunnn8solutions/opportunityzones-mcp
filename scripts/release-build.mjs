/** Stop on the first failed gate. Advisory lookup uses the free public npm registry. */
import { spawnSync } from "node:child_process";
const npm = process.env.npm_execpath;
if (!npm) throw new Error("Run with npm run release:build.");
for (const args of [["run", "security:audit"], ["run", "type-check"], ["run", "lint"], ["test"], ["run", "test:postgres"], ["run", "release:audit"], ["run", "recovery:drill"], ["run", "build"], ["run", "release:smoke"]]) {
  const result = spawnSync(process.execPath, [npm, ...args], { stdio: "inherit", windowsHide: true });
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
console.log("Local release gates passed. Hosting, real-device and external MCP-client checks remain separate.");
