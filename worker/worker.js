// Proxy: receives lead form POST, creates map-download entry in WordPress.
// Credential stays in Worker secrets (WP_USER, WP_APP_PASSWORD) — never in the browser.

const ALLOWED_ORIGIN = "https://residualmix.org";
const WP_ENDPOINT = "https://residualmix.org/wp-json/wp/v2/map-download";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response("Invalid JSON", { status: 400, headers: CORS_HEADERS });
    }

    const name = String(body.name || "").trim().slice(0, 200);
    const email = String(body.email || "").trim().slice(0, 200);
    const org = String(body.org || "").trim().slice(0, 200);
    if (!name || !org || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return new Response("Missing or invalid fields", { status: 400, headers: CORS_HEADERS });
    }

    const wpRes = await fetch(WP_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Basic " + btoa(`${env.WP_USER}:${env.WP_APP_PASSWORD}`),
      },
      body: JSON.stringify({
        title: `Download: ${name} (${org})`,
        status: "private", // ponytail: private hides the public /map-download/<slug>/ page
        acf: {
          downloads_full_name: name,
          "downloads_e-mail": email,
          downloads_organization: org,
        },
      }),
    });

    // Own log in D1 — survives independent of the WordPress side.
    try {
      await env.DB.prepare(
        "INSERT INTO leads (name, email, org, wp_ok) VALUES (?, ?, ?, ?)"
      ).bind(name, email, org, wpRes.ok ? 1 : 0).run();
    } catch (e) {
      console.error("D1 log failed:", e);
    }

    const status = wpRes.ok ? 201 : 502;
    return new Response(JSON.stringify({ ok: wpRes.ok }), {
      status,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  },
};
