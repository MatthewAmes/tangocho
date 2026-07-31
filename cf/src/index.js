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

const json = (obj, status) => new Response(JSON.stringify(obj), {
  status: status || 200,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
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

  let storageKey = null;
  const auth = req.headers.get("authorization") || "";
  if (auth.startsWith("Bearer ")) {
    const session = await verifySession(secret, auth.slice(7));
    if (!session) return json({ error: "invalid or expired session" }, 401);
    storageKey = "g:" + session.sub;
  } else {
    const code = (url.searchParams.get("code") || "").trim();
    if (/^[A-Za-z0-9]{4,32}$/.test(code)) storageKey = "code:" + code;
  }
  if (!storageKey) return json({ error: "no valid auth (session or sync code)" }, 400);

  if (req.method === "GET") {
    const data = await env.SYNC.get(storageKey, { type: "json" });
    return json({ data: data || null });
  }
  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch (e) { return json({ error: "invalid JSON body" }, 400); }
    await env.SYNC.put(storageKey, JSON.stringify(body));
    return json({ ok: true });
  }
  return new Response("Method not allowed", { status: 405 });
}

/* ── tts ── */
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
  const auth = req.headers.get("authorization") || "";
  const session = auth.startsWith("Bearer ") ? await verifySession(env.SESSION_SECRET, auth.slice(7)) : null;
  const isAdmin = env.ADMIN_WARM_TOKEN && req.headers.get("x-admin-token") === env.ADMIN_WARM_TOKEN;
  if (!session && !isAdmin) return json({ error: "sign-in required to generate new audio" }, 401);
  if (!env.GOOGLE_TTS_API_KEY) return json({ error: "TTS not configured yet" }, 503);

  const g = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize?key=" + env.GOOGLE_TTS_API_KEY, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: "ja-JP", name: voiceName },
      audioConfig: { audioEncoding: "MP3", speakingRate: rate, pitch: 0 },
    }),
  });
  if (!g.ok) return json({ error: "Google TTS request failed: " + (await g.text().catch(() => "")).slice(0, 300) }, 502);

  const { audioContent } = await g.json();
  const bytes = b64ToBytes(audioContent);
  await env.TTS.put(key, bytes);
  return new Response(bytes, { headers: audioHeaders });
}

export default {
  async fetch(req, env) {
    const { pathname } = new URL(req.url);
    // both path shapes so one build of index.html runs on Netlify and here
    if (pathname === "/api/sync" || pathname === "/.netlify/functions/sync") return handleSync(req, env);
    if (pathname === "/api/tts" || pathname === "/.netlify/functions/tts") return handleTts(req, env);
    return env.ASSETS.fetch(req);
  },
};
