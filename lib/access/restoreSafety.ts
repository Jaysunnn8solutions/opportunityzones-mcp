import type { Store } from "./database";
/** Run on an ISOLATED restored database BEFORE serving requests. Never restores access. */
export async function quarantineRestoredAccess(store: Store) {
  await store.transaction(async () => {
    await store.exec("DELETE FROM sessions; DELETE FROM challenges; DELETE FROM oauth_codes; DELETE FROM oauth_access; DELETE FROM recovery; DELETE FROM credentials; UPDATE consents SET revoked=1; DELETE FROM mcp_leases;");
    const accounts = await store.prepare("SELECT id FROM accounts").all() as { id: string }[];
    for (const { id } of accounts) await store.prepare("INSERT INTO settings VALUES(?, '1') ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(`account-disabled:${id}`);
    for (const key of ["exports-paused", "mcp-paused", "signup-paused"]) await store.prepare("INSERT INTO settings VALUES(?, '1') ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key);
    await store.prepare("DELETE FROM settings WHERE key IN ('allowance-secret','network-secret')").run();
  });
}
