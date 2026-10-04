/** Local UI inspection without the operator's database, accounts, or live data sources. */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, unlinkSync, rmdirSync } from "node:fs";
import path from "node:path";
const root = process.cwd();
mkdirSync(path.join(root, ".runtime"), { recursive: true });
const folder = mkdtempSync(path.join(root, ".runtime", "ui-preview-"));
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3107"], {
  stdio: "inherit", windowsHide: true,
  env: { ...process.env, NODE_ENV: "production", DATABASE_URL: "", VERCEL: "", OZ_ORIGIN: "http://127.0.0.1:3107", OZ_STORAGE_PATH: path.join(folder, "access.sqlite"), OZ_SINGLE_HOST: "1", OZ_OPERATOR_ACCOUNT_IDS: "", OZ_TRUSTED_IP_HEADER: "", OZ_TRUSTED_PROXY_VERIFIED: "", OZ_LIVE_PAUSED: "1", OZ_SIGNUP_PAUSED: "1", OZ_MCP_PAUSED: "1", OZ_OAUTH_ENABLED: "" },
});
process.on("SIGINT", () => child.kill()); process.on("SIGTERM", () => child.kill());
child.once("exit", (code) => {
  for (const file of readdirSync(folder)) unlinkSync(path.join(folder, file));
  rmdirSync(folder); process.exitCode = code ?? 0;
});
