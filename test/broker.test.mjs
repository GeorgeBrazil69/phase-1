import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { dailyCode } from '../security.mjs';
test('separate encoder and decoder share only authenticated one-time broker access', async () => {
  const encoder = 'http://127.0.0.1:3101', decoder = 'http://127.0.0.1:3102';
  const env = { ...process.env, NODE_ENV: 'development', BROKER_SECRET: 'a-secret-only-for-this-test', PUBLIC_ORIGINS: encoder + ',' + decoder, DEV_TIMEZONE: 'America/Phoenix', BROKER_ORIGIN: encoder };
  const children = [spawn(process.execPath, ['encoder.mjs'], { cwd: new URL('../', import.meta.url), env: { ...env, PORT: '3101' }, stdio: 'ignore' }), spawn(process.execPath, ['decoder.mjs'], { cwd: new URL('../', import.meta.url), env: { ...env, PORT: '3102' }, stdio: 'ignore' })];
  const post = (origin, path, value, extra = {}) => fetch(origin + '/api/' + path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(value) });
  try {
    for (const origin of [encoder, decoder]) { let ready = false; for (let i = 0; i < 50; i++) { try { if ((await fetch(origin)).ok) { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 100)); } assert.equal(ready, true); }
    const encodedPage = await (await fetch(encoder)).text(); assert.match(encodedPage, /data-site="encoder"/);
    const decodedPage = await (await fetch(decoder)).text(); assert.match(decodedPage, /data-site="decoder"/);
    const sealed = await post(encoder, 'seal', { key: Buffer.alloc(32, 11).toString('base64'), words: 15 }); assert.equal(sealed.status, 201); const { id } = await sealed.json();
    assert.equal((await post(decoder, 'seal', { key: Buffer.alloc(32).toString('base64'), words: 5 })).status, 403);
    assert.equal((await post(encoder, 'login', { password: dailyCode('America/Phoenix') })).status, 403);
    assert.equal((await post(encoder, 'login', { password: dailyCode('America/Phoenix') }, { 'x-still-site': 'decoder', 'x-still-broker-secret': 'wrong' })).status, 403);
    const login = await post(decoder, 'login', { password: dailyCode('America/Phoenix') }); assert.equal(login.status, 200);
    const Cookie = login.headers.get('set-cookie').split(';')[0]; const read = await post(decoder, 'open', { id }, { Cookie }); assert.equal(read.status, 200);
    const result = await read.json(); assert.equal(result.key, Buffer.alloc(32, 11).toString('base64')); assert.equal(result.duration, 6000);
    assert.equal((await post(decoder, 'open', { id }, { Cookie })).status, 410);
    assert.equal((await post(decoder, 'logout', {}, { Cookie })).status, 200);
    assert.equal((await post(decoder, 'heartbeat', {}, { Cookie })).status, 401);
  } finally { for (const child of children) { child.kill('SIGTERM'); if (child.exitCode === null) await new Promise(resolve => child.once('exit', resolve)); } }
});
