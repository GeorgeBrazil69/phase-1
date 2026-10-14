const encoder = new TextEncoder();
export const ITERATIONS = 800000;
export const encode64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(s); };
export const decode64 = text => { if (typeof text !== 'string' || text.length > 32000000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) throw new Error('Invalid encoded data.'); return Uint8Array.from(atob(text), c => c.charCodeAt(0)); };
export async function fingerprint(bytes) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join(''); }
export async function newDescriptor() {
  const key = crypto.getRandomValues(new Uint8Array(32));
  return { key, file: { format: 'VeilDrop descriptor', version: 1, key: encode64(key), fingerprint: await fingerprint(key) } };
}
export async function parseDescriptor(value) {
  if (value?.format !== 'VeilDrop descriptor' || value.version !== 1) throw new Error('Choose a valid VeilDrop key file.');
  const key = decode64(value.key);
  if (key.length !== 32 || value.fingerprint !== await fingerprint(key)) { key.fill(0); throw new Error('The key file is invalid or damaged.'); }
  return key;
}
function header(packageValue) {
  const { format, version, mode, kind, salt, iv, fingerprint, kdf } = packageValue;
  return encoder.encode(JSON.stringify({ format, version, mode, kind, salt, iv, fingerprint, kdf }));
}
function validate(value) {
  if (value?.format !== 'VeilDrop' || value.version !== 2 || !['offline', 'timed'].includes(value.mode) || !['text', 'file'].includes(value.kind)) throw new Error('Unsupported VeilDrop package.');
  if (value.mode === 'timed' && !/^[A-Za-z0-9_-]{32}$/.test(value.id || '')) throw new Error('Invalid expiring card.');
  if (value.kdf !== 'PBKDF2-SHA256-800000+HKDF-SHA256' || !/^[a-f0-9]{64}$/.test(value.fingerprint || '')) throw new Error('Invalid encryption parameters.');
  const salt = decode64(value.salt), iv = decode64(value.iv), cipher = decode64(value.ciphertext);
  if (salt.length !== 32 || iv.length !== 12 || cipher.length < 16 || cipher.length > 17000000) throw new Error('Invalid package size or parameters.');
  return { salt, iv, cipher };
}
async function derive(descriptor, passphrase, salt, serverSecret, usage, preparedStretch) {
  if (!(descriptor instanceof Uint8Array) || descriptor.length !== 32) throw new Error('A 256-bit key file is required.');
  if (typeof passphrase !== 'string' || passphrase.length < 12 || passphrase.length > 1024) throw new Error('Use a passphrase of 12–1024 characters.');
  if (serverSecret && serverSecret.length !== 32) throw new Error('Invalid one-time secret.');
  const passwordBytes = encoder.encode(passphrase.normalize('NFC'));
  const input = new Uint8Array(serverSecret ? 64 : 32); input.set(descriptor); if (serverSecret) input.set(serverSecret, 32);
  let stretched;
  try {
    if (preparedStretch) stretched = new Uint8Array(preparedStretch);
    else {
      const password = await crypto.subtle.importKey('raw', passwordBytes, 'PBKDF2', false, ['deriveBits']);
      stretched = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, password, 256));
    }
    const material = await crypto.subtle.importKey('raw', input, 'HKDF', false, ['deriveKey']);
    return await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: stretched, info: encoder.encode(`VeilDrop/v2/${serverSecret ? 'timed' : 'offline'}/AES-256-GCM`) }, material, { name: 'AES-GCM', length: 256 }, false, [usage]);
  } finally { passwordBytes.fill(0); input.fill(0); stretched?.fill(0); }
}
export async function sealVeil(content, descriptor, passphrase, mode) {
  if (!['offline', 'timed'].includes(mode)) throw new Error('Select a sharing mode.');
  if (content.kind === 'file' && mode !== 'offline') throw new Error('Files use offline sharing; the expiring viewer is for text.');
  const salt = crypto.getRandomValues(new Uint8Array(32)), iv = crypto.getRandomValues(new Uint8Array(12));
  const secret = mode === 'timed' ? crypto.getRandomValues(new Uint8Array(32)) : null;
  const envelope = { format: 'VeilDrop', version: 2, mode, kind: content.kind, salt: encode64(salt), iv: encode64(iv), fingerprint: await fingerprint(descriptor), kdf: 'PBKDF2-SHA256-800000+HKDF-SHA256' };
  const plain = encoder.encode(JSON.stringify(content));
  try {
    const key = await derive(descriptor, passphrase, salt, secret, 'encrypt');
    envelope.ciphertext = encode64(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: header(envelope) }, key, plain)));
    return { envelope, secret };
  } catch (error) { secret?.fill(0); throw error; } finally { plain.fill(0); }
}
export async function prepareVeil(value, descriptor, passphrase) {
  const parsed = validate(value);
  if (await fingerprint(descriptor) !== value.fingerprint) throw new Error('This key file belongs to a different conversation.');
  // The expensive password stretch runs before timed access starts, keeping the viewing window useful.
  if (typeof passphrase !== 'string' || passphrase.length < 12 || passphrase.length > 1024) throw new Error('Enter the original passphrase (12–1024 characters).');
  const bytes = encoder.encode(passphrase.normalize('NFC'));
  try { const password = await crypto.subtle.importKey('raw', bytes, 'PBKDF2', false, ['deriveBits']);
    parsed.stretched = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: parsed.salt, iterations: ITERATIONS }, password, 256));
    return parsed;
  } finally { bytes.fill(0); }
}
export async function openVeil(envelope, descriptor, passphrase, secret = null, prepared = null) {
  const material = prepared || await prepareVeil(envelope, descriptor, passphrase);
  const { salt, iv, cipher } = material;
  if ((envelope.mode === 'timed') !== !!secret) { material.stretched?.fill(0); throw new Error('This message needs its one-time access secret.'); }
  try {
    const key = await derive(descriptor, passphrase, salt, secret, 'decrypt', material.stretched);
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: header(envelope) }, key, cipher));
    try { const content = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plain));
      if (content.kind !== envelope.kind) throw new Error('Payload mismatch.');
      if (content.kind === 'text' && (typeof content.text !== 'string' || content.text.length > 12000 || !Number.isInteger(content.duration))) throw new Error('Invalid message.');
      if (content.kind === 'file' && (typeof content.name !== 'string' || typeof content.mime !== 'string' || typeof content.data !== 'string' || decode64(content.data).length > 12000000)) throw new Error('Invalid file.');
      return content;
    } finally { plain.fill(0); }
  } catch (error) { if (error.name === 'OperationError') throw new Error('The passphrase is incorrect or the encrypted file was altered.'); throw error; } finally { material.stretched?.fill(0); }
}
export function validateVeil(value) { validate(value); return value; }
