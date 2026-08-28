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
  const aiEnv = () => ({ SESSION_SECRET: "test-secret", GEMINI_API_KEY: "test-key", TTS: fakeKV2() });
  // A Gemini reply: text lives under candidates[0].content.parts[], not content[].
  const geminiSays = (text, finishReason = "STOP") => ({
    candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason }],
  });
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
    globalThis.fetch = async (...args) => { fetchCalls++; return cannedFetch(geminiSays('{"hook":"猫 sounds like \'neko\', imagine a cat saying nyeh-ko."}'))(...args); };
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
    globalThis.fetch = cannedFetch({ candidates: [{ finishReason: "SAFETY" }] });
    try {
      const res = await handleAi(aiReq({ task: "hook", input: { term: "違う語" } }, token), aiEnv());
      eq(res.status, 502);
    } finally { globalThis.fetch = realFetch; }
  });
  await t("a fence-wrapped JSON reply still parses", async () => {
    const token = await signSession("test-secret", "sub-3", null);
    const realFetch = globalThis.fetch;
    globalThis.fetch = cannedFetch(geminiSays("```json\n{\"hook\":\"wrapped\"}\n```"));
    try {
      const res = await handleAi(aiReq({ task: "hook", input: { term: "fence" } }, token), aiEnv());
      eq(res.status, 200);
      const body = await res.json();
      eq(body.result.hook, "wrapped");
    } finally { globalThis.fetch = realFetch; }
  });
  await t("a reply that spent its whole budget thinking is retried, not returned empty", async () => {
    // The 2.5 models think by default and thinking tokens count against maxOutputTokens, so
    // a short budget can come back with finishReason MAX_TOKENS and NO text at all. The code
    // disables thinking, but a model change could bring it back — so the retry is tested.
    const token = await signSession("test-secret", "sub-think", null);
    const realFetch = globalThis.fetch;
    let n = 0;
    globalThis.fetch = async () => {
      n++;
      const body = n === 1
        ? { candidates: [{ content: { role: "model", parts: [] }, finishReason: "MAX_TOKENS" }] }
        : geminiSays('{"hook":"second try had room to answer"}');
      return new Response(JSON.stringify(body), { status: 200 });
    };
    try {
      const res = await handleAi(aiReq({ task: "hook", input: { term: "考" } }, token), aiEnv());
      eq(res.status, 200);
      eq((await res.json()).result.hook, "second try had room to answer");
      eq(n, 2, "an empty first reply must be retried with a bigger budget");
    } finally { globalThis.fetch = realFetch; }
  });
  await t("a blocked prompt (no candidates at all) maps to 502", async () => {
    const token = await signSession("test-secret", "sub-block", null);
    const realFetch = globalThis.fetch;
    globalThis.fetch = cannedFetch({ promptFeedback: { blockReason: "SAFETY" } });
    try {
      const res = await handleAi(aiReq({ task: "hook", input: { term: "x" } }, token), aiEnv());
      eq(res.status, 502);
    } finally { globalThis.fetch = realFetch; }
  });
  await t("the key travels in the query string and never in a header", async () => {
    // Gemini authenticates with ?key=. Sending it as a header instead is silently ignored
    // and every call comes back 400 — and a key in a header is the shape that ends up in
    // proxy logs, so this asserts both the mechanism and that nothing leaks sideways.
    const token = await signSession("test-secret", "sub-url", null);
    const realFetch = globalThis.fetch;
    let seenUrl = "", seenHeaders = {};
    globalThis.fetch = async (url, opts) => {
      seenUrl = String(url); seenHeaders = (opts && opts.headers) || {};
      return new Response(JSON.stringify(geminiSays('{"hook":"ok"}')), { status: 200 });
    };
    try {
      await handleAi(aiReq({ task: "hook", input: { term: "鍵" } }, token), aiEnv());
      ok(seenUrl.includes("key=test-key"), "key must be in the query string: " + seenUrl);
      ok(seenUrl.includes("generativelanguage.googleapis.com"), "wrong host: " + seenUrl);
      eq(JSON.stringify(seenHeaders).includes("test-key"), false, "the key must not be in a header");
    } finally { globalThis.fetch = realFetch; }
  });
  await t("no schema sends additionalProperties, which Gemini rejects outright", async () => {
    const token = await signSession("test-secret", "sub-schema", null);
    const realFetch = globalThis.fetch;
    const sent = [];
    globalThis.fetch = async (url, opts) => {
      sent.push(JSON.parse(opts.body));
      return new Response(JSON.stringify(geminiSays('{"hook":"ok"}')), { status: 200 });
    };
    try {
      const inputs = {
        hook: { term: "x" }, debrief: { missed: [] }, annotate: { raw: "あ" },
        sentence_fill: { vocab: [{ term: "猫", reading: "ねこ", meaning: "cat" }] },
        sentence_trans: { vocab: [{ term: "猫", reading: "ねこ", meaning: "cat" }] },
        sentence_grade: { english: "I like cats.", model: "猫が好きです。", answer: "ねこがすきです" },
      };
      for (const [task, input] of Object.entries(inputs)) {
        await handleAi(aiReq({ task, input }, token), aiEnv());
      }
      for (const b of sent) {
        const schema = JSON.stringify(b.generationConfig.responseSchema);
        eq(schema.includes("additionalProperties"), false, "responseSchema must not carry additionalProperties");
        eq(b.generationConfig.responseMimeType, "application/json");
        eq(b.generationConfig.thinkingConfig.thinkingBudget, 0, "thinking must stay off");
      }
      eq(sent.length, 6);
    } finally { globalThis.fetch = realFetch; }
  });
  await t("the Sentences tasks exist — the tab used to post a free-form prompt and 400", async () => {
    // The old client posted {prompt} and got "unknown task", then fell back to offline
    // practice without ever surfacing an error. That fallback looked like a working feature.
    const token = await signSession("test-secret", "sub-sent", null);
    const res = await handleAi(aiReq({ task: "hook", input: {}, prompt: "write me anything" }, token), aiEnv());
    ok(res.status !== 400, "a stray prompt field must not break a valid task");
    const bad = await handleAi(aiReq({ prompt: "write me anything" }, token), aiEnv());
    eq(bad.status, 400, "a bare {prompt} must still be rejected — that is the abuse guard");
  });
  await t("a big deck is capped before it reaches the prompt", async () => {
    const token = await signSession("test-secret", "sub-vocab", null);
    const realFetch = globalThis.fetch;
    let sentBody = null;
    globalThis.fetch = async (url, opts) => {
      sentBody = JSON.parse(opts.body);
      return new Response(JSON.stringify(geminiSays('{"english":"a","model":"b","modelTokens":[],"reading":"c","romaji":"d","notes":"e"}')), { status: 200 });
    };
    try {
      // Under INPUT_MAX (which would 413 first, and does — that ceiling is checked above)
      // but well over the 60-line cap, so it is the cap being exercised and not the ceiling.
      const vocab = Array.from({ length: 90 }, (_, i) => ({ term: "語" + i, reading: "ご", meaning: "w" }));
      const res = await handleAi(aiReq({ task: "sentence_trans", input: { vocab } }, token), aiEnv());
      eq(res.status, 200);
      const lines = sentBody.contents[0].parts[0].text.split("\n").filter((l) => l.startsWith("語"));
      eq(lines.length, 60, "vocabulary must be capped server-side");
    } finally { globalThis.fetch = realFetch; }
  });
  await t("the request degrades a rung at a time until the model accepts it", async () => {
    // Gemini answers every unsupported optional field with the same opaque 400 — "Request
    // contains an invalid argument", naming nothing. Guessing which field costs a deploy per
    // guess, so the request drops them in order of how little they matter instead.
    const token = await signSession("test-secret", "sub-ladder", null);
    const realFetch = globalThis.fetch;
    const bodies = [];
    globalThis.fetch = async (url, opts) => {
      const b = JSON.parse(opts.body); bodies.push(b);
      // this model tolerates neither thinkingConfig nor propertyOrdering
      const bad = b.generationConfig.thinkingConfig
        || JSON.stringify(b.generationConfig.responseSchema || {}).includes("propertyOrdering");
      return bad
        ? new Response(JSON.stringify({ error: { message: "Request contains an invalid argument." } }), { status: 400 })
        : new Response(JSON.stringify(geminiSays('{"hook":"third rung"}')), { status: 200 });
    };
    try {
      const res = await handleAi(aiReq({ task: "hook", input: { term: "階" } }, token), aiEnv());
      eq(res.status, 200);
      eq((await res.json()).result.hook, "third rung");
      eq(bodies.length, 3, "should have stopped at the first rung that worked");
      ok(bodies[0].generationConfig.thinkingConfig, "rung 0 asks for everything");
      eq(bodies[2].generationConfig.thinkingConfig, undefined, "rung 2 dropped thinking");
      eq(JSON.stringify(bodies[2].generationConfig.responseSchema).includes("propertyOrdering"), false, "and ordering");
      ok(bodies[2].generationConfig.responseSchema, "but the schema survives — it is what makes the reply parseable");
      ok(bodies[2].systemInstruction, "and the system role survives too");
    } finally { globalThis.fetch = realFetch; }
  });
  await t("a busy model is waited out, not reported as broken", async () => {
    // "This model is currently experiencing high demand" is a real answer to a well-formed
    // request. There is nothing to fix and nothing to degrade — the shape ladder must not
    // run, because every rung would get the same reply.
    const token = await signSession("test-secret", "sub-busy", null);
    const realFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      if (calls < 3) return new Response(JSON.stringify({ error: { message: "This model is currently experiencing high demand. Spikes in demand are usually temporary." } }), { status: 503 });
      return new Response(JSON.stringify(geminiSays('{"hook":"got through"}')), { status: 200 });
    };
    try {
      const res = await handleAi(aiReq({ task: "hook", input: { term: "混" } }, token), aiEnv());
      eq(res.status, 200);
      eq((await res.json()).result.hook, "got through");
      eq(calls, 3, "one call per attempt — the shape ladder must not fire on congestion");
    } finally { globalThis.fetch = realFetch; }
  });
  await t("a second configured model is tried when the first stays busy", async () => {
    const token = await signSession("test-secret", "sub-2nd", null);
    const realFetch = globalThis.fetch;
    const seen = [];
    globalThis.fetch = async (url) => {
      const m = String(url).match(/models\/([^:]+):/)[1];
      seen.push(m);
      if (m === "busy-model") return new Response(JSON.stringify({ error: { message: "high demand" } }), { status: 503 });
      return new Response(JSON.stringify(geminiSays('{"hook":"second model"}')), { status: 200 });
    };
    try {
      const env = aiEnv(); env.GEMINI_MODEL = "busy-model, spare-model";
      const res = await handleAi(aiReq({ task: "hook", input: { term: "予" } }, token), env);
      eq(res.status, 200);
      eq((await res.json()).result.hook, "second model");
      eq(seen.filter((m) => m === "busy-model").length, 3, "exhausts attempts on the first");
      eq(seen[seen.length - 1], "spare-model", "then moves on");
    } finally { globalThis.fetch = realFetch; }
  });
  await t("the last rung is plain enough for any generateContent model", async () => {
    const token = await signSession("test-secret", "sub-bare", null);
    const realFetch = globalThis.fetch;
    const bodies = [];
    globalThis.fetch = async (url, opts) => {
      const b = JSON.parse(opts.body); bodies.push(b);
      // rejects everything except the barest possible request
      const fancy = b.generationConfig.thinkingConfig || b.generationConfig.responseSchema || b.systemInstruction;
      return fancy
        ? new Response(JSON.stringify({ error: { message: "Request contains an invalid argument." } }), { status: 400 })
        : new Response(JSON.stringify(geminiSays('```json\n{"hook":"bare"}\n```')), { status: 200 });
    };
    try {
      const res = await handleAi(aiReq({ task: "hook", input: { term: "裸" } }, token), aiEnv());
      eq(res.status, 200, "the ladder must bottom out somewhere that works");
      eq((await res.json()).result.hook, "bare");
      const last = bodies[bodies.length - 1];
      eq(last.systemInstruction, undefined, "system prompt folds into the user turn");
      ok(last.contents[0].parts[0].text.includes("JPN 101"), "…and is still actually sent");
    } finally { globalThis.fetch = realFetch; }
  });
  await t("a 400 that is NOT about a field we sent is not retried", async () => {
    const token = await signSession("test-secret", "sub-400", null);
    const realFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return new Response(JSON.stringify({ error: { message: "API key not valid. Please pass a valid API key." } }), { status: 400 });
    };
    try {
      const res = await handleAi(aiReq({ task: "hook", input: { term: "鍵" } }, token), aiEnv());
      eq(res.status, 502);
      eq(calls, 1, "a bad key must not be retried — it will fail identically");
      ok((await res.json()).detail.includes("API key not valid"), "the reason reaches the caller");
    } finally { globalThis.fetch = realFetch; }
  });
  await t("the model is overridable without a deploy", async () => {
    const token = await signSession("test-secret", "sub-model", null);
    const realFetch = globalThis.fetch;
    let seenUrl = "";
    globalThis.fetch = async (url, opts) => {
      seenUrl = String(url);
      return new Response(JSON.stringify(geminiSays('{"hook":"ok"}')), { status: 200 });
    };
    try {
      const env = aiEnv(); env.GEMINI_MODEL = "gemini-experimental-9";
      await handleAi(aiReq({ task: "hook", input: { term: "型" } }, token), env);
      ok(seenUrl.includes("gemini-experimental-9"), "GEMINI_MODEL must win: " + seenUrl);
      seenUrl = "";
      await handleAi(aiReq({ task: "hook", input: { term: "既" } }, token), aiEnv());
      ok(seenUrl.includes("gemini-3.6-flash"), "default otherwise: " + seenUrl);
    } finally { globalThis.fetch = realFetch; }
  });
  await t("503 when the AI key isn't configured", async () => {
    const token = await signSession("test-secret", "sub-4", null);
    const env = aiEnv(); env.GEMINI_API_KEY = undefined;
    const res = await handleAi(aiReq({ task: "hook", input: { term: "x" } }, token), env);
    eq(res.status, 503);
  });

  console.log(fail ? `\n${fail} of ${run} FAILED` : `\nall ${run} worker tests passed`);
  // Set the code and let Node wind down on its own. Forcing process.exit() here tripped a
  // libuv teardown assertion on Windows (exit 127, AFTER every test had reported passing)
  // once the Gemini tests raised the number of in-flight fetch stubs.
  process.exitCode = fail ? 1 : 0;
}

main();
