import { vi } from "vitest";

// Unit tests never touch the operator's account database or upstream budgets.
vi.mock("@/lib/access/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/access/store")>();
  const store = process.env.OZ_TEST_POSTGRES === "1"
    ? (await import("@/lib/access/postgres")).createPostgresStore((await import("./postgres-driver")).localPostgresPool())
    : actual.openStore(":memory:");
  // A function's default arguments retain its original module bindings.
  // Override consume too, otherwise its default db() opens the runtime store.
  return { ...actual, db: () => store, consume: async (budgets: Parameters<typeof actual.consume>[0], database = store, now = Date.now()) => (await actual.consume(budgets, database, now)) };
});
vi.mock("@/lib/sources/gateway", () => ({ providerPermit: () => () => {}, providerBackoff: vi.fn() }));
