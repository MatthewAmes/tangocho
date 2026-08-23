// tangocho on Cloudflare Workers — static assets + the sync and TTS APIs in one Worker.
//
// Ported from the two Netlify Functions. Three things had to change:
//   node:crypto        -> Web Crypto (HMAC + RS256 verify are async here)
//   Buffer/base64      -> atob/btoa with Uint8Array helpers
//   @netlify/blobs     -> KV, one namespace for sync JSON and one for the audio cache
//
// R2 would suit blobs better, but enabling it needs a dashboard opt-in and a card on
// file. KV is fine here — clips are ~15KB against a 25MB per-value ceiling. Its ~1k
// writes/day free-tier cap only bites during bulk pre-warming; normal study writes one
// clip per genuinely new word.
//
// The API paths are deliberately still /.netlify/functions/* as well as /api/*, so the
// exact same built index.html runs on Netlify and here. That makes the cutover
// reversible — no flag day, and both backends can be compared side by side.

const GOOGLE_CLIENT_ID = "249268364314-fkmn7ol1jtkv12sme6fjp70fj2cpr6l3.apps.googleusercontent.com";
const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const SESSION_DAYS = 730;
const VOICES = { f: "ja-JP-Neural2-B", m: "ja-JP-Neural2-C" };

/* ── base64url <-> bytes ── */
function b64urlToBytes(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
// Google returns standard base64 (+/ with padding), not base64url — decode it directly
// rather than round-tripping it through the url-safe alphabet.
function b64ToBytes(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const utf8 = (s) => new TextEncoder().encode(s);
const fromUtf8 = (b) => new TextDecoder().decode(b);

/* ── our own session token: base64url(payload).base64url(HMAC-SHA256) ── */
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey("raw", utf8(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToB64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, utf8(msg))));
}
async function signSession(secret, sub, email) {
  const body = bytesToB64url(utf8(JSON.stringify({ sub, email, exp: Date.now() + SESSION_DAYS * 86400000 })));
  return body + "." + (await hmac(secret, body));
}
async function verifySession(secret, token) {
  const parts = (token || "").split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = await hmac(secret, body);
  // constant-time-ish: lengths equal and no early exit on first difference
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff) return null;
  let payload;
  try { payload = JSON.parse(fromUtf8(b64urlToBytes(body))); } catch (e) { return null; }
  if (!payload.exp || payload.exp < Date.now()) return null;
  return payload;
}

/* ── verify a Google ID token against Google's public keys ── */
async function verifyGoogleIdToken(token) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("malformed token");
  const [h, p, s] = parts;
  const header = JSON.parse(fromUtf8(b64urlToBytes(h)));
  const payload = JSON.parse(fromUtf8(b64urlToBytes(p)));

  if (header.alg !== "RS256") throw new Error("unexpected alg");
  if (payload.aud !== GOOGLE_CLIENT_ID) throw new Error("aud mismatch");
  if (payload.iss !== "https://accounts.google.com" && payload.iss !== "accounts.google.com") throw new Error("iss mismatch");
  if (!payload.exp || payload.exp * 1000 < Date.now()) throw new Error("expired");

  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error("could not fetch Google JWKS");
  const { keys } = await res.json();
  const jwk = (keys || []).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("no matching key");

  const key = await crypto.subtle.importKey(
    "jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"],
  );
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlToBytes(s), utf8(h + "." + p));
  if (!ok) throw new Error("bad signature");
  return payload;
}

const json = (obj, status, extraHeaders) => new Response(JSON.stringify(obj), {
  status: status || 200,
  headers: { "content-type": "application/json", "cache-control": "no-store", ...(extraHeaders || {}) },
});

