import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { Vault, dailyCode } from './security.mjs';
const vault = new Vault();
const production = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT || 3000);
const root = fileURLToPath(new URL('./public/', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' };
const timer = setInterval(() => vault.cleanup(), 1000); timer.unref();
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
function identity(req) {
  // Only trust proxy identity when the proxy presents an explicitly configured secret.
  const brokerTrusted = process.env.BROKER_SECRET && equal(req.headers['x-still-broker-secret'], process.env.BROKER_SECRET);
  const trusted = brokerTrusted || process.env.PROXY_SECRET && equal(req.headers['x-still-proxy-secret'], process.env.PROXY_SECRET);
  const ip = trusted ? req.headers['x-still-client-ip'] : req.socket.remoteAddress;
  const zone = trusted ? req.headers['x-still-timezone'] : (!production && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip) ? process.env.DEV_TIMEZONE || 'America/Phoenix' : null);
  if (!ip || ip.length > 100) throw new Error('Location unavailable');
  if (zone) new Intl.DateTimeFormat('en-US', { timeZone: zone });
  return { ip, zone };
}
function reply(res, status, obj) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); }
async function body(req) {
  let value = ''; for await (const chunk of req) { value += chunk; if (value.length > 8192) throw new Error('Request too large'); }
  return JSON.parse(value || '{}');
}
const cookieToken = req => /(?:^|;\s*)still_session=([A-Za-z0-9_-]+)/.exec(req.headers.cookie || '')?.[1];
const cookie = (token, maxAge) => `still_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${production ? '; Secure' : ''}`;
export const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'; object-src 'none'");
  if (production) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    const host = (req.headers.host || '').split(':')[0];
    const brokerTrusted = process.env.BROKER_SECRET && equal(req.headers['x-still-broker-secret'], process.env.BROKER_SECRET);
    const site = brokerTrusted && req.headers['x-still-site'] === 'decoder' ? 'decoder' : process.env.APP_ROLE || (host === process.env.DECODER_HOST ? 'decoder' : host === process.env.ENCODER_HOST ? 'encoder' : 'combined');
    if (!path.startsWith('/api/')) {
      if (req.method !== 'GET') return reply(res, 405, { error: 'Method not allowed' });
      const file = ({ '/': 'index.html', '/studio': 'index.html', '/collection': 'index.html', '/style.css': 'style.css', '/app.js': 'app.js', '/codec.js': 'codec.js', '/veil.js': 'veil.js', '/VeilDrop-Offline.html': 'VeilDrop-Offline.html' })[path];
      if (!file) return reply(res, 404, { error: 'Not found' });
      let content = await readFile(root + file);
      if (file === 'index.html') content = Buffer.from(content.toString().replace('<body>', `<body data-site="${site}">`));
      const ext = file.slice(file.lastIndexOf('.'));
      if (file === 'VeilDrop-Offline.html') res.setHeader('Content-Disposition', 'attachment; filename=VeilDrop.html');
      res.writeHead(200, { 'Content-Type': types[ext] }); return res.end(content);
    }
    const { ip, zone } = identity(req);
    if (process.env.APP_ROLE === 'decoder' && process.env.BROKER_ORIGIN) {
      if (!process.env.BROKER_SECRET) return reply(res, 503, { error: 'The key broker connection is not configured.' });
      if (!['/api/context', '/api/login', '/api/logout', '/api/open', '/api/heartbeat'].includes(path)) return reply(res, 403, { error: 'Use the encoder website to create cards.' });
      const payload = req.method === 'POST' ? JSON.stringify(await body(req)) : undefined;
      const upstream = await fetch(new URL(path, process.env.BROKER_ORIGIN), { method: req.method, headers: { 'Content-Type': 'application/json', 'x-still-broker-secret': process.env.BROKER_SECRET, 'x-still-site': 'decoder', 'x-still-client-ip': ip, 'x-still-timezone': zone || '', Origin: req.headers.origin || '', Cookie: req.headers.cookie || '' }, body: payload, redirect: 'error', signal: AbortSignal.timeout(10000) });
      const setCookie = upstream.headers.get('set-cookie'); if (setCookie) res.setHeader('Set-Cookie', setCookie);
      res.writeHead(upstream.status, { 'Content-Type': 'application/json' }); return res.end(await upstream.text());
    }
    if (req.method === 'GET' && path === '/api/context') return reply(res, 200, { timezone: zone, configured: !!zone });
    if (req.method !== 'POST') return reply(res, 405, { error: 'Method not allowed' });
    const origin = req.headers.origin;
    const expected = (process.env.PUBLIC_ORIGINS || process.env.PUBLIC_ORIGIN || `http://localhost:${port}`).split(',').map(v => v.trim());
    if (!origin || !expected.includes(origin)) return reply(res, 403, { error: 'Request origin rejected' });
    const data = await body(req);
    if (path === '/api/seal') {
      if (site === 'decoder') return reply(res, 403, { error: 'Use the studio website to create cards.' });
      if (!vault.attempt('seal:' + ip)) return reply(res, 429, { error: 'Please wait before sealing more cards.' });
      if (vault.messages.size >= 5000) return reply(res, 503, { error: 'Studio is at capacity. Try again later.' });
      if (!Number.isInteger(data.words) || data.words < 1 || data.words > 500) return reply(res, 400, { error: 'Use between 1 and 500 words.' });
      if (typeof data.key !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(data.key)) return reply(res, 400, { error: 'Invalid key' });
      const key = Buffer.from(data.key, 'base64'); if (key.length !== 32) return reply(res, 400, { error: 'Invalid key' });
      const id = vault.create(key, data.words); key.fill(0); return reply(res, 201, { id });
    }
    if (path === '/api/login') {
      if (site === 'encoder') return reply(res, 403, { error: 'Use the collection website to open cards.' });
      if (!zone) return reply(res, 503, { error: 'IP timezone detection needs to be connected before this decoder can be used.' });
      if (!vault.attempt('login:' + ip)) return reply(res, 429, { error: 'Too many attempts. Try again in ten minutes.' });
      if (!equal(data.password, dailyCode(zone))) return reply(res, 401, { error: 'The access code did not match.' });
      const token = vault.session(ip); res.setHeader('Set-Cookie', cookie(token, 120)); return reply(res, 200, { ok: true });
    }
    const token = cookieToken(req);
    if (path === '/api/logout') { vault.sessions.delete(token); res.setHeader('Set-Cookie', cookie('', 0)); return reply(res, 200, { ok: true }); }
    if (!vault.authorize(token, ip)) return reply(res, 401, { error: 'Session ended. Enter the access code again.' });
    if (path === '/api/open') {
      if (site === 'encoder') return reply(res, 403, { error: 'Use the collection website to open cards.' });
      if (typeof data.id !== 'string' || !/^[A-Za-z0-9_-]{32}$/.test(data.id)) return reply(res, 400, { error: 'Invalid card' });
      const result = vault.open(data.id); if (!result) return reply(res, 410, { error: 'This card has expired or has already been opened.' });
      return reply(res, 200, result);
    }
    if (path === '/api/heartbeat') { res.setHeader('Set-Cookie', cookie(token, 120)); return reply(res, 200, { ok: true }); }
    return reply(res, 404, { error: 'Not found' });
  } catch { return reply(res, 400, { error: 'Unable to complete the request.' }); }
});
if (process.argv[1] === fileURLToPath(import.meta.url)) server.listen(port, '127.0.0.1', () => console.log(`Still: http://localhost:${port}`));
