import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJson, SourceError } from "./http";
import { redact } from "./redact";

const URL_WITH_SECRETS = "https://example.test/api?address=1+Main+St&key=SECRET123";

function stubFetch(...responses: Array<Response | Error>) {
  const fn = vi.fn();
  for (const r of responses) {
    if (r instanceof Error) fn.mockRejectedValueOnce(r);
    else fn.mockResolvedValueOnce(r);
  }
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

async function caught(p: Promise<unknown>): Promise<SourceError> {
  try {
    await p;
  } catch (err) {
    if (err instanceof SourceError) return err;
    throw err;
  }
  throw new Error("expected a SourceError");
}

describe("fetchJson", () => {
  it("parses a JSON body", async () => {
    stubFetch(new Response('{"ok":true}'));
    await expect(fetchJson(URL_WITH_SECRETS, { sourceId: "t" })).resolves.toEqual({ ok: true });
  });

  it("retries a 503 and succeeds", async () => {
    const fn = stubFetch(new Response("", { status: 503 }), new Response("[1]"));
    await expect(fetchJson(URL_WITH_SECRETS, { sourceId: "t", retries: 1 })).resolves.toEqual([1]);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 400, and reports it as rejected", async () => {
    const fn = stubFetch(new Response("bad", { status: 400 }));
    const err = await caught(fetchJson(URL_WITH_SECRETS, { sourceId: "t", retries: 3 }));
    expect(err.kind).toBe("rejected");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("reports a timeout as unavailable after the retries run out", async () => {
    const timeout = Object.assign(new Error("timed out"), { name: "TimeoutError" });
    stubFetch(timeout, timeout);
    const err = await caught(fetchJson(URL_WITH_SECRETS, { sourceId: "t", retries: 1, timeoutMs: 5 }));
    expect(err.kind).toBe("unavailable");
    expect(err.message).toContain("5 ms");
  });

  it("reports a non-JSON body as bad-response", async () => {
    stubFetch(new Response("<html>error</html>"));
    const err = await caught(fetchJson(URL_WITH_SECRETS, { sourceId: "t" }));
    expect(err.kind).toBe("bad-response");
  });

  it("never puts the URL, a query or a key in an error, even if the body echoes them", async () => {
    const echo = `upstream failed for ${URL_WITH_SECRETS}`;
    stubFetch(new Response(echo, { status: 500 }), new Response(echo, { status: 403 }));
    const err = await caught(fetchJson(URL_WITH_SECRETS, { sourceId: "t", retries: 1 }));
    for (const leak of ["example.test", "Main", "SECRET123"]) expect(err.message).not.toContain(leak);
  });
});

describe("redact", () => {
  it("masks every credential parameter the product's APIs use", () => {
    const u = "https://x.test/?key=a&api_key=b&apikey=c&token=d&access_token=e&registrationkey=f&subscription-key=g&keep=1";
    const out = redact(u);
    for (const v of ["=a", "=b", "=c", "=d", "=e", "=f", "=g"]) expect(out).not.toContain(v);
    expect(out).toContain("keep=1");
  });
});
