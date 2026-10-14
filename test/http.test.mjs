import test from 'node:test';
import { request } from 'node:http';
import assert from 'node:assert/strict';
import { server } from '../server.mjs';
import { dailyCode } from '../security.mjs';
test('HTTP access enforces origin, trusted timezone, domain role, one opening and logout', async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  process.env.PUBLIC_ORIGINS = base;
  process.env.PROXY_SECRET = 'only-the-trusted-proxy-knows-this';
  process.env.ENCODER_HOST = 'studio.test'; process.env.DECODER_HOST = 'collection.test';
  const trusted = { 'x-still-proxy-secret': process.env.PROXY_SECRET, 'x-still-client-ip': '198.51.100.10', 'x-still-timezone': 'Pacific/Kiritimati' };
  const post = (path, value, headers = {}) => new Promise((resolve, reject) => {
    const req = request(base + '/api/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, ...headers } }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: res.statusCode, headers: { 'set-cookie': res.headers['set-cookie']?.[0] || '' } })));
    }); req.on('error', reject); req.end(JSON.stringify(value));
  });
  try {
    const c = await (await fetch(base + '/api/context', { headers: trusted })).json(); assert.equal(c.timezone, 'Pacific/Kiritimati');
    const untrusted = await (await fetch(base + '/api/context', { headers: { ...trusted, 'x-still-proxy-secret': 'wrong' } })).json(); assert.notEqual(untrusted.timezone, 'Pacific/Kiritimati');
    assert.equal((await post('seal', { key: Buffer.alloc(32).toString('base64'), words: 5 }, { Origin: 'https://attacker.test' })).status, 403);
    assert.equal((await post('seal', { key: Buffer.alloc(32).toString('base64'), words: 5 }, { Host: 'collection.test', ...trusted })).status, 403);
    assert.equal((await post('login', { password: dailyCode('Pacific/Kiritimati') }, { Host: 'studio.test', ...trusted })).status, 403);
    const sealed = await post('seal', { key: Buffer.alloc(32, 9).toString('base64'), words: 10 }, { Host: 'studio.test', ...trusted }); assert.equal(sealed.status, 201); const { id } = await sealed.json();
    assert.equal((await post('open', { id }, trusted)).status, 401);
    assert.equal((await post('login', { password: 'wrong' }, trusted)).status, 401);
    const login = await post('login', { password: dailyCode('Pacific/Kiritimati') }, { Host: 'collection.test', ...trusted }); assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0]; const headers = { Host: 'collection.test', Cookie: cookie, ...trusted };
    const opened = await post('open', { id }, headers); assert.equal(opened.status, 200); assert.equal((await opened.json()).duration, 4000);
    assert.equal((await post('open', { id }, headers)).status, 410);
    assert.equal((await post('logout', {}, headers)).status, 200);
    assert.equal((await post('heartbeat', {}, headers)).status, 401);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