/* ── sync ── */
async function handleSync(req, env) {
  const url = new URL(req.url);
  const secret = env.SESSION_SECRET;
  if (!secret) return json({ error: "server not configured" }, 503);

  if (url.searchParams.get("exchange") === "1") {
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
    try {
      const { idToken } = await req.json();
      const payload = await verifyGoogleIdToken(idToken);
      return json({ session: await signSession(secret, payload.sub, payload.email || null), email: payload.email || null });
    } catch (e) {
      return json({ error: "invalid Google token: " + e.message }, 401);
    }
  }

  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return json({ error: "sign-in required" }, 401);
  const session = await verifySession(secret, auth.slice(7));
  if (!session) return json({ error: "invalid or expired session" }, 401);
  const storageKey = "g:" + session.sub;

  if (req.method === "GET") {
    const data = await env.SYNC.get(storageKey, { type: "json" });
    return json({ data: data || null });
  }
  if (req.method === "POST") {
    const MAX_BODY = 1024 * 1024;   // 1 MiB; real snapshots are ~300 KB
    const len = Number(req.headers.get("content-length") || 0);
    if (len > MAX_BODY) return json({ error: "payload too large" }, 413);
    const raw = await req.text();
    if (raw.length > MAX_BODY) return json({ error: "payload too large" }, 413);
    let body;
    try { body = JSON.parse(raw); } catch (e) { return json({ error: "invalid JSON body" }, 400); }
    const bad = validateSnapshotBody(body);
    if (bad) return json({ error: bad }, 400);
    await env.SYNC.put(storageKey, JSON.stringify(body));
    return json({ ok: true });
  }
  return new Response("Method not allowed", { status: 405 });
}
const SNAPSHOT_PREFIX = "jpn101:";
const MAX_SNAPSHOT_KEYS = 64;
function validateSnapshotBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "bad shape";
  const snap = body.snapshot;
  if (!snap || typeof snap !== "object" || Array.isArray(snap)) return "missing snapshot";
  const keys = Object.keys(snap);
  if (keys.length > MAX_SNAPSHOT_KEYS) return "too many keys";
  for (const k of keys) {
    if (!k.startsWith(SNAPSHOT_PREFIX) || !SAFE_KEY(k)) return "bad key " + k;
    if (typeof snap[k] !== "string") return "value for " + k + " must be a string";
  }
  return null;
}
const SAFE_KEY = (k) => k !== "__proto__" && k !== "constructor" && k !== "prototype";

/* ── tts ── */
// A cache miss is a real billable Google call. 400/day per user keeps the free-tier KV
// write quota (1,000/day) safe even under abuse; a real learner never gets near it (roughly
// one clip per genuinely new word/line). Counters are best-effort (KV isn't atomic) — fine
// for abuse control, not for billing-exact accounting.
const TTS_DAILY_PER_USER = 400, TTS_DAILY_GLOBAL = 1500;
const dayKeyUTC = () => new Date().toISOString().slice(0, 10);
async function bumpQuota(env, key, limit) {
  const k = "ttsq:" + key + ":" + dayKeyUTC();
  const n = Number((await env.TTS.get(k)) || 0) + 1;
  if (n > limit) return false;
  await env.TTS.put(k, String(n), { expirationTtl: 2 * 86400 });
  return true;
}
async function sha256Hex(s) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", utf8(s)));
  return Array.from(d).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function handleTts(req, env) {
  const url = new URL(req.url);
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405 });

  const text = (url.searchParams.get("text") || "").slice(0, 500).trim();
  if (!text) return json({ error: "missing text" }, 400);

  const voiceName = VOICES[url.searchParams.get("voice") === "m" ? "m" : "f"];
  let rate = parseFloat(url.searchParams.get("rate"));
  if (!isFinite(rate) || rate <= 0) rate = 0.9;
  rate = Math.max(0.4, Math.min(1.5, rate));

  const key = await sha256Hex(voiceName + "|" + rate + "|" + text);
  const audioHeaders = { "content-type": "audio/mpeg", "cache-control": "public, max-age=31536000, immutable" };

  const hit = await env.TTS.get(key, { type: "arrayBuffer" });
  if (hit) return new Response(hit, { headers: audioHeaders });

  // Cache miss = a real billable Google call, so it needs a signed-in session (or the
  // admin token used once to pre-warm the whole library).
  if (!env.SESSION_SECRET) return json({ error: "server not configured" }, 503);
  const auth = req.headers.get("authorization") || "";
  const session = auth.startsWith("Bearer ") ? await verifySession(env.SESSION_SECRET, auth.slice(7)) : null;
  const isAdmin = env.ADMIN_WARM_TOKEN && req.headers.get("x-admin-token") === env.ADMIN_WARM_TOKEN;
  if (!session && !isAdmin) return json({ error: "sign-in required to generate new audio" }, 401);
  if (!env.GOOGLE_TTS_API_KEY) return json({ error: "TTS not configured yet" }, 503);

  if (!isAdmin) {
    if (!(await bumpQuota(env, "u:" + session.sub, TTS_DAILY_PER_USER))
     || !(await bumpQuota(env, "all", TTS_DAILY_GLOBAL))) {
      console.warn(JSON.stringify({ ev: "tts_quota", sub: session.sub.slice(0, 6) }));
      return json({ error: "daily audio limit reached — try again tomorrow" }, 429, { "retry-after": "3600" });
    }
  }

  const g = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize?key=" + env.GOOGLE_TTS_API_KEY, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: "ja-JP", name: voiceName },
      audioConfig: { audioEncoding: "MP3", speakingRate: rate, pitch: 0 },
    }),
  });
  if (!g.ok) {
    console.warn(JSON.stringify({ ev: "tts_google_fail", status: g.status }));
    return json({ error: "Google TTS request failed: " + (await g.text().catch(() => "")).slice(0, 300) }, 502);
  }
  console.log(JSON.stringify({ ev: "tts_gen", chars: text.length, voice: voiceName }));

  const { audioContent } = await g.json();
  const bytes = b64ToBytes(audioContent);
  await env.TTS.put(key, bytes);
  return new Response(bytes, { headers: audioHeaders });
}

