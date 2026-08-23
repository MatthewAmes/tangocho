// Tests for the Cloudflare Worker (cf/src/index.js): the ISO-8601 duration parser, the RSS/Atom
// feed parser, the sync-body validator, session sign/verify, the TTS quota counter, and the
// security-header wrapper. Plain Node asserts, same style as tools/test-fsrs.mjs.
//
//   node tools/test-worker.mjs
import {
  iso8601ToSeconds, parseFeed, unent, validateSnapshotBody,
  signSession, verifySession, withSecurityHeaders, bumpQuota, sha256Hex,
} from "../cf/src/index.js";
import { handleAi } from "../cf/src/ai.js";

let fail = 0, run = 0;
const t = async (name, fn) => {
  run++;
  try { await fn(); console.log("  PASS  " + name); }
  catch (e) { fail++; console.log("  FAIL  " + name + "\n        " + e.message); }
};
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (a, m) => { if (!a) throw new Error(m || "expected truthy"); };
const isNull = (a, m) => { if (a !== null) throw new Error(`${m || ""} expected null, got ${JSON.stringify(a)}`); };
const notNull = (a, m) => { if (a === null || a === undefined) throw new Error(m || "expected non-null"); };

async function main() {
  console.log("=== iso8601ToSeconds ===");
  await t("PT5M30S", () => eq(iso8601ToSeconds("PT5M30S"), 330));
  await t("PT1H2M3S", () => eq(iso8601ToSeconds("PT1H2M3S"), 3723));
  await t("P1DT2H", () => eq(iso8601ToSeconds("P1DT2H"), 93600));
  await t("P1D (no T)", () => eq(iso8601ToSeconds("P1D"), 86400));
  await t("junk -> 0", () => { eq(iso8601ToSeconds(""), 0); eq(iso8601ToSeconds("abc"), 0); eq(iso8601ToSeconds(undefined), 0); eq(iso8601ToSeconds("PT0S"), 0); });

  console.log("=== parseFeed ===");
  await t("atom (YouTube)", () => {
    const items = parseFeed('<feed><entry><title>A &amp; B</title><yt:videoId>abc123</yt:videoId><published>2026-08-01T00:00:00Z</published></entry></feed>', 10);
    eq(items.length, 1);
    eq(items[0].url, "https://www.youtube.com/watch?v=abc123");
    eq(items[0].title, "A & B");
    eq(items[0].vid, "abc123");
  });
  await t("rss with itunes:duration", () => {
    const items = parseFeed('<rss><item><title>Ep</title><link>https://x/y</link><pubDate>Mon, 01 Aug 2026 00:00:00 GMT</pubDate><itunes:duration>12:34</itunes:duration></item></rss>', 10);
    eq(items[0].sec, 754);
  });
  await t("unent decodes entities and strips CDATA", () => {
    eq(unent("<![CDATA[hi &amp; bye]]>"), "hi & bye");
    eq(unent("&lt;tag&gt; &quot;q&quot; &#65;"), '<tag> "q" A');
  });

  console.log("=== validateSnapshotBody ===");
  await t("valid shape", () => isNull(validateSnapshotBody({ snapshot: { "jpn101:deck": "[]" } })));
  await t("bad key rejected", () => ok(/^bad key/.test(validateSnapshotBody({ snapshot: { evil: "x" } }))));
  await t("non-string value rejected", () => eq(validateSnapshotBody({ snapshot: { "jpn101:deck": {} } }), "value for jpn101:deck must be a string"));
  await t("__proto__ key rejected", () => {
    // an object literal's "__proto__" key sets the prototype rather than an own property;
    // JSON.parse (what the real request body goes through) makes it a real own key instead.
    const body = JSON.parse('{"snapshot":{"__proto__":"x"}}');
    ok(/^bad key/.test(validateSnapshotBody(body)));
  });
  await t("array / null / missing snapshot all rejected", () => {
    notNull(validateSnapshotBody([]));
    notNull(validateSnapshotBody(null));
    notNull(validateSnapshotBody({}));
  });
  await t("too many keys rejected", () => {
    const snap = {};
    for (let i = 0; i < 65; i++) snap["jpn101:k" + i] = "v";
    notNull(validateSnapshotBody({ snapshot: snap }));
  });

  console.log("=== session sign/verify ===");
  await t("round-trip", async () => {
    const tok = await signSession("secret1", "sub-123", "a@b.com");
    const payload = await verifySession("secret1", tok);
    notNull(payload);
    eq(payload.sub, "sub-123");
    eq(payload.email, "a@b.com");
  });
  await t("wrong secret rejected", async () => {
    const tok = await signSession("secret1", "sub-123", null);
    isNull(await verifySession("other-secret", tok));
  });
  await t("tampered body rejected", async () => {
    const tok = await signSession("secret1", "sub-123", null);
    const [, sig] = tok.split(".");
    const tampered = Buffer.from(JSON.stringify({ sub: "sub-999", exp: Date.now() + 1e9 })).toString("base64url") + "." + sig;
    isNull(await verifySession("secret1", tampered));
  });

  console.log("=== bumpQuota (in-memory KV stub) ===");
  function fakeKV() {
    const store = new Map();
    return { get: async (k) => (store.has(k) ? store.get(k) : null), put: async (k, v) => { store.set(k, v); } };
  }
  await t("allows up to the limit, rejects past it", async () => {
    const env = { TTS: fakeKV() };
    for (let i = 1; i <= 3; i++) ok(await bumpQuota(env, "u:x", 3), "attempt " + i);
    ok(!(await bumpQuota(env, "u:x", 3)), "4th attempt should be rejected");
  });
  await t("separate keys have independent counters", async () => {
    const env = { TTS: fakeKV() };
    ok(await bumpQuota(env, "u:a", 1));
    ok(await bumpQuota(env, "u:b", 1));
    ok(!(await bumpQuota(env, "u:a", 1)));
  });

  console.log("=== withSecurityHeaders ===");
  await t("HTML response gets CSP + nosniff", () => {
    const res = withSecurityHeaders(new Response("x", { headers: { "content-type": "text/html" } }));
    ok(res.headers.get("content-security-policy"));
    eq(res.headers.get("x-content-type-options"), "nosniff");
    eq(res.headers.get("x-frame-options"), "DENY");
  });
  await t("csp:false still gets nosniff but no CSP", () => {
    const res = withSecurityHeaders(new Response("{}", { headers: { "content-type": "application/json" } }), { csp: false });
    isNull(res.headers.get("content-security-policy"));
    eq(res.headers.get("x-content-type-options"), "nosniff");
  });

  console.log("=== handleAi (POST /api/ai) ===");
  function fakeKV2() {
    const store = new Map();
    return {
      get: async (k, opts) => {
        if (!store.has(k)) return null;
        const v = store.get(k);
        return opts && opts.type === "json" ? JSON.parse(v) : v;
      },
      put: async (k, v) => { store.set(k, typeof v === "string" ? v : String(v)); },
    };
  }
  const aiEnv = () => ({ SESSION_SECRET: "test-secret", ANTHROPIC_API_KEY: "test-key", TTS: fakeKV2() });
  const aiReq = (body, token) => new Request("http://x/api/ai", {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) },
    body: JSON.stringify(body),
  });
  const cannedFetch = (body, status = 200) => async () => new Response(JSON.stringify(body), { status });

  await t("401 without a session", async () => {
    const res = await handleAi(aiReq({ task: "hook", input: { term: "猫" } }), aiEnv());
    eq(res.status, 401);
  });
  await t("400 on an unknown task", async () => {
    const token = await signSession("test-secret", "sub-1", null);
    const res = await handleAi(aiReq({ task: "bogus", input: {} }, token), aiEnv());
    eq(res.status, 400);
  });
  await t("413 on oversize input", async () => {
    const token = await signSession("test-secret", "sub-1", null);
    const res = await handleAi(aiReq({ task: "hook", input: { term: "x".repeat(5000) } }, token), aiEnv());
    eq(res.status, 413);
  });
  await t("a successful call is cached, and the second identical call skips the upstream fetch", async () => {
    const token = await signSession("test-secret", "sub-1", null);
    const env = aiEnv();
    let fetchCalls = 0;
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (...args) => { fetchCalls++; return cannedFetch({ stop_reason: "end_turn", content: [{ type: "text", text: '{"hook":"猫 sounds like \'neko\', imagine a cat saying nyeh-ko."}' }] })(...args); };
    try {
      const res1 = await handleAi(aiReq({ task: "hook", input: { term: "猫", reading: "ねこ" } }, token), env);
      eq(res1.status, 200);
      const body1 = await res1.json();
      eq(body1.cached, false);
      ok(body1.result.hook);
      eq(fetchCalls, 1);

      const res2 = await handleAi(aiReq({ task: "hook", input: { term: "猫", reading: "ねこ" } }, token), env);
      const body2 = await res2.json();
      eq(body2.cached, true);
      eq(body2.result.hook, body1.result.hook);
      eq(fetchCalls, 1, "second identical call must be served from KV, not hit the API again");
    } finally { globalThis.fetch = realFetch; }
  });
  await t("429 once the per-user daily cap is already spent", async () => {
    const token = await signSession("test-secret", "sub-cap", null);
    const env = aiEnv();
    const today = new Date().toISOString().slice(0, 10);
    await env.TTS.put("ttsq:ai:u:sub-cap:" + today, "999");
    const res = await handleAi(aiReq({ task: "hook", input: { term: "犬" } }, token), env);
    eq(res.status, 429);
  });
  await t("upstream refusal maps to 502", async () => {
    const token = await signSession("test-secret", "sub-2", null);
    const realFetch = globalThis.fetch;
    globalThis.fetch = cannedFetch({ stop_reason: "refusal", content: [] });
    try {
      const res = await handleAi(aiReq({ task: "hook", input: { term: "違う語" } }, token), aiEnv());
      eq(res.status, 502);
    } finally { globalThis.fetch = realFetch; }
  });
  await t("a fence-wrapped JSON reply still parses", async () => {
    const token = await signSession("test-secret", "sub-3", null);
    const realFetch = globalThis.fetch;
    globalThis.fetch = cannedFetch({ stop_reason: "end_turn", content: [{ type: "text", text: "```json\n{\"hook\":\"wrapped\"}\n```" }] });
    try {
      const res = await handleAi(aiReq({ task: "hook", input: { term: "fence" } }, token), aiEnv());
      eq(res.status, 200);
      const body = await res.json();
      eq(body.result.hook, "wrapped");
    } finally { globalThis.fetch = realFetch; }
  });
  await t("503 when the AI key isn't configured", async () => {
    const token = await signSession("test-secret", "sub-4", null);
    const env = aiEnv(); env.ANTHROPIC_API_KEY = undefined;
    const res = await handleAi(aiReq({ task: "hook", input: { term: "x" } }, token), env);
    eq(res.status, 503);
  });

  console.log(fail ? `\n${fail} of ${run} FAILED` : `\nall ${run} worker tests passed`);
  process.exit(fail ? 1 : 0);
}

main();
