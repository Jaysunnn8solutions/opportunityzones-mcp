/** Offline synthetic SQLite backup/restore drill. Never opens configured storage. */
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, unlinkSync, rmdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { openStore, DAY } from "../lib/access/store";
import { quarantineRestoredAccess } from "../lib/access/restoreSafety";
const runtime = path.resolve(".runtime"); mkdirSync(runtime, { recursive: true });
const folder = mkdtempSync(path.join(runtime, "recovery-drill-"));
try {
  const original = path.join(folder, "synthetic.sqlite"), restored = path.join(folder, "restored.sqlite");
  const seed = openStore(original);
  await seed.prepare("INSERT INTO accounts VALUES('synthetic','test',?)").run(Date.now());
  await seed.prepare("INSERT INTO sessions VALUES('old-session','synthetic',?,?)").run(Date.now() + DAY, Date.now());
  await seed.prepare("INSERT INTO credentials VALUES('old-key','synthetic',?,0,'[]')").run(new Uint8Array([1, 2]));
  await seed.prepare("INSERT INTO recovery VALUES('old-recovery','synthetic')").run();
  await seed.prepare("INSERT INTO usage(subject,action,at,amount) VALUES('synthetic','exports',?,1)").run(Date.now());
  await seed.close(); // Checkpoint before copying a SQLite backup.
  copyFileSync(original, restored);
  const store = openStore(restored);
  try {
    assert.equal((await store.prepare("SELECT * FROM sessions").all()).length, 1);
    await quarantineRestoredAccess(store);
    for (const table of ["sessions", "credentials", "recovery"]) assert.equal((await store.prepare(`SELECT * FROM ${table}`).all()).length, 0);
    assert.equal((await store.prepare("SELECT * FROM usage").all()).length, 1);
    assert.equal((await store.prepare("SELECT value FROM settings WHERE key='mcp-paused'").get())?.value, "1");
    writeFileSync(path.join(runtime, "recovery-drill.json"), JSON.stringify({ checked: new Date().toISOString(), passed: true, backend: "synthetic SQLite file backup", limitations: "Does not verify Neon backups, provider retention, production restore, or post-backup revocations. All restored credentials are quarantined; controlled reenrollment is required." }, null, 2));
    console.log("Synthetic backup restored and quarantined; credentials blocked and usage retained. Evidence: .runtime/recovery-drill.json");
  } finally { await store.close(); }
} finally {
  for (const file of readdirSync(folder)) unlinkSync(path.join(folder, file));
  rmdirSync(folder);
}
