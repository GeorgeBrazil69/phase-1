import { parseDescriptor } from './veil.js';
export const $ = id => document.getElementById(id);
export const standalone = document.body.dataset.standalone === 'true';
export const ui = { theme: 'gallery' };
let notification;
export function notify(text) { $('toast').textContent = text; $('toast').hidden = false; clearTimeout(notification); notification = setTimeout(() => { $('toast').hidden = true; $('toast').textContent = ''; }, 6000); }
export async function api(path, data, keepalive = false) {
  const response = await fetch('/api/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), credentials: 'same-origin', cache: 'no-store', keepalive });
  const value = await response.json(); if (!response.ok) { if (response.status === 401) document.dispatchEvent(new Event('session-ended')); throw new Error(value.error || 'Unable to complete this action.'); }
  return value;
}
export function drawArt(canvas, seed = .45) {
  const c = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
  const t = seed;
  const sky = c.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#506c74'); sky.addColorStop(.48, '#c6b493'); sky.addColorStop(1, '#ebe0c4'); c.fillStyle = sky; c.fillRect(0, 0, w, h);
  const sunX = w * (.3 + t * .3), sunY = h * .25;
  const halo = c.createRadialGradient(sunX, sunY, 20, sunX, sunY, w * .38); halo.addColorStop(0, '#f4eacbbb'); halo.addColorStop(1, '#f4eacb00'); c.fillStyle = halo; c.fillRect(0, 0, w, h);
  c.fillStyle = '#f1d5a4'; c.beginPath(); c.arc(sunX, sunY, w * .095, 0, Math.PI * 2); c.fill();
  for (let layer = 0; layer < 5; layer++) {
    const y = h * (.48 + layer * .115); c.beginPath(); c.moveTo(0, h);
    c.lineTo(0, y); for (let x = 0; x <= w + 20; x += 20) c.lineTo(x, y + Math.sin(x / w * 4 + layer * .9 + t * 4) * h * .07 + Math.cos(x / w * 8 + layer) * h * .018);
    c.lineTo(w, h); c.closePath(); c.fillStyle = ['#657d7b', '#3e6265', '#264b50', '#163b42', '#102e35'][layer]; c.fill();
  }
  let s = Math.floor(t * 999999) || 1; c.globalAlpha = .055;
  for (let i = 0; i < 17000; i++) { s = (s * 16807) % 2147483647; const x = s % w; s = (s * 16807) % 2147483647; c.fillStyle = i % 2 ? '#fff' : '#000'; c.fillRect(x, s % h, 1, 1); }
  c.globalAlpha = 1;
}
export async function imageFrom(file, pngOnly = false) {
  if (!file || file.size > 15000000) throw new Error('Choose an image smaller than 15 MB.');
  if (pngOnly) { const sig = new Uint8Array(await file.slice(0, 8).arrayBuffer()); if (sig.join(',') !== '137,80,78,71,13,10,26,10') throw new Error('Choose the original PNG file.'); }
  const bitmap = await createImageBitmap(file, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  if (bitmap.width * bitmap.height > 20000000) { bitmap.close(); throw new Error('Choose an image under 20 megapixels.'); }
  return bitmap;
}
export async function loadKey(file) { if (!file || file.size > 4096) throw new Error('Choose a small .vkey descriptor file.'); return parseDescriptor(JSON.parse(await file.text())); }
export function initTheme() {
  $('theme-switch').addEventListener('click', () => {
    ui.theme = ui.theme === 'gallery' ? 'terminal' : 'gallery';
    document.body.classList.toggle('terminal', ui.theme === 'terminal');
    $('footer-mode').textContent = ui.theme === 'terminal' ? 'SIGNAL ACTIVE / EPHEMERAL CHANNEL' : 'A DIFFERENT KIND OF CORRESPONDENCE.';
  });
  if ($('hero-canvas')) drawArt($('hero-canvas'));
}
