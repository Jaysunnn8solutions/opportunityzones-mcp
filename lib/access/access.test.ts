import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash, generateKeyPairSync, randomBytes, randomUUID, sign } from "node:crypto";
import { isoCBOR } from "@simplewebauthn/server/helpers";
import { verifyRegistrationResponse, type RegistrationResponseJSON } from "@simplewebauthn/server";
import { unzipSync, strFromU8 } from "fflate";
import { mkdtempSync, rmSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AccessError, DAY, consume, db, openStore, transaction } from "./store";
import { hashToken, sameOrigin } from "./http";
import { authorizeFilters, searchPage } from "./search";
import { buildExport, generateExport, prepareExport } from "./exports";
import { NO_FILTERS } from "@/lib/explore/filter";
import { loadTractData } from "@/lib/data/tracts";
import { TERMS_VERSION } from "@/lib/content/siteTerms";
import { POST as accountPost, GET as accountGet } from "@/app/api/account/route";
import { POST as exportPost } from "@/app/api/exports/route";
import { POST as searchPost, GET as publicMap } from "@/app/api/explore/[state]/route";

const origin = "http://localhost:3000";
function request(path: string, body: unknown, cookie = "", from = origin) { return new Request(`${origin}${path}`, { method: "POST", headers: { Origin: from, Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
async function member() { const id = randomUUID(), raw = randomUUID(); (await db().prepare("INSERT INTO accounts VALUES(?,?,?)").run(id, TERMS_VERSION, Date.now())); (await db().prepare("INSERT INTO sessions VALUES(?,?,?,?)").run(hashToken(raw), id, Date.now() + DAY, Date.now())); return { id, cookie: `oz_session=${raw}` }; }
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("persistent access budgets", () => {
  it("handles Next's normalized loopback URL without accepting foreign origins or loosening production", () => {
    vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("OZ_ORIGIN", "");
    const local = new Request(`${origin}/api/research`, { headers: { Host: "127.0.0.1:3000", Origin: "http://127.0.0.1:3000" } });
    expect(() => sameOrigin(local)).not.toThrow();
    expect(() => sameOrigin(new Request(`${origin}/api/research`, { headers: { Host: "foreign.example", Origin: "https://foreign.example" } }))).toThrow();
    expect(() => sameOrigin(new Request(`${origin}/api/research`, { headers: { Host: "127.0.0.1:3001", Origin: "http://127.0.0.1:3001" } }))).toThrow();
    vi.stubEnv("NODE_ENV", "production"); expect(() => sameOrigin(local)).toThrow(/configured/);
    vi.stubEnv("OZ_ORIGIN", "https://research.example"); expect(() => sameOrigin(local)).toThrow(/research website/);
  });
  it("accepts a port-omitting embedded browser only with matching local referrer and fetch metadata", () => {
    vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("OZ_ORIGIN", "");
    const headers = { Host: "127.0.0.1:3000", Origin: "http://127.0.0.1", Referer: "http://127.0.0.1:3000/entry/agreement?next=%2F", "Sec-Fetch-Site": "same-origin" };
    const request = (changes: Record<string, string> = {}) => new Request(`${origin}/api/consent`, { headers: { ...headers, ...changes } });
    expect(() => sameOrigin(request())).not.toThrow();
    for (const referer of ["http://127.0.0.1:3000/entry", "http://127.0.0.1:3000/legal", "http://127.0.0.1:3000/use-with-claude", "http://127.0.0.1:3000/map"]) {
      expect(() => sameOrigin(request({ Referer: referer }))).not.toThrow();
    }
    const rejectedHeaders: Record<string, string>[] = [
      { Referer: "" }, { Referer: "invalid" }, { Referer: "https://foreign.example/" },
      { Referer: "http://127.0.0.1:3001/" }, { "Sec-Fetch-Site": "same-site" }, { "Sec-Fetch-Site": "cross-site" },
      { "Sec-Fetch-Site": "" }, { Origin: "http://127.0.0.1:3001" }, { Origin: "null" },
      { Origin: "https://127.0.0.1" }, { Origin: "http://localhost" }, { Origin: "" },
    ];
    for (const changes of rejectedHeaders) expect(() => sameOrigin(request(changes))).toThrow(/research website/);
    vi.stubEnv("OZ_ORIGIN", "http://127.0.0.1:3000");
    expect(() => sameOrigin(request())).toThrow(/research website/);
    vi.stubEnv("NODE_ENV", "production");
    expect(() => sameOrigin(request())).toThrow(/research website/);
    expect(() => sameOrigin(request({ Origin: "http://127.0.0.1:3000" }))).not.toThrow();
  });
  it("preserves allowances across connections and process-style database reopen", async () => {
    const folder = mkdtempSync(join(tmpdir(), "oz-access-test-")); const path = join(folder, "access.sqlite");
    const budget = [{ subject: "a", action: "exports", limit: 1, window: DAY }];
    const first = openStore(path), second = openStore(path);
    try { (await consume(budget, first)); await expect(async () => (await consume(budget, second))).rejects.toThrow(/allowance/); }
    finally { (await first.close()); (await second.close()); }
    const reopened = openStore(path);
    try { await expect(async () => (await consume(budget, reopened))).rejects.toThrow(/allowance/); }
    finally { (await reopened.close()); for (const name of ["access.sqlite", "access.sqlite-wal", "access.sqlite-shm"]) rmSync(join(folder, name), { force: true }); rmdirSync(folder); }
  });
  it("enforces atomic overlapping row/count limits without recording failed reservations", async () => {
    const store = openStore(":memory:"); const now = 40 * DAY;
    const budgets = [{ subject: "a", action: "rows", amount: 500, limit: 1000, window: DAY }, { subject: "a", action: "rows", amount: 500, limit: 5000, window: 30 * DAY }];
    (await consume(budgets, store, now)); (await consume(budgets, store, now + 1));
    await expect(async () => (await consume(budgets, store, now + 2))).rejects.toThrow(AccessError);
    expect(((await store.prepare("SELECT COUNT(*) AS n FROM usage").get()) as { n: number }).n).toBe(2);
    (await consume(budgets, store, now + DAY + 2));
    await expect(async () => (await transaction(store, async () => { (await store.prepare("INSERT INTO usage(subject,action,at,amount) VALUES('a','test',?,1)").run(now)); throw new Error("generation failure"); }))).rejects.toThrow();
    expect((await store.prepare("SELECT * FROM usage WHERE action='test'").all())).toHaveLength(0);
    (await store.close());
  });
  it("rejects unsupported member-only filters on the server and provides only a bounded public list", () => {
    expect(() => authorizeFilters({ ...NO_FILTERS, tiers: { median_home_value: "higher25" } }, false)).toThrow(/free research account/);
    const page = searchPage("10", NO_FILTERS, "geoid", 0, false);
    expect(page.rows.length).toBeLessThanOrEqual(25);
    expect(page.rows.every((row) => row.length === 2)).toBe(true);
    expect(Object.values(page.tracts ?? {}).every((t) => Object.keys(t.values).length === 0)).toBe(true);
    expect(searchPage("10", NO_FILTERS, "geoid", 0, false)).toEqual(page);
  });
});

describe("server exports", () => {
  it("filters historical ineligibility nationwide for public browsing and preserves it in exports", async () => {
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No provider calls needed"); }));
    const filters = { ...NO_FILTERS, eligibilityChange: "2018-ineligible2027" as const };
    const response = await searchPost(request("/api/explore/all", { filters }), { params: Promise.resolve({ state: "all" }) });
    expect(response.status).toBe(200);
    const page = await response.json();
    const { payload } = loadTractData();
    const eligible = payload.columns.get("eligible_2027")!, overlap = payload.columns.get("oz2018_population_share")!;
    const expected = payload.geoids.filter((_, i) => eligible.get(i) === 0 && (overlap.get(i) ?? -1) >= .5);
    expect(page.matches).toEqual(expected);
    expect(page.total).toBeGreaterThan(0);
    expect(page.rows).toHaveLength(25);
    expect(page.evidence[page.rows[0][0]][0]).toMatchObject({ id: "eligibilityChange", result: "Meets" });
    const selection = prepareExport({ state: "all", filters, limit: 25 });
    expect(selection.total).toBe(expected.length);
    expect(selection.geoids).toEqual(expected.slice(0, 25));
    expect(selection.filters.eligibilityChange).toBe(filters.eligibilityChange);
    const unavailable = { ...NO_FILTERS, eligibilityChange: "2027-ineligible2037" };
    expect(() => authorizeFilters(unavailable, false)).toThrow(/no validated/);
    expect(() => prepareExport({ state: "all", filters: unavailable })).toThrow(/no validated/);
  });
  it("serves nationwide rural filtering from the published dataset without provider calls", async () => {
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Nationwide filtering must not call providers"); }));
    const response = await searchPost(request("/api/explore/all", { filters: { ...NO_FILTERS, rural: "not-rural" } }), { params: Promise.resolve({ state: "all" }) });
    expect(response.status).toBe(200);
    const page = await response.json();
    expect(new Set(page.matches.map((id: string) => id.slice(0, 2))).size).toBeGreaterThan(40);
    const { payload } = loadTractData(); const rural = payload.columns.get("rural_2027")!;
    expect(page.matches.every((id: string) => rural.get(payload.indexOf(id)) === 0)).toBe(true);
    expect(page.rows).toHaveLength(25);
    const selection = prepareExport({ state: "all", filters: { ...NO_FILTERS, rural: "not-rural" }, limit: 25 });
    expect(selection.total).toBe(page.total);
    expect(selection.geoids).toEqual(page.matches.slice(0, 25));
  });
  it("returns evidence for 25 member comparison tracts and enforces both tier limits", async () => {
    const signed = (await member());
    const ids = searchPage("10", NO_FILTERS, "geoid", 0, true).rows.slice(0, 25).map((row) => row[0]);
    expect(ids).toHaveLength(25);
    const context = { params: Promise.resolve({ state: "10" }) };
    const accepted = await searchPost(request("/api/explore/10", { filters: NO_FILTERS, geoids: ids }, signed.cookie), context);
    expect(accepted.status).toBe(200);
    expect(Object.keys((await accepted.json()).evidence)).toHaveLength(25);
    expect((await searchPost(request("/api/explore/10", { filters: NO_FILTERS, geoids: [...ids, "10001099999"] }, signed.cookie), context)).status).toBe(400);
    expect((await searchPost(request("/api/explore/10", { filters: NO_FILTERS, geoids: ids.slice(0, 3) }), context)).status).toBe(400);
  });
  it("requires a valid session and same-origin requests; client claims cannot grant access", async () => {
    const result = await exportPost(request("/api/exports", { input: { geoids: ["10001040100"] }, member: true }, "oz_session=forged"));
    expect(result.status).toBe(401);
    const signed = (await member());
    expect((await exportPost(request("/api/exports", {}, signed.cookie, "https://foreign.example"))).status).toBe(403);
    expect((await searchPost(request("/api/explore/10", { filters: { ...NO_FILTERS, ranges: { population: { min: 1 } } } }), { params: Promise.resolve({ state: "10" }) })).status).toBe(401);
    const map = await (await publicMap(new Request(`${origin}/api/explore/10`), { params: Promise.resolve({ state: "10" }) })).json();
    expect(map.tracts).toBeUndefined(); expect(map.measures).toEqual([]);
  });
  it("builds numeric, attributed data from local sources with no provider calls", () => {
    const network = vi.fn(() => { throw new Error("Exports must not fetch"); }); vi.stubGlobal("fetch", network);
    const input = { state: "10", columns: ["population", "median_home_value"], limit: 4 };
    const prepared = prepareExport(input); const result = buildExport(input, prepared);
    const files = unzipSync(result.body); const csv = strFromU8(files["areas.csv"]);
    expect(csv).toContain('"geoid"'); expect(csv).not.toContain("$20");
    const manifest = JSON.parse(strFromU8(files["manifest.json"])); expect(manifest.rows).toBe(4); expect(manifest.explicitlyLimitedTo).toBe(4);
    expect(strFromU8(files["sources.csv"])).toContain("Census"); expect(network).not.toHaveBeenCalled();
  });
  it("charges new exports once, supports bounded retries, and rejects cross-account retries", async () => {
    const a = (await member()), b = (await member()); const input = { state: "10", limit: 2 }; const id = randomUUID();
    const first = (await generateExport(a.id, id, input)); const retry = (await generateExport(a.id, id, input));
    expect(Buffer.from(first.body)).toEqual(Buffer.from(retry.body));
    await expect(async () => (await generateExport(b.id, id, input))).rejects.toThrow(/another request/);
    (await generateExport(a.id, randomUUID(), input)); (await generateExport(a.id, randomUUID(), input));
    await expect(async () => (await generateExport(a.id, randomUUID(), input))).rejects.toThrow(/allowance/);
    expect((await db().prepare("SELECT * FROM usage WHERE subject=? AND action='exports'").all(a.id))).toHaveLength(3);
    expect(() => prepareExport({ state: "10", columns: ["race"] })).toThrow(/supported/);
  });
});

describe("passkey authentication", () => {
  it("requires current terms and recent authentication, and consumes recovery codes only once", async () => {
    const signed = (await member());
    (await db().prepare("UPDATE accounts SET terms='old' WHERE id=?").run(signed.id));
    expect((await exportPost(request("/api/exports", { preview: true, input: { state: "10", limit: 1 } }, signed.cookie))).status).toBe(403);
    expect((await accountPost(request("/api/account", { action: "accept-terms", terms: TERMS_VERSION }, signed.cookie))).status).toBe(200);
    (await db().prepare("UPDATE sessions SET verified=? WHERE account=?").run(Date.now() - DAY, signed.id));
    expect((await accountPost(request("/api/account", { action: "delete", confirm: "DELETE" }, signed.cookie))).status).toBe(401);
    (await db().prepare("UPDATE sessions SET verified=? WHERE account=?").run(Date.now(), signed.id));
    const codesResponse = await accountPost(request("/api/account", { action: "recovery-codes" }, signed.cookie));
    const { codes } = await codesResponse.json(); expect(codes).toHaveLength(6);
    expect((await db().prepare("SELECT hash FROM recovery WHERE account=?").all(signed.id)).some((row) => row.hash === codes[0])).toBe(false);
    const recovered = await accountPost(request("/api/account", { action: "recover", code: codes[0] })); expect(recovered.status).toBe(200);
    expect((await (await accountGet(new Request(`${origin}/api/account`, { headers: { Cookie: signed.cookie } }))).json()).member).toBe(false);
    expect((await accountPost(request("/api/account", { action: "recover", code: codes[0] }))).status).toBe(400);
  });
  it("verifies real registration and signed authentication, rejects replay, and deletes account records", async () => {
    const optionsResponse = await accountPost(request("/api/account", { action: "options", kind: "register", terms: TERMS_VERSION }));
    expect(optionsResponse.status).toBe(200);
    const { options } = await optionsResponse.json(); const challengeCookie = optionsResponse.headers.get("set-cookie")!.split(";")[0];
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const jwk = publicKey.export({ format: "jwk" }); const credentialId = randomBytes(32);
    const cose = isoCBOR.encode(new Map<number, number | Uint8Array>([[1, 2], [3, -7], [-1, 1], [-2, new Uint8Array(Buffer.from(jwk.x!, "base64url"))], [-3, new Uint8Array(Buffer.from(jwk.y!, "base64url"))]]));
    const rpHash = createHash("sha256").update("localhost").digest();
    const clientData = Buffer.from(JSON.stringify({ type: "webauthn.create", challenge: options.challenge, origin }));
    const idLength = Buffer.alloc(2); idLength.writeUInt16BE(credentialId.length);
    const authData = Buffer.concat([rpHash, Buffer.from([0x45, 0, 0, 0, 1]), Buffer.alloc(16), idLength, credentialId, cose]);
    const attestation = isoCBOR.encode(new Map<string, unknown>([["fmt", "none"], ["attStmt", new Map()], ["authData", new Uint8Array(authData)]]) as Parameters<typeof isoCBOR.encode>[0]);
    const decoded = isoCBOR.decodeFirst<Map<string, Uint8Array>>(attestation).get("authData")!;
    expect(Buffer.from(decoded)).toEqual(authData);
    expect(authData.readUInt16BE(53)).toBe(32);
    expect(authData[87]).toBe(0xa5);
    const response = { id: credentialId.toString("base64url"), rawId: credentialId.toString("base64url"), type: "public-key", clientExtensionResults: {}, response: { clientDataJSON: clientData.toString("base64url"), attestationObject: Buffer.from(attestation).toString("base64url"), transports: ["internal"] } };
    const registration = await accountPost(request("/api/account", { action: "verify", response, terms: TERMS_VERSION }, challengeCookie));
    if (registration.status !== 200) await verifyRegistrationResponse({ response: response as RegistrationResponseJSON, expectedChallenge: options.challenge, expectedOrigin: origin, expectedRPID: "localhost" });
    expect(registration.status).toBe(200);
    expect((await accountPost(request("/api/account", { action: "verify", response, terms: TERMS_VERSION }, challengeCookie))).status).toBe(400);
    const loginOptions = await accountPost(request("/api/account", { action: "options", kind: "login" }));
    const login = (await loginOptions.json()).options;
    const authenticationData = Buffer.concat([rpHash, Buffer.from([0x05, 0, 0, 0, 2])]);
    const client = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge: login.challenge, origin }));
    const signature = sign("sha256", Buffer.concat([authenticationData, createHash("sha256").update(client).digest()]), privateKey);
    const authenticated = await accountPost(request("/api/account", { action: "verify", response: { id: response.id, rawId: response.id, type: "public-key", clientExtensionResults: {}, response: { authenticatorData: authenticationData.toString("base64url"), clientDataJSON: client.toString("base64url"), signature: signature.toString("base64url"), userHandle: options.user.id } } }, loginOptions.headers.get("set-cookie")!.split(";")[0]));
    expect(authenticated.status).toBe(200);
    const sessionCookie = authenticated.headers.get("set-cookie")!.split(";")[0];
    const status = await accountGet(new Request(`${origin}/api/account`, { headers: { Cookie: sessionCookie } }));
    expect((await status.json()).member).toBe(true);
    const deleted = await accountPost(request("/api/account", { action: "delete", confirm: "DELETE" }, sessionCookie)); expect(deleted.status).toBe(200);
    expect((await db().prepare("SELECT * FROM credentials WHERE id=?").get(response.id))).toBeUndefined();
    const after = await accountGet(new Request(`${origin}/api/account`, { headers: { Cookie: sessionCookie } })); expect((await after.json()).member).toBe(false);
  });
});
