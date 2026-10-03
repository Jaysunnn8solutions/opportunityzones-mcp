/** Exercise the built server on loopback, without accepting terms or touching live accounts. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, readdirSync, unlinkSync, rmdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const root = process.cwd();
mkdirSync(path.join(root, ".runtime"), { recursive: true });
const folder = mkdtempSync(path.join(root, ".runtime", "launch-smoke-"));
const socket = createServer();
socket.listen(0, "127.0.0.1");
await once(socket, "listening");
const address = socket.address();
assert(address && typeof address !== "string");
const port = address.port;
await new Promise<void>((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()));
const origin = `http://127.0.0.1:${port}`;
const publicOrigin = "https://launch-check.invalid";
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: root, windowsHide: true, stdio: "ignore",
  env: { ...process.env, NODE_ENV: "production", OZ_ORIGIN: publicOrigin, DATABASE_URL: "", VERCEL: "",
    OZ_STORAGE_PATH: path.join(folder, "access.sqlite"), OZ_SINGLE_HOST: "1",
    OZ_TRUSTED_IP_HEADER: "", OZ_LIVE_PAUSED: "1", OZ_SIGNUP_PAUSED: "1",
    OZ_OAUTH_ENABLED: "", OZ_MCP_PAUSED: "" },
});
let exited = false;
const stopped = new Promise<void>((resolve) => {
  child.once("exit", () => { exited = true; resolve(); });
  child.once("error", () => { exited = true; resolve(); });
});
const checks: Array<{ name: string; status: number }> = [];
async function check(name: string, route: string, status: number, init?: RequestInit, privateResponse = false) {
  const response = await fetch(`${origin}${route}`, { ...init, redirect: "manual", signal: AbortSignal.timeout(10_000) });
  assert.equal(response.status, status, name);
  if (privateResponse) assert.match(response.headers.get("cache-control") ?? "", /private.*no-store/, `${name}: cache policy`);
  checks.push({ name, status });
  return response;
}
try {
  let ready = false;
  for (let i = 0; i < 80 && !exited; i++) {
    try { ready = (await fetch(`${origin}/api/consent`, { signal: AbortSignal.timeout(1000) })).ok; } catch { /* Startup only. */ }
    if (ready) break;
    await delay(250);
  }
  assert(ready && !exited, "Isolated production server must start");
  for (const route of ["/entry", "/entry/agreement", "/legal", "/account"]) await check(`Public ${route}`, route, 200);
  const consent = await check("No implicit consent", "/api/consent", 200);
  const initial = await consent.json();
  assert.equal(initial.accepted, false);
  for (const route of ["/", "/map", "/compare", "/workbench", "/tract/13089020100"]) {
    const response = await check(`Protected page ${route}`, route, 307, undefined, true);
    assert.equal(new URL(response.headers.get("location")!, origin).pathname, "/entry");
  }
  await check("RSC cannot bypass consent", "/map?_rsc=launch-check", 307, { headers: { RSC: "1" } }, true);
  for (const route of ["/api/explore/all", "/api/status/13", "/api/tract/13089020100", "/boundaries/tracts/13.json", "/api/exports"]) {
    await check(`Protected data ${route}`, route, 401, undefined, true);
  }
  await check("Anonymous connections denied", "/api/mcp-connections", 401);
  await check("Anonymous MCP denied", "/mcp", 401, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }) });
  await check("Foreign origin denied", "/api/consent", 403, { method: "POST", headers: { Origin: "https://foreign.invalid", "Content-Type": "application/json" }, body: "{}" });
  await check("Unchecked agreement denied", "/api/consent", 400, { method: "POST", headers: { Origin: publicOrigin, "Content-Type": "application/json" }, body: JSON.stringify({ accepted: false, version: initial.version, channel: "web" }) });
  assert.equal((await (await check("Consent still absent", "/api/consent", 200)).json()).accepted, false);
  const report = { checked: new Date().toISOString(), checks, limitations: ["Loopback production build only; no public proxy, TLS, CDN, browser, device, passkey, or external chat-client verification.", "No terms accepted or credentials created; authenticated success paths are covered separately by automated tests."] };
  writeFileSync(path.join(root, ".runtime", "release-smoke.json"), JSON.stringify(report, null, 2));
  console.log(`Passed ${checks.length} production HTTP checks. Evidence: .runtime/release-smoke.json`);
} finally {
  if (!exited) child.kill();
  await stopped;
  // Only files in the unique test directory; never delete the operator's database.
  for (const name of readdirSync(folder)) unlinkSync(path.join(folder, name));
  rmdirSync(folder);
}
