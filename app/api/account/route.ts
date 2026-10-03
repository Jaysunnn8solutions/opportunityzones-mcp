import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse, type RegistrationResponseJSON, type AuthenticationResponseJSON } from "@simplewebauthn/server";
import { randomBytes } from "node:crypto";
import { AccessError, DAY, db, transaction, checkBudgets, recordBudgets } from "@/lib/access/store";
import { cookie, failure, hashToken, json, limitRequest, origin, readBody, requireMember, sameOrigin, session, setCookie, token } from "@/lib/access/http";
import { TERMS_VERSION } from "@/lib/content/siteTerms";

export const runtime = "nodejs";
async function startSession(req: Request, account: string) {
  const disabled = (await db().prepare("SELECT value FROM settings WHERE key=?").get(`account-disabled:${account}`)) as { value: string } | undefined;
  if (disabled?.value === "1") throw new AccessError("This account is currently unavailable.", 403);
  const raw = token();
  (await db().prepare("INSERT INTO sessions(hash,account,expires,verified) VALUES(?,?,?,?)").run(hashToken(raw), account, Date.now() + 7 * DAY, Date.now()));
  return setCookie("oz_session", raw, 7 * 86400, req);
}
export async function GET(req: Request) {
  try {
    const account = (await session(req));
    if (!account) return json({ member: false, configured: process.env.NODE_ENV !== "production" || !!(process.env.OZ_ORIGIN && (process.env.DATABASE_URL || (process.env.OZ_STORAGE_PATH && process.env.OZ_SINGLE_HOST === "1" && process.env.VERCEL !== "1"))) });
    const usage = (await db().prepare("SELECT action, at, amount FROM usage WHERE subject=? AND action IN ('exports','export-rows') AND at>? ORDER BY at").all(account.id, Date.now() - 30 * DAY));
    const credentials = (await db().prepare("SELECT COUNT(*) AS count FROM credentials WHERE account=?").get(account.id));
    const passkeys = (await db().prepare("SELECT id FROM credentials WHERE account=? ORDER BY id").all(account.id));
    return json({ member: true, id: account.id, termsCurrent: account.terms === TERMS_VERSION, asOf: Date.now(), usage, credentials, passkeys });
  } catch (error) { return failure(error); }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req); (await limitRequest(req, "auth"));
    const body = await readBody(req);
    const store = db();
    const expectedOrigin = origin(req); const rpID = new URL(expectedOrigin).hostname;
    if (body.action === "logout") { (await store.prepare("DELETE FROM sessions WHERE hash=?").run(hashToken(cookie(req, "oz_session")))); return json({ ok: true }, 200, { "Set-Cookie": setCookie("oz_session", "", 0, req) }); }
    if (body.action === "accept-terms") {
      const account = (await session(req)); if (!account) throw new AccessError("Sign in first.", 401);
      if (body.terms !== TERMS_VERSION) throw new AccessError("Review and accept the current terms.", 400);
      (await store.prepare("UPDATE accounts SET terms=? WHERE id=?").run(TERMS_VERSION, account.id));
      return json({ ok: true });
    }
    if (body.action === "delete") {
      const account = (await requireMember(req, true));
      if (body.confirm !== "DELETE") throw new AccessError("Confirm account deletion.", 400);
      (await transaction(store, async () => { (await store.prepare("DELETE FROM usage WHERE subject=? OR (subject='operator' AND action IN (?,?))").run(account.id, `suspend:${account.id}`, `restore:${account.id}`)); (await store.prepare("DELETE FROM settings WHERE key=?").run(`account-disabled:${account.id}`)); (await store.prepare("DELETE FROM challenges WHERE account=?").run(account.id)); (await store.prepare("DELETE FROM accounts WHERE id=?").run(account.id)); }));
      return json({ ok: true }, 200, { "Set-Cookie": setCookie("oz_session", "", 0, req) });
    }
    if (body.action === "recovery-codes") {
      const account = (await requireMember(req, true));
      const codes = Array.from({ length: 6 }, () => randomBytes(20).toString("hex"));
      (await transaction(store, async () => { (await store.prepare("DELETE FROM recovery WHERE account=?").run(account.id)); for (const code of codes) (await store.prepare("INSERT INTO recovery(hash,account) VALUES(?,?)").run(hashToken(code), account.id)); }));
      return json({ codes });
    }
    if (body.action === "remove-passkey") {
      const account = (await requireMember(req, true));
      if (typeof body.id !== "string" || body.id.length > 2048) throw new AccessError("Select a passkey to remove.", 400);
      (await transaction(store, async () => {
        if (!(await store.prepare("SELECT 1 FROM credentials WHERE id=? AND account=?").get(body.id, account.id))) throw new AccessError("Passkey not found.", 404);
        const count = (await store.prepare("SELECT COUNT(*) AS n FROM credentials WHERE account=?").get(account.id)) as { n: number };
        if (count.n <= 1) throw new AccessError("Add another passkey before removing your last one.", 409);
        (await store.prepare("DELETE FROM credentials WHERE id=? AND account=?").run(body.id, account.id));
        (await store.prepare("DELETE FROM sessions WHERE account=? AND hash<>?").run(account.id, hashToken(cookie(req, "oz_session"))));
      }));
      return json({ ok: true });
    }
    if (body.action === "logout-others") {
      const account = (await requireMember(req, true));
      (await store.prepare("DELETE FROM sessions WHERE account=? AND hash<>?").run(account.id, hashToken(cookie(req, "oz_session"))));
      return json({ ok: true });
    }
    if (body.action === "recover") {
      if (typeof body.code !== "string" || !/^[a-f0-9]{40}$/.test(body.code)) throw new AccessError("Recovery code could not be verified.", 400);
      const account = (await transaction(store, async () => {
        const found = (await store.prepare("DELETE FROM recovery WHERE hash=? RETURNING account").get(hashToken(body.code))) as { account: string } | undefined;
        if (!found) throw new AccessError("Recovery code could not be verified.", 400);
        (await store.prepare("DELETE FROM sessions WHERE account=?").run(found.account));
        return found.account;
      }));
      return json({ ok: true }, 200, { "Set-Cookie": (await startSession(req, account)) });
    }
    if (body.action === "options") {
      const kind = body.kind;
      if (!["register", "login", "add"].includes(kind)) throw new AccessError("Unknown account action.", 400);
      if (kind === "register" && process.env.OZ_SIGNUP_PAUSED === "1") throw new AccessError("New accounts are temporarily paused. You can still browse public research.", 503);
      if (kind === "register" && body.terms !== TERMS_VERSION) throw new AccessError("Accept the terms before creating an account.", 400);
      const account = kind === "add" ? (await requireMember(req, true)).id : token();
      const options = kind === "login" ? await generateAuthenticationOptions({ rpID, userVerification: "required" }) : await generateRegistrationOptions({
        rpName: "Opportunity Zone Research", rpID, userName: `Research ${account.slice(0, 8)}`, userID: Buffer.from(account),
        attestationType: "none", authenticatorSelection: { residentKey: "required", userVerification: "required" },
        excludeCredentials: kind === "add" ? ((await store.prepare("SELECT id FROM credentials WHERE account=?").all(account)) as Array<{ id: string }>) : [],
      });
      const challengeToken = token();
      (await store.prepare("INSERT INTO challenges(hash,kind,challenge,account,expires) VALUES(?,?,?,?,?)").run(hashToken(challengeToken), kind, options.challenge, account, Date.now() + 300_000));
      return json({ options }, 200, { "Set-Cookie": setCookie("oz_challenge", challengeToken, 300, req) });
    }
    if (body.action !== "verify") throw new AccessError("Unknown account action.", 400);
    const challenge = (await store.prepare("DELETE FROM challenges WHERE hash=? AND expires>? RETURNING *").get(hashToken(cookie(req, "oz_challenge")), Date.now())) as { kind: string; challenge: string; account: string } | undefined;
    if (!challenge) throw new AccessError("The sign-in request expired. Please try again.", 400);
    let account = challenge.account;
    if (challenge.kind === "login") {
      const response = body.response as AuthenticationResponseJSON;
      const credential = (await store.prepare("SELECT * FROM credentials WHERE id=?").get(typeof response?.id === "string" ? response.id : "")) as { id: string; account: string; public_key: Uint8Array; counter: number; transports: string } | undefined;
      if (!credential) throw new AccessError("Passkey could not be verified.", 400);
      const verified = await verifyAuthenticationResponse({ response, expectedChallenge: challenge.challenge, expectedOrigin, expectedRPID: rpID, requireUserVerification: true, credential: { id: credential.id, publicKey: new Uint8Array(credential.public_key), counter: credential.counter } }).catch(() => null);
      if (!verified?.verified) throw new AccessError("Passkey could not be verified.", 400);
      const update = (await store.prepare("UPDATE credentials SET counter=? WHERE id=? AND counter=?").run(verified.authenticationInfo.newCounter, credential.id, credential.counter));
      if (!update.changes) throw new AccessError("Please sign in again.", 409);
      account = credential.account;
    } else {
      if (challenge.kind === "add" && (await requireMember(req, true)).id !== account) throw new AccessError("Account changed; try again.", 403);
      if (challenge.kind === "register" && process.env.OZ_SIGNUP_PAUSED === "1") throw new AccessError("New accounts are temporarily paused.", 503);
      if (challenge.kind === "register" && body.terms !== TERMS_VERSION) throw new AccessError("Accept the current terms.", 400);
      const verified = await verifyRegistrationResponse({ response: body.response as RegistrationResponseJSON, expectedChallenge: challenge.challenge, expectedOrigin, expectedRPID: rpID, requireUserVerification: true }).catch(() => null);
      if (!verified?.verified || !verified.registrationInfo) throw new AccessError("Passkey could not be verified.", 400);
      const credential = verified.registrationInfo.credential;
      (await transaction(store, async () => {
        if (challenge.kind === "register") {
          const budgets = [{ subject: "service", action: "accounts", limit: 100, window: DAY }];
          (await checkBudgets(store, budgets)); (await recordBudgets(store, budgets));
          (await store.prepare("INSERT INTO accounts(id,terms,created) VALUES(?,?,?)").run(account, TERMS_VERSION, Date.now()));
        }
        const count = (await store.prepare("SELECT COUNT(*) AS n FROM credentials WHERE account=?").get(account)) as { n: number };
        if (count.n >= 5) throw new AccessError("This account already has five passkeys.", 400);
        (await store.prepare("INSERT INTO credentials(id,account,public_key,counter,transports) VALUES(?,?,?,?,?)").run(credential.id, account, credential.publicKey, credential.counter, JSON.stringify(credential.transports ?? [])));
      }));
    }
    // Rotate the current session after every successful ceremony.
    (await store.prepare("DELETE FROM sessions WHERE hash=?").run(hashToken(cookie(req, "oz_session"))));
    return json({ ok: true }, 200, { "Set-Cookie": (await startSession(req, account)) });
  } catch (error) { return failure(error); }
}