/* ── item-level feeds for the Input tab ──
   The browser can't fetch these directly: none of them send CORS headers. Fetching them
   here also means one shared cache instead of every device hammering the same feeds.

   The URL list lives HERE, not in a query parameter, on purpose — taking a URL from the
   client would turn this Worker into an open proxy that anyone could point at anything,
   including internal addresses. The client sends a source id and nothing else. */
const FEEDS = {
  // listening — YouTube channels, resolved from each channel's own RSS autodiscovery link
  "ci-natural":     "https://www.youtube.com/feeds/videos.xml?channel_id=UCXo8kuCtqLjL1EH6m4FJJNA",
  "ci-tanaka":      "https://www.youtube.com/feeds/videos.xml?channel_id=UCvryaJCRHcTVjOC_DcuYxGg",
  "ci-peppa":       "https://www.youtube.com/feeds/videos.xml?channel_id=UCldXjuJ7Qg8wTNktOnVXkGw",
  "ci-shun":        "https://www.youtube.com/feeds/videos.xml?channel_id=UCu6sZrHyl4hSS2PvlUo2XZA",
  "yt-sayuri":      "https://www.youtube.com/feeds/videos.xml?channel_id=UCqMY-cp1He6IAi1cIz-gX1g",
  "yt-akane":       "https://www.youtube.com/feeds/videos.xml?channel_id=UCh-GhnQ7qDQmS6Bz3pGc1Mw",
  "yt-miku":        "https://www.youtube.com/feeds/videos.xml?channel_id=UCSbH_BPR_AoARW6RDYLlLog",
  "yt-onomappu":    "https://www.youtube.com/feeds/videos.xml?channel_id=UCLuymDHiOySsAQ9Nc-4NoEQ",
  "yt-gamegengo":   "https://www.youtube.com/feeds/videos.xml?channel_id=UCsXJuG5tSNRr9IwfjMbNvqQ",
  "yt-yuyu":        "https://www.youtube.com/feeds/videos.xml?channel_id=UCCyQwSS6m2mVB0-H2FOFJtw",
  "pod-yuyu":       "https://www.youtube.com/feeds/videos.xml?channel_id=UC8dWfySP_cKDMFj6aFfQbFA",
  "yt-sambon":      "https://www.youtube.com/feeds/videos.xml?channel_id=UC0ujXryUUwILURRKt9Eh7Nw",
  "pod-teppei-beg": "https://nihongoconteppei.com/feed/",
  // reading
  "rd-nhkeasier":   "https://nhkeasier.com/feed/",
  "rd-yomujp":      "https://yomujp.com/feed/",
  "rd-watanoc":     "http://watanoc.com/feed/",
  "rd-crunchy":     "https://crunchynihongo.com/feed/",
};
const FEED_TTL = 6 * 3600;      // seconds; these publish daily at most
// Bump whenever the parsed item shape changes. Cached JSON outlives a deploy, so without
// this a new field (like the video id needed for durations) is simply absent for hours
// and the feature looks broken for reasons nothing in the code explains.
const FEED_SCHEMA = 2;

