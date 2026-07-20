import { getStore } from "@netlify/blobs";

// Cross-device sync for tangocho. Each device holds a short "sync code";
// any device using the same code reads/writes the same snapshot blob here.
// GET  ?code=XXXX  -> { data: <last saved snapshot> | null }
// POST ?code=XXXX  body: <snapshot JSON>  -> { ok: true }
export default async (req) => {
  const url = new URL(req.url);
  const code = (url.searchParams.get("code") || "").trim();
  if (!/^[A-Za-z0-9]{4,32}$/.test(code)) {
    return new Response(JSON.stringify({ error: "invalid sync code" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const store = getStore("tangocho-sync");

  if (req.method === "GET") {
    const data = (await store.get(code, { type: "json" })) || null;
    return new Response(JSON.stringify({ data }), {
      headers: { "content-type": "application/json" },
    });
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: "invalid JSON body" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    await store.setJSON(code, body);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
    });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config = { path: "/.netlify/functions/sync" };
