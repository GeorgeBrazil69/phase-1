const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
export const b64 = bytes => btoa(String.fromCharCode(...bytes));
export const unb64 = str => Uint8Array.from(atob(str), c => c.charCodeAt(0));
export const wordCount = text => text.trim().split(/\s+/u).filter(Boolean).length;
const MAGIC = [83, 84, 73, 76, 76, 1];
export function writePayload(image, object) {
  const bytes = encoder.encode(JSON.stringify(object));
  const header = new Uint8Array(10); header.set(MAGIC); new DataView(header.buffer).setUint32(6, bytes.length);
  const payload = new Uint8Array(header.length + bytes.length); payload.set(header); payload.set(bytes, header.length);
  if (payload.length * 8 > image.data.length / 4 * 3) throw new Error('Choose a larger cover image.');
  let bit = 0;
  for (let i = 0; i < image.data.length && bit < payload.length * 8; i++) {
    if (i % 4 === 3) continue;
    image.data[i] = (image.data[i] & 254) | ((payload[bit >> 3] >> (7 - (bit & 7))) & 1); bit++;
  }
  return image;
}
export function readPayload(image) {
  const capacity = Math.floor(image.data.length / 4 * 3 / 8);
  if (capacity < 10) throw new Error('This image does not contain a Still card.');
  function read(n) { const out = new Uint8Array(n); let bit = 0; for (let i = 0; bit < n * 8; i++) { if (i % 4 === 3) continue; out[bit >> 3] |= (image.data[i] & 1) << (7 - (bit & 7)); bit++; } return out; }
  const header = read(10); if (MAGIC.some((v, i) => v !== header[i])) throw new Error('This image does not contain a Still card. Send the original PNG file without resizing.');
  const size = new DataView(header.buffer).getUint32(6); if (!size || size > capacity - 10 || size > 17000000) throw new Error('The card is damaged.');
  const value = JSON.parse(decoder.decode(read(size + 10).subarray(10)));
  if (value.format === 'VeilDrop' && value.version === 2) return value;
  if (value.v !== 1 || typeof value.id !== 'string' || !/^[A-Za-z0-9_-]{32}$/.test(value.id) || typeof value.iv !== 'string' || typeof value.ciphertext !== 'string') throw new Error('The card is damaged.');
  if (unb64(value.iv).length !== 12 || unb64(value.ciphertext).length < 16) throw new Error('The card is damaged.');
  return value;
}
export async function encrypt(text, duration) {
  const bytes = encoder.encode(JSON.stringify({ text, duration }));
  const key = crypto.getRandomValues(new Uint8Array(32)); const iv = crypto.getRandomValues(new Uint8Array(12));
  try { const imported = await crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['encrypt']);
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, imported, bytes));
    return { key, iv: b64(iv), ciphertext: b64(ciphertext) };
  } finally { bytes.fill(0); }
}
export async function decrypt(payload, encodedKey) {
  const bytes = unb64(encodedKey);
  try { const key = await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['decrypt']);
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(payload.iv) }, key, unb64(payload.ciphertext)));
    try { return JSON.parse(decoder.decode(plain)); } finally { plain.fill(0); }
  } finally { bytes.fill(0); }
}
