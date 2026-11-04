// Woodhouse Email Templates - password gate and storage API.
//
// Every request comes through here first (run_worker_first in
// wrangler.jsonc). Without a valid session cookie, the visitor gets the
// sign-in page and nothing else: not the app and not the template data.
//
// The password is NOT in this code. It lives in the Worker secret
// ACCESS_PASSWORD (Workers & Pages -> email-templates -> Settings ->
// Variables and Secrets). If the secret is missing, the site stays locked.
//
// Templates are kept in the D1 database bound as DB. The table is created
// automatically the first time the app asks for its data, so there are no
// migrations to run.

const COOKIE = 'et_session';
const SESSION_DAYS = 30;
const enc = new TextEncoder();

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const secret = env.ACCESS_PASSWORD;

    if (!secret) {
      return page(loginHtml({ notice: "This site hasn't been given a password yet, so it's locked. Add the ACCESS_PASSWORD secret in Cloudflare." }), 503);
    }

    if (url.pathname === '/logout') {
      return redirect('/', clearCookie());
    }

    if (url.pathname === '/login' && request.method === 'POST') {
      return login(request, env, secret);
    }

    // Images inside emails have to load for Outlook and for the customer,
    // neither of whom has the staff password, so these are public. Each one
    // sits at a long random address that can't be guessed or listed; the
    // list of images and uploading/deleting them stay behind the password.
    if (url.pathname.startsWith('/img/') && (request.method === 'GET' || request.method === 'HEAD')) {
      return serveImage(env, url.pathname.slice(5));
    }

    if (await validSession(request, secret)) {
      if (url.pathname.startsWith('/api/')) return api(request, env, url);
      const res = await env.ASSETS.fetch(request);
      const out = new Response(res.body, res);
      out.headers.set('Cache-Control', 'private, no-store');
      return out;
    }

    // Not signed in. Page loads get the sign-in screen; anything else
    // (the API, a script) gets a plain refusal.
    const wantsPage = request.method === 'GET' &&
      (request.headers.get('Accept') || '').includes('text/html');
    if (wantsPage) return page(loginHtml({ next: url.pathname + url.search }), 401);
    return json({ error: 'Sign in required.' }, 401);
  },
};

/* ------------------------------------------------------------------ API */
//
// One table holds everything. Each row is one JSON document:
//   kind 'template'  id = template id      data = the template
//   kind 'meta'      id = 'categories'     data = [{id, name}, ...]
//   kind 'meta'      id = 'usage'          data = {recent: [ids], counts: {id: n}, last: {id: time}}
//   kind 'meta'      id = 'initialised'    data = true once the starter set is loaded
//
//   GET    /api/data                 everything, in one go
//   PUT    /api/templates/:id        save one template  (body: {template, base})
//   DELETE /api/templates/:id        delete one template
//   PUT    /api/meta/:id             save categories / usage (body: {data})
//   POST   /api/import               bulk load (body: {replace, templates, categories})
//   GET    /api/images               list uploaded images (no image data)
//   POST   /api/images               upload one image (body: the file; X-Name, X-Width, X-Height headers)
//   DELETE /api/images/:id           delete one image
//
// Images are kept in their own table and served publicly at /img/:id.
//
// `base` is the updatedAt the browser last saw. If the stored copy has moved
// on since (edited in another tab or on another computer), the save is
// refused with 409 rather than silently overwriting it.

let schemaReady = false;

