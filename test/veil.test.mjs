import test from 'node:test';
import assert from 'node:assert/strict';
import { newDescriptor, parseDescriptor, sealVeil, openVeil, prepareVeil } from '../public/veil.js';
const passphrase = 'A long private test phrase';
test('offline mode requires the matching key file and passphrase; ciphertext and headers authenticate', async () => {
  const d = await newDescriptor(); assert.equal((await parseDescriptor(d.file)).length, 32);
  const a = await sealVeil({ kind: 'text', text: 'one two three four five', duration: 2000 }, d.key, passphrase, 'offline');
  const b = await sealVeil({ kind: 'text', text: 'one two three four five', duration: 2000 }, d.key, passphrase, 'offline');
  assert.notEqual(a.envelope.salt, b.envelope.salt); assert.notEqual(a.envelope.iv, b.envelope.iv); assert.notEqual(a.envelope.ciphertext, b.envelope.ciphertext);
  assert.equal((await openVeil(a.envelope, d.key, passphrase)).text, 'one two three four five');
  await assert.rejects(openVeil(a.envelope, d.key, 'An incorrect passphrase'));
  await assert.rejects(openVeil(a.envelope, new Uint8Array(32), passphrase));
  await assert.rejects(openVeil({ ...a.envelope, kind: 'file' }, d.key, passphrase));
  d.key.fill(0);
});
test('timed mode also needs the independent server secret; prepared password bytes are erased', async () => {
  const d = await newDescriptor();
  const sealed = await sealVeil({ kind: 'text', text: 'A fleeting private moment for you', duration: 4000 }, d.key, passphrase, 'timed'); sealed.envelope.id = 'z'.repeat(32);
  await assert.rejects(openVeil(sealed.envelope, d.key, passphrase));
  await assert.rejects(openVeil(sealed.envelope, d.key, passphrase, new Uint8Array(32)));
  const prepared = await prepareVeil(sealed.envelope, d.key, passphrase);
  const read = await openVeil(sealed.envelope, d.key, passphrase, sealed.secret, prepared); assert.equal(read.duration, 4000); assert.equal(prepared.stretched.every(b => b === 0), true);
  d.key.fill(0); sealed.secret.fill(0);
});
test('arbitrary file contents and filename stay encrypted and round-trip', async () => {
  const d = await newDescriptor(); const content = { kind: 'file', name: 'private.bin', mime: 'application/octet-stream', data: Buffer.from([0, 255, 1, 2]).toString('base64') };
  const sealed = await sealVeil(content, d.key, passphrase, 'offline');
  assert.equal(JSON.stringify(sealed.envelope).includes(content.name), false);
  assert.deepEqual(await openVeil(sealed.envelope, d.key, passphrase), content);
  await assert.rejects(sealVeil(content, d.key, passphrase, 'timed'));
  d.key.fill(0);
});
