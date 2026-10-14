# VeilDrop — encoder and shared encryption format

Two visual themes, switched by the small control at the top: warm ivory/editorial and dark fluorescent green/cyan terminal. Two sharing modes use mandatory random 256-bit conversation key files and a separate passphrase.

## Modes

**Vault / offline:** text or arbitrary files, encrypted into `.veil` packages or hidden in PNG RGB least-significant bits. No content, key, or passphrase is uploaded. A single-file offline build is available at `public/VeilDrop-Offline.html`; send that HTML to friends and open it directly in a current browser. It works without accounts or network connections. The viewer still has timed circular reveal and automatic clearing. Retained encrypted copies plus their keys can be reopened; offline expiry cannot be enforced against copied data.

**Fleeting / expiring:** text only. A mandatory key file, passphrase, and independent random server-held secret all contribute to decryption. The server never receives the conversation descriptor, passphrase, or plaintext. A trusted IP/VPN-derived timezone determines the anonymous daily code, such as `Tuesday31AM`. First reveal consumes the server secret. Unopened access expires after 24 hours. Access does not survive server restarts. The two sites share one memory-only key broker running with the encoder; decoder requests are authenticated to that broker with a separate secret.

Both use AES-256-GCM, PBKDF2-SHA-256 (800,000 iterations), HKDF-SHA-256, independent 256-bit descriptor files, a fresh 256-bit salt, and a fresh 96-bit nonce. Nonsecret encryption headers are authenticated. File names and MIME types stay inside the encrypted payload. Key files use `.vkey` (also accepts this app's `.veilkey` extension). This is **version 2 of our format**; compatibility with another VeilDrop implementation cannot be claimed until its actual HTML/source is supplied. Documentation alone is insufficient to establish format compatibility.

## Viewing and cleanup

The circle is centered directly under the held finger or mouse. Only that region is painted; plaintext is not placed in the page DOM. Releasing or losing focus hides it. The first hold starts two seconds per five words, rounding partial groups up. Ten words = four seconds; fifteen = six. The clock continues after release and theme changes. A random session watermark overlays the visible portion. Text copy and print are restricted, and a PrintScreen event clears the view when the browser delivers it. **A website cannot block operating-system screenshots or camera/video capture.** A native Android decoder with OS capture protection remains future work.

Text clears on expiry. Page hiding/exiting clears sensitive app state, key buffers, passphrase inputs, and temporary URLs; inactivity ends the session after two minutes. Decrypted file download URLs clear after 30 seconds. Saving a decrypted file deliberately creates a plaintext copy on the user's device. JavaScript garbage collection and external device copies cannot be securely wiped by this app.

**Optional source auto-delete:** select “Open offline & delete original,” grant read/write access to its folder, select the PNG/.veil file, and provide matching credentials. After successful decryption, the app checks that the original file's bytes still match, deletes that specific file through the granted folder handle, then permits viewing. If deletion fails, viewing stops. This requires browser File System Access support. Ordinary uploads cannot be deleted by a website; copies, backups, and other key files are unaffected. No secure-overwrite or forensic-erasure claim is made.

## Local preview

Node 22+, no dependencies to install.

```sh
npm run demo
```

Encoder: http://localhost:3001. Decoder: http://localhost:3002. The preview generates its broker secret only in memory. Local date-code testing uses Arizona time unless DEV_TIMEZONE is set. Production must use the trusted IP-timezone proxy.

Run just this encoder with `npm start`. Run the decoder repo with its own `npm start` after setting the matching broker secret and origin. HTTPS is required outside localhost. The offline HTML requires no server.

```sh
npm run build
npm test
npm run test:browser
```

The browser test requires installed Chromium and uses a temporary RAM profile. Project files and previews remain on the USB.

## Two-domain deployment

Encoder: https://github.com/GeorgeBrazil69/phase-1
Decoder: https://github.com/AdaptationLivingLLC/Random-files-

Set NODE_ENV=production and each site's PORT, PROXY_SECRET, and PUBLIC_ORIGINS (both approved HTTPS origins, comma-separated). Set the same long random BROKER_SECRET at both. The decoder also needs BROKER_ORIGIN pointing to the HTTPS encoder origin. Keep credentials in deployment secrets, not source control. `deployment/ip-proxy-worker.js` is an optional example for supplying trusted timezone and IP from the VPN exit. The incoming broker secret and role headers are authenticated; arbitrary client timezone headers are ignored. Proxy, TLS, and domain configuration must be completed before public use.

Use a single encoder/broker instance. No database or permanent key retention is included. Request-body logging, analytics capturing inputs, and caching of API responses must remain disabled. Short-lived memory keys are not inherently safe from infrastructure diagnostics/swap; deployment controls matter.

## Limits

The calendar code is predictable by design and serves as a shared entry gate, not the encryption key. Descriptor secrecy and passphrase strength still matter. Expiration revokes future broker access; an authorized modified recipient can retain the secret or plaintext during opening. Steganography hides ciphertext but is not a guarantee of undetectability. Recompression/resizing can destroy hidden data. These implementations have not had an independent security audit.