function unent(s) {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&").trim();
}
const tag = (block, name) => {
  const m = block.match(new RegExp("<" + name + "[^>]*>([\\s\\S]*?)</" + name + ">"));
  return m ? unent(m[1]) : "";
};

// Atom (YouTube) and RSS 2.0 differ in element names but carry the same three things we
// need: a title, a link, and a date.
function parseFeed(xml, limit) {
  const atom = xml.includes("<entry>");
  const blocks = xml.split(atom ? "<entry>" : "<item>").slice(1, limit + 1);
  const items = [];
  for (const b of blocks) {
    const title = tag(b, "title");
    let url = "";
    if (atom) {
      const vid = tag(b, "yt:videoId");
      url = vid ? "https://www.youtube.com/watch?v=" + vid : (b.match(/<link[^>]*href="([^"]+)"/) || [])[1] || "";
    } else {
      url = tag(b, "link") || (b.match(/<link[^>]*>([^<]+)</) || [])[1] || "";
    }
    if (!title || !url) continue;
    const at = Date.parse(tag(b, atom ? "published" : "pubDate")) || 0;
    const it = { title: title.slice(0, 180), url, at };
    if (atom) it.vid = tag(b, "yt:videoId");
    const dur = tag(b, "itunes:duration");          // podcasts often carry it; YouTube never does
    if (dur) {
      const p = dur.split(":").map(Number);
      const s = p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : p[0];
      if (s > 0) it.sec = s;
    }
    items.push(it);
  }
  return items;
}

/* Real video lengths.
   Guessing from a channel's typical length is how a one-hour Peppa Pig special gets
   advertised as five minutes, which breaks the one promise this tab makes.

   Two ways to get the true number, one of which does not work:
     - scraping the watch page: the number is in there, but YouTube answers Cloudflare's
       egress IPs with HTTP 429, consistently, however slowly you ask. Dead end.
     - the official Data API: one call covers 50 videos and costs 1 unit of a 10,000/day
       quota. It needs YouTube Data API v3 switched on for the Google Cloud project.

   So this calls the API with the key that's already here and does nothing if it isn't
   enabled — the moment that project setting is switched on, durations start appearing
   with no redeploy. When there's no duration the UI says nothing rather than guessing. */
function iso8601ToSeconds(d) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(d || "");
  if (!m) return 0;
  return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
}
async function ytDurations(ids, env) {
  const out = {};
  if (!ids.length) return out;

  const missing = [];
  await Promise.all(ids.map(async (id) => {
    const hit = await env.TTS.get("dur:" + id);
    if (hit) out[id] = Number(hit); else missing.push(id);
  }));
  if (!missing.length || !env.GOOGLE_TTS_API_KEY) return out;

  // Don't re-ask on every single request while the API is switched off.
  if (await env.TTS.get("dur:disabled")) return out;

  try {
    const r = await fetch("https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id="
      + missing.slice(0, 50).join(",") + "&key=" + env.GOOGLE_TTS_API_KEY);
    if (r.status === 403) { await env.TTS.put("dur:disabled", "1", { expirationTtl: 3600 }); return out; }
    if (!r.ok) return out;
    const { items } = await r.json();
    await Promise.all((items || []).map(async (v) => {
      const sec = iso8601ToSeconds(v.contentDetails && v.contentDetails.duration);
      if (!sec) return;
      out[v.id] = sec;
      await env.TTS.put("dur:" + v.id, String(sec));   // no TTL: a video's length is forever
    }));
  } catch (e) { /* leave durations unknown rather than wrong */ }
  return out;
}