async function api(request, env, url) {
  if (!env.DB) return json({ error: 'No database is connected to this site.' }, 503);
  try {
    if (!schemaReady) {
      await env.DB.prepare(
        'CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (kind, id))'
      ).run();
      await ensureImageTable(env);
      schemaReady = true;
    }

    const parts = url.pathname.split('/').filter(Boolean).slice(1); // drop 'api'
    const method = request.method;

    if (parts[0] === 'data' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT kind, id, data FROM records').all();
      const out = { templates: [], meta: {} };
      for (const r of results) {
        const data = JSON.parse(r.data);
        if (r.kind === 'template') out.templates.push(data);
        else if (r.kind === 'meta') out.meta[r.id] = data;
      }
      return json(out);
    }

    if (parts[0] === 'templates' && parts[1]) {
      const id = decodeURIComponent(parts[1]);
      if (method === 'DELETE') {
        await env.DB.prepare("DELETE FROM records WHERE kind = 'template' AND id = ?").bind(id).run();
        return json({ ok: true });
      }
      if (method === 'PUT') {
        const body = await request.json();
        const t = body?.template;
        if (!t || t.id !== id) return json({ error: 'Template id does not match.' }, 400);
        const current = await env.DB.prepare("SELECT data FROM records WHERE kind = 'template' AND id = ?").bind(id).first();
        if (current && body.base != null) {
          const stored = JSON.parse(current.data);
          if (stored.updatedAt && stored.updatedAt !== body.base) {
            return json({ error: 'conflict', template: stored }, 409);
          }
        }
        await upsert(env, 'template', id, t);
        return json({ ok: true });
      }
    }

    if (parts[0] === 'meta' && parts[1] && method === 'PUT') {
      const id = parts[1];
      if (!['categories', 'usage', 'initialised'].includes(id)) return json({ error: 'Unknown setting.' }, 400);
      const body = await request.json();
      await upsert(env, 'meta', id, body?.data ?? null);
      return json({ ok: true });
    }

    if (parts[0] === 'images') {
      if (!parts[1] && method === 'GET') {
        const { results } = await env.DB.prepare('SELECT id, name, type, width, height, size, created_at FROM images ORDER BY created_at DESC').all();
        return json({ images: results });
      }
      if (!parts[1] && method === 'POST') {
        const type = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
        if (!IMAGE_TYPES.includes(type)) return json({ error: 'Only JPEG, PNG and GIF images can be uploaded.' }, 400);
        const buf = await request.arrayBuffer();
        if (!buf.byteLength) return json({ error: 'The image is empty.' }, 400);
        if (buf.byteLength > MAX_IMAGE_BYTES) return json({ error: 'That image is too large (the limit is 1.5 MB).' }, 413);
        // A restore from a JSON backup keeps the image's original address, so
        // templates that point at it keep working.
        const wanted = request.headers.get('X-Id') || '';
        const id = /^[a-z0-9]{20,40}$/.test(wanted) && !(await env.DB.prepare('SELECT 1 FROM images WHERE id = ?').bind(wanted).first()) ? wanted : randomId();
        const name = decodeURIComponent(request.headers.get('X-Name') || 'Image').slice(0, 120);
        const width = Math.max(0, parseInt(request.headers.get('X-Width'), 10) || 0);
        const height = Math.max(0, parseInt(request.headers.get('X-Height'), 10) || 0);
        const created = Date.now();
        await env.DB.prepare('INSERT INTO images (id, name, type, width, height, size, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(id, name, type, width, height, buf.byteLength, buf, created).run();
        return json({ image: { id, name, type, width, height, size: buf.byteLength, created_at: created } });
      }
      if (parts[1] && method === 'DELETE') {
        await env.DB.prepare('DELETE FROM images WHERE id = ?').bind(parts[1]).run();
        return json({ ok: true });
      }
    }

    if (parts[0] === 'import' && method === 'POST') {
      const body = await request.json();
      const templates = Array.isArray(body?.templates) ? body.templates : [];
      const stmts = [];
      if (body.replace) stmts.push(env.DB.prepare("DELETE FROM records WHERE kind = 'template'"));
      const now = Date.now();
      for (const t of templates) {
        if (!t || typeof t.id !== 'string') continue;
        stmts.push(env.DB.prepare('INSERT OR REPLACE INTO records (kind, id, data, updated_at) VALUES (?, ?, ?, ?)')
          .bind('template', t.id, JSON.stringify(t), now));
      }
      if (Array.isArray(body.categories)) {
        stmts.push(env.DB.prepare('INSERT OR REPLACE INTO records (kind, id, data, updated_at) VALUES (?, ?, ?, ?)')
          .bind('meta', 'categories', JSON.stringify(body.categories), now));
      }
      stmts.push(env.DB.prepare('INSERT OR REPLACE INTO records (kind, id, data, updated_at) VALUES (?, ?, ?, ?)')
        .bind('meta', 'initialised', 'true', now));
      // D1 runs a batch as one transaction: all of it lands, or none of it.
      for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
      return json({ ok: true, count: templates.length });
    }

    return json({ error: 'Not found.' }, 404);
  } catch (err) {
    return json({ error: 'The database could not complete that request.', detail: String(err?.message || err) }, 500);
  }
}

/* --------------------------------------------------------------- images */

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif'];
const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024; // D1 holds up to 2 MB in one value
let imageTableReady = false;

async function ensureImageTable(env) {
  if (imageTableReady) return;
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS images (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, width INTEGER, height INTEGER, size INTEGER, data BLOB NOT NULL, created_at INTEGER NOT NULL)'
  ).run();
  imageTableReady = true;
}

function randomId() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return [...b].map((x) => x.toString(36).padStart(2, '0')).join('').slice(0, 24);
}

