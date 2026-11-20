// HQ gate: every request needs a valid session cookie, else the login page is shown.
// The password lives only in the Cloudflare secret HQ_PASSWORD (never in this repo).
// If the secret is missing, the site stays locked.

const COOKIE = 'hq_session';
const DAYS = 30;
const enc = new TextEncoder();

async function sign(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, c => ({ '+': '-', '/': '_', '=': '' }[c]));
}

function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function validSession(req, secret) {
  const m = (req.headers.get('Cookie') || '').match(new RegExp(COOKIE + '=([0-9]+)\\.([A-Za-z0-9_-]+)'));
  if (!m) return false;
  if (Number(m[1]) < Date.now()) return false;
  return same(m[2], await sign(secret, 'hq:' + m[1]));
}

const page = (msg = '', status = 200) => new Response(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>HQ · Locked</title>
<style>
:root{--bg:#0B0F17;--panel:#121A28;--line:rgba(143,163,190,.28);--ink:#EEF2F7;--muted:#93A3B8;--zz:#8FD3FF;--xx:#E7B45A}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;padding:16px}
form{width:100%;max-width:340px;background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:28px 24px}
.dots{display:flex;margin-bottom:14px}.dots i{width:22px;height:22px;border-radius:50%;display:block}.dots i+i{margin-left:-8px;mix-blend-mode:screen}
h1{margin:0 0 4px;font-size:24px}p{margin:0 0 18px;color:var(--muted);font-size:14px}
input{width:100%;padding:12px 14px;border-radius:10px;border:1px solid var(--line);background:#0E141F;color:var(--ink);font-size:18px;letter-spacing:.08em}
input:focus{outline:2px solid var(--zz);outline-offset:1px}
button{width:100%;margin-top:12px;padding:12px;border:0;border-radius:10px;background:var(--ink);color:var(--bg);font-weight:700;font-size:15px;cursor:pointer}
.err{color:#FF9B9B;font-size:14px;margin:10px 0 0}
</style></head><body>
<form method="post" action="/__login">
<div class="dots"><i style="background:var(--xx)"></i><i style="background:var(--zz)"></i></div>
<h1>HQ</h1><p>Private. Enter the password to continue.</p>
<label for="pw" style="position:absolute;left:-9999px">Password</label>
<input id="pw" name="pw" type="password" inputmode="text" autocomplete="current-password" autofocus required>
<button type="submit">Unlock</button>
${msg ? `<p class="err" role="alert">${msg}</p>` : ''}
</form></body></html>`, { status, headers: { 'content-type': 'text/html;charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' } });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const secret = env.HQ_PASSWORD;
    if (!secret) return page('Locked: the HQ_PASSWORD secret is not set in Cloudflare yet.', 503);

    if (url.pathname === '/__login' && req.method === 'POST') {
      const form = await req.formData().catch(() => null);
      const pw = form ? String(form.get('pw') || '') : '';
      if (!same(pw, secret)) {
        await new Promise(r => setTimeout(r, 800)); // slow down guessing
        return page('Wrong password.', 401);
      }
      const exp = Date.now() + DAYS * 864e5;
      return new Response(null, { status: 303, headers: {
        Location: '/',
        'Set-Cookie': `${COOKIE}=${exp}.${await sign(secret, 'hq:' + exp)}; Path=/; Max-Age=${DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`,
        'cache-control': 'no-store',
      } });
    }
    if (url.pathname === '/__logout') {
      return new Response(null, { status: 303, headers: { Location: '/', 'Set-Cookie': `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` } });
    }

    if (!(await validSession(req, secret))) return page('', 401);

    const res = await env.ASSETS.fetch(req);
    const out = new Response(res.body, res);
    out.headers.set('cache-control', 'no-store');
    out.headers.set('x-robots-tag', 'noindex, nofollow');
    return out;
  },
};