async function handleFeed(req, env) {
  const url = new URL(req.url);
  const ids = (url.searchParams.get("src") || "").split(",").map((s) => s.trim()).filter((s) => FEEDS[s]).slice(0, 8);
  if (!ids.length) return json({ error: "unknown source" }, 400);
  const limit = Math.min(30, Math.max(1, parseInt(url.searchParams.get("n") || "15", 10)));

  const out = {};
  await Promise.all(ids.map(async (id) => {
    const key = `feed:v${FEED_SCHEMA}:${id}:${limit}`;
    const hit = await env.TTS.get(key, { type: "json" });          // same namespace, distinct prefix
    if (hit) { out[id] = hit; return; }
    try {
      const r = await fetch(FEEDS[id], {
        headers: { "user-agent": "Mozilla/5.0 (compatible; tangocho/1.0)", accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" },
        cf: { cacheTtl: 1800, cacheEverything: true },
      });
      if (!r.ok) { out[id] = []; return; }
      // Teppei's feed is ~1.4MB of 1,558 episodes; only the head is ever needed.
      const xml = (await r.text()).slice(0, 900000);
      const items = parseFeed(xml, limit);
      out[id] = items;
      if (items.length) await env.TTS.put(key, JSON.stringify(items), { expirationTtl: FEED_TTL });
    } catch (e) { out[id] = []; }
  }));

  // Resolve real lengths for the first few YouTube items of each source. Bounded on
  // purpose: enough for the client to find something that fits the time asked for,
  // without turning one tap into fifty page fetches.
  if (url.searchParams.get("dur") === "1") {
    const wanted = [];
    for (const id of ids) for (const it of (out[id] || []).slice(0, 8)) if (it.vid && !it.sec) wanted.push(it.vid);
    const secs = await ytDurations(wanted, env);
    let got = 0;
    for (const id of ids) for (const it of (out[id] || [])) if (it.vid && secs[it.vid]) { it.sec = secs[it.vid]; got++; }
    // write the enriched copy back so the next visitor gets the lengths for free
    if (got) await Promise.all(ids.map((id) => (out[id] || []).length
      ? env.TTS.put(`feed:v${FEED_SCHEMA}:${id}:${limit}`, JSON.stringify(out[id]), { expirationTtl: FEED_TTL })
      : null));
  }
  return json({ feeds: out });
}

// GIS requirements per https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid#content_security_policy
// (verify against that page when editing — Google occasionally changes the paths).
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/client",   // the app is one inline <script>
  "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",     // React's <style>{CSS}</style> + head <style> + GIS button styles
  "img-src 'self' data:",                                                       // mascot GIF data URIs, SVG-noise background
  "media-src 'self' blob:",                                                     // TTS: same-origin clips + object URLs
  "connect-src 'self' https://accounts.google.com/gsi/",
  "frame-src https://accounts.google.com/gsi/",
  "font-src 'self'",
  "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
].join("; ");
const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};
function withSecurityHeaders(res, { csp = true } = {}) {
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) h.set(k, v);
  if (csp) h.set("content-security-policy", CSP);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

export default {
  async fetch(req, env) {
    const { pathname } = new URL(req.url);
    // both path shapes so one build of index.html runs on Netlify and here
    if (pathname === "/api/sync" || pathname === "/.netlify/functions/sync") return withSecurityHeaders(await handleSync(req, env), { csp: false });
    if (pathname === "/api/tts" || pathname === "/.netlify/functions/tts") return withSecurityHeaders(await handleTts(req, env), { csp: false });
    if (pathname === "/api/feed" || pathname === "/.netlify/functions/feed") return withSecurityHeaders(await handleFeed(req, env), { csp: false });
    const asset = await env.ASSETS.fetch(req);
    const isHtml = (asset.headers.get("content-type") || "").includes("text/html");
    return withSecurityHeaders(asset, { csp: isHtml });
  },
};

export { iso8601ToSeconds, parseFeed, unent, validateSnapshotBody, signSession, verifySession, withSecurityHeaders, bumpQuota };
