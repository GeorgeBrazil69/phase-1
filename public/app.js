import { wordCount, writePayload } from './codec.js';
import { newDescriptor, sealVeil, encode64 } from './veil.js';
import { $, standalone, notify, api, drawArt, imageFrom, loadKey, initTheme } from './common.js';
let sealing = false, epoch = 0, downloadURL = null, coverBitmap = null, artSeed = Math.random();
let mode = 'timed', encoderDescriptor = null, secretFile = null, lastActivity = performance.now();
function show(section) {
  epoch++;
  if (section !== 'studio') clearComposer();
  for (const id of ['home','studio']) $(id).hidden = id !== section;
  if (!standalone) history.replaceState(null, '', section === 'studio' ? '/studio' : '/');
  window.scrollTo(0,0); lastActivity = performance.now();
}
function count() { const words = wordCount($('message').value); $('word-count').textContent = `${words} WORD${words === 1 ? '' : 'S'}`; $('duration').textContent = `${Math.ceil(words / 5) * 2} SECONDS TO READ`; }
function clearComposer() {
  $('message').value = ''; $('message').disabled = false; $('message').hidden = false; $('seal').hidden = false; $('sealed').hidden = true;
  $('seal-passphrase').value = ''; secretFile = null; $('secret-file').value = ''; $('secret-file-status').textContent = 'Optional · up to 12 MB'; $('text-only').hidden = true;
  $('download').removeAttribute('href'); if (downloadURL) URL.revokeObjectURL(downloadURL); downloadURL = null; count();
}
function logout() {
  encoderDescriptor?.fill(0); encoderDescriptor = null; $('encoder-key-status').textContent = 'REQUIRED'; $('encoder-key-upload').value = '';
  clearComposer(); coverBitmap?.close(); coverBitmap = null; $('cover-upload').value = ''; paintCover(); show('home');
}
function paintCover() {
  if (!coverBitmap) return drawArt($('cover'), artSeed);
  const canvas = $('cover'), c = canvas.getContext('2d'); const factor = Math.max(canvas.width / coverBitmap.width, canvas.height / coverBitmap.height);
  c.fillStyle = '#f3f0e8'; c.fillRect(0, 0, canvas.width, canvas.height);
  c.drawImage(coverBitmap, (canvas.width - coverBitmap.width * factor) / 2, (canvas.height - coverBitmap.height * factor) / 2, coverBitmap.width * factor, coverBitmap.height * factor);
}
$('studio-link').onclick = $('start').onclick = () => show('studio');
$('compose-again').onclick = clearComposer;
$('message').oninput = count;
$('new-art').onclick = () => { coverBitmap?.close(); coverBitmap = null; artSeed = Math.random(); paintCover(); };
$('cover-upload').onchange = async event => {
  const version = epoch;
  try { const image = await imageFrom(event.target.files[0]); if (version !== epoch) { image.close(); return; } coverBitmap?.close(); coverBitmap = image; paintCover(); }
  catch (error) { notify(error.message); } finally { event.target.value = ''; }
};
function selectMode(next) {
  mode = next; $('mode-timed').classList.toggle('selected', mode === 'timed'); $('mode-offline').classList.toggle('selected', mode === 'offline');
  $('file-compose').hidden = mode !== 'offline'; $('retention-label').textContent = mode === 'timed' ? 'UNOPENED CARDS EXPIRE IN 24 HOURS' : 'OFFLINE / NO SERVER ACCESS REQUIRED';
  $('mode-description').textContent = mode === 'timed' ? 'Key file + passphrase + one-time server access. The first reveal consumes access.' : 'Key file + passphrase. No content or encryption material is uploaded. The viewer clears automatically; retained copies can be reopened.';
  if (mode === 'timed') { secretFile = null; $('secret-file').value = ''; $('message').disabled = false; $('text-only').hidden = true; }
}
$('mode-timed').onclick = () => selectMode('timed'); $('mode-offline').onclick = () => selectMode('offline');
$('generate-key').onclick = async () => {
  const version = epoch;
  try { const generated = await newDescriptor(); if (version !== epoch) { generated.key.fill(0); return; } encoderDescriptor?.fill(0); encoderDescriptor = generated.key;
    const url = URL.createObjectURL(new Blob([JSON.stringify(generated.file)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'conversation-' + generated.file.fingerprint.slice(0, 8) + '.vkey'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('encoder-key-status').textContent = generated.file.fingerprint.slice(0, 8).toUpperCase(); notify('Key file generated. Keep it separate from your encrypted card.');
  } catch (error) { notify(error.message); }
};
$('encoder-key-upload').onchange = async event => { const version = epoch; try { const key = await loadKey(event.target.files[0]); if (version !== epoch) { key.fill(0); return; } encoderDescriptor?.fill(0); encoderDescriptor = key; $('encoder-key-status').textContent = 'KEY READY'; } catch (error) { notify(error.message); } finally { event.target.value = ''; } };
$('secret-file').onchange = event => { const file = event.target.files[0]; if (!file) return; if (file.size > 12000000) return notify('Choose a file smaller than 12 MB.'); secretFile = file; $('secret-file-status').textContent = file.name; $('text-only').hidden = false; $('message').value = ''; $('message').disabled = true; $('output-format').value = 'veil'; count(); };
$('text-only').onclick = () => { secretFile = null; $('secret-file').value = ''; $('secret-file-status').textContent = 'Optional · up to 12 MB'; $('text-only').hidden = true; $('message').disabled = false; };
$('seal').onclick = async () => {
  if (sealing) return;
  const words = wordCount($('message').value), selectedMode = mode;
  if (!encoderDescriptor) return notify('Generate or choose your conversation key file first.');
  if (!secretFile && (words < 1 || words > 500)) return notify('Write between 1 and 500 words.');
  if (!crypto.subtle) return notify('Use HTTPS or open the offline application locally.');
  const version = epoch; sealing = true; $('seal').disabled = true; $('message').disabled = true;
  const descriptor = new Uint8Array(encoderDescriptor); let encrypted, fileBytes;
  try {
    let content;
    if (secretFile) { fileBytes = new Uint8Array(await secretFile.arrayBuffer()); content = { kind: 'file', name: secretFile.name, mime: secretFile.type || 'application/octet-stream', data: encode64(fileBytes) }; }
    else content = { kind: 'text', text: $('message').value, duration: Math.ceil(words / 5) * 2000 };
    encrypted = await sealVeil(content, descriptor, $('seal-passphrase').value, selectedMode); fileBytes?.fill(0); content = null;
    if (version !== epoch) return;
    const envelope = encrypted.envelope;
    // Generate output before requesting server retention, so a capacity error never consumes or saves access.
    const output = document.createElement('canvas'); let blob;
    if ($('output-format').value === 'png') {
      const canvas = $('cover'), c = canvas.getContext('2d');
      // Reserve the fixed-size message ID before embedding; no secret goes into the carrier.
      if (selectedMode === 'timed') envelope.id = 'a'.repeat(32);
      writePayload(c.getImageData(0, 0, canvas.width, canvas.height), envelope);
    }
    if (selectedMode === 'timed') { const result = await api('seal', { key: encode64(encrypted.secret), words }); envelope.id = result.id; encrypted.secret.fill(0); }
    if (version !== epoch) return;
    const png = $('output-format').value === 'png';
    if (png) {
      const canvas = $('cover'), image = writePayload(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height), envelope);
      output.width = canvas.width; output.height = canvas.height; output.getContext('2d').putImageData(image, 0, 0);
      blob = await new Promise(resolve => output.toBlob(resolve, 'image/png')); output.width = output.height = 1;
    } else blob = new Blob([JSON.stringify(envelope)], { type: 'application/vnd.veildrop+json' });
    if (!blob) throw new Error('The encrypted package could not be generated.');
    if (version !== epoch) return;
    $('message').value = ''; $('seal-passphrase').value = ''; secretFile = null; $('secret-file').value = ''; $('message').hidden = true; $('seal').hidden = true; $('sealed').hidden = false; count();
    if (downloadURL) URL.revokeObjectURL(downloadURL); downloadURL = URL.createObjectURL(blob); $('download').href = downloadURL; $('download').download = png ? 'veildrop-card.png' : 'veildrop-message.veil'; $('download').textContent = png ? 'Download encrypted PNG ↓' : 'Download encrypted package ↓';
    notify('Sealed. Original input cleared. Key file and passphrase are required to open it.');
  } catch (error) { notify(error.message); }
  finally { descriptor.fill(0); fileBytes?.fill(0); encrypted?.secret?.fill(0); sealing = false; $('seal').disabled = false; if (!$('message').hidden && !secretFile) $('message').disabled = false; }
};
document.querySelectorAll('.exit').forEach(button => button.onclick = logout);
for (const event of ['pointerdown','keydown','input']) document.addEventListener(event, () => { lastActivity = performance.now(); }, { passive:true });
setInterval(() => { if (!$('studio').hidden && performance.now()-lastActivity >= 120000) { logout(); notify('Composer cleared after inactivity.'); } },1000);
document.addEventListener('visibilitychange', () => { if (document.hidden) logout(); });
window.addEventListener('pagehide', logout);
window.addEventListener('pageshow', event => { if (event.persisted) logout(); });
document.querySelector('.wordmark').onclick = event => { event.preventDefault(); show('home'); };
initTheme(); paintCover();
if (standalone) { selectMode('offline'); $('mode-timed').hidden = true; }
show(!standalone && location.pathname === '/studio' ? 'studio' : 'home');
