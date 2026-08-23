// Tests for the Cloudflare Worker (cf/src/index.js): the ISO-8601 duration parser, the RSS/Atom
// feed parser, the sync-body validator, session sign/verify, the TTS quota counter, and the
// security-header wrapper. Plain Node asserts, same style as tools/test-fsrs.mjs.
//
//   node tools/test-worker.mjs
import {
  iso8601ToSeconds, parseFeed, unent, validateSnapshotBody,
  signSession, verifySession, withSecurityHeaders, bumpQuota,
} from "../cf/src/index.js";

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

  console.log(fail ? `\n${fail} of ${run} FAILED` : `\nall ${run} worker tests passed`);
  process.exit(fail ? 1 : 0);
}

main();