async function serveImage(env, id) {
  const notFound = () => new Response('Image not found.', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  if (!env.DB || !/^[a-z0-9]{20,40}$/.test(id)) return notFound();
  await ensureImageTable(env);
  const row = await env.DB.prepare('SELECT type, data FROM images WHERE id = ?').bind(id).first();
  if (!row) return notFound();
  return new Response(new Uint8Array(row.data), {
    headers: {
      'Content-Type': IMAGE_TYPES.includes(row.type) ? row.type : 'application/octet-stream',
      // An image never changes once uploaded (a new upload gets a new address).
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
}

function upsert(env, kind, id, data) {
  return env.DB.prepare('INSERT OR REPLACE INTO records (kind, id, data, updated_at) VALUES (?, ?, ?, ?)')
    .bind(kind, id, JSON.stringify(data), Date.now()).run();
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/* -------------------------------------------------------------- sign in */

async function login(request, env, secret) {
  if (env.LOGIN_LIMIT) {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const { success } = await env.LOGIN_LIMIT.limit({ key: ip });
    if (!success) {
      return page(loginHtml({ error: 'Too many attempts. Wait a minute and try again.' }), 429);
    }
  }

  const form = await request.formData().catch(() => null);
  const given = String(form?.get('password') ?? '');
  const next = safeNext(String(form?.get('next') ?? '/'));

  if (!(await sameSecret(given, secret))) {
    return page(loginHtml({ error: "That password isn't right.", next }), 401);
  }

  const exp = Date.now() + SESSION_DAYS * 86400_000;
  const token = `${exp}.${await sign(secret, String(exp))}`;
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  const cookie = `${COOKIE}=${token}; Path=/; Max-Age=${SESSION_DAYS * 86400}; HttpOnly${secure}; SameSite=Lax`;
  return redirect(next, cookie);
}

async function validSession(request, secret) {
  const raw = (request.headers.get('Cookie') || '')
    .split(/;\s*/).find((c) => c.startsWith(COOKIE + '='));
  if (!raw) return false;
  const [exp, sig] = raw.slice(COOKIE.length + 1).split('.');
  if (!exp || !sig || !(Number(exp) > Date.now())) return false;
  return timingSafeEqual(sig, await sign(secret, exp));
}

/* --------------------------------------------------------------- crypto */

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode('email-templates-session:' + secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

async function sign(secret, message) {
  const mac = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(mac)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Compare by hashing both sides first, so the time taken says nothing about the password. */
async function sameSecret(a, b) {
  const [ha, hb] = await Promise.all([a, b].map((s) => crypto.subtle.digest('SHA-256', enc.encode(s))));
  const x = new Uint8Array(ha), y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* -------------------------------------------------------------- helpers */

function safeNext(n) {
  return n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/login') && !n.startsWith('/logout') && !n.startsWith('/api/') ? n : '/';
}

function clearCookie() {
  return `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

function redirect(location, cookie) {
  const headers = { Location: location, 'Cache-Control': 'no-store' };
  if (cookie) headers['Set-Cookie'] = cookie;
  return new Response(null, { status: 303, headers });
}

function page(html, status) {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function loginHtml({ error = '', notice = '', next = '/' } = {}) {
  const msg = error || notice;
  return `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Sign in · Woodhouse Email Templates</title>
<style>
:root{--bg:#F4F3EF;--surface:#fff;--ink:#23272A;--muted:#646B6E;--line:#D9D7D0;--green:#2F5D46;--green-ink:#fff;--warn-soft:#F6EBD3;color-scheme:light}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;background:var(--bg);color:var(--ink);font:14px/1.45 "Segoe UI",system-ui,-apple-system,sans-serif}
.card{width:100%;max-width:340px;background:var(--surface);border:1px solid var(--line);border-radius:4px;padding:24px 22px}
.brand{display:flex;align-items:center;gap:10px;margin-bottom:18px}
.mark{width:30px;height:30px;border-radius:3px;background:var(--green);color:var(--green-ink);display:grid;place-items:center;font-weight:700;font-size:15px}
h1{font-size:16px;margin:0}
p{margin:2px 0 0;color:var(--muted);font-size:13px}
label{display:block;font-size:13px;font-weight:600;margin-bottom:5px}
input{width:100%;height:36px;padding:0 10px;border:1px solid var(--line);border-radius:3px;background:var(--surface);color:var(--ink);font:inherit}
input:focus{outline:none;border-color:var(--green);box-shadow:0 0 0 2px rgba(47,93,70,.18)}
button{margin-top:12px;width:100%;height:36px;border:0;border-radius:3px;background:var(--green);color:var(--green-ink);font:inherit;font-weight:600;cursor:pointer}
button:hover{background:#264D3A}
.msg{background:var(--warn-soft);border-radius:3px;padding:8px 10px;font-size:13px;margin-bottom:12px}
</style>
</head>
<body>
<main class="card">
  <div class="brand"><div class="mark" aria-hidden="true">W</div><div><h1>Email Templates</h1><p>Woodhouse Adventure Park · staff only</p></div></div>
  ${msg ? `<div class="msg" role="alert">${esc(msg)}</div>` : ''}
  <form method="post" action="/login">
    <input type="hidden" name="next" value="${esc(safeNext(next))}">
    <label for="pw">Password</label>
    <input id="pw" name="password" type="password" autocomplete="current-password" required autofocus>
    <button type="submit">Sign in</button>
  </form>
</main>
</body>
</html>`;
}
