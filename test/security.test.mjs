import test from 'node:test';
import assert from 'node:assert/strict';
import { Vault, dailyCode, lifetime } from '../security.mjs';
import { webcrypto } from 'node:crypto';
import { encrypt, decrypt, writePayload, readPayload } from '../public/codec.js';
if (!globalThis.crypto) globalThis.crypto = webcrypto;
test('weekday, date and AM/PM follow IP timezone across midnight', () => {
  const date = new Date('2026-03-31T00:30:00Z');
  assert.equal(dailyCode('Europe/Zurich', date), 'Tuesday31AM');
  assert.equal(dailyCode('America/Phoenix', date), 'Monday30PM');
  assert.equal(dailyCode('Europe/Zurich', new Date('2026-03-31T10:00:00Z')), 'Tuesday31PM');
});
test('two seconds per five words, including partial groups', () => {
  assert.equal(lifetime(5), 2000); assert.equal(lifetime(10), 4000); assert.equal(lifetime(15), 6000); assert.equal(lifetime(6), 4000);
});
test('opening consumes the key atomically and zeros its buffer', () => {
  let now = 100; const v = new Vault(() => now); const key = Buffer.alloc(32, 7); const id = v.create(key, 10); const saved = v.messages.get(id).key;
  const first = v.open(id); assert.equal(first.duration, 4000); assert.equal(first.expires, 4100);
  assert.equal(Buffer.from(first.key, 'base64').compare(key), 0); assert.equal(saved.every(b => b === 0), true); assert.equal(v.open(id), null);
});
test('unopened card expires and session cannot be revived after expiry', () => {
  let now = 0; const v = new Vault(() => now); const id = v.create(Buffer.alloc(32), 5); const token = v.session('ip');
  assert.equal(v.authorize(token, 'other'), false); now = 120001; assert.equal(v.authorize(token, 'ip'), false);
  now = 86400001; assert.equal(v.open(id), null);
});
test('login attempts have a bounded window', () => {
  let now = 0; const v = new Vault(() => now); for (let i = 0; i < 10; i++) assert.equal(v.attempt('ip'), true);
  assert.equal(v.attempt('ip'), false); now = 600001; assert.equal(v.attempt('ip'), true);
});
test('encrypted payload survives pixel encoding; wrong keys and tampering fail', async () => {
  const text = 'A private moment just for you'; const sealed = await encrypt(text, 4000);
  const key = Buffer.from(sealed.key).toString('base64');
  const payload = { v: 1, id: 'a'.repeat(32), iv: sealed.iv, ciphertext: sealed.ciphertext };
  const image = { data: new Uint8ClampedArray(200 * 200 * 4).fill(200) };
  writePayload(image, payload); const extracted = readPayload(image); assert.deepEqual(extracted, payload);
  assert.equal((await decrypt(extracted, key)).text, text);
  await assert.rejects(decrypt(extracted, Buffer.alloc(32).toString('base64')));
  const damaged = Buffer.from(extracted.ciphertext, 'base64'); damaged[0] ^= 1;
  await assert.rejects(decrypt({ ...extracted, ciphertext: damaged.toString('base64') }, key));
  sealed.key.fill(0);
});
test('malformed image lengths are rejected', () => {
  assert.throws(() => readPayload({ data: new Uint8ClampedArray(400) }));
  assert.throws(() => writePayload({ data: new Uint8ClampedArray(4) }, { text: 'too much' }));
});
