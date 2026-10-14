# VeilDrop encoder

This repository contains only the encoder application. The other application is distributed through its own repository. Shared cryptography and design helpers use the same version-2 encrypted format.

Encoder: https://github.com/GeorgeBrazil69/phase-1
Decoder: https://github.com/AdaptationLivingLLC/Random-files-

Node 22+, no dependencies. Run `npm start`; configure `.env` or hosting environment from `.env.example`. Run `npm run build` for the role-specific offline HTML; `npm test` checks the encryption/access logic. Download this app's offline HTML at `/offline.html`.

Both modes require a random 256-bit .vkey descriptor and a separate passphrase. AES-256-GCM, PBKDF2-SHA-256 with 800,000 iterations, HKDF-SHA-256, fresh random salt and nonce. Vault encrypts text/files fully offline. Fleeting encrypts text and also requires a server-held, one-time secret; the encoder hosts this access broker, and the decoder connects with BROKER_ORIGIN and matching BROKER_SECRET. Configure both origins in PUBLIC_ORIGINS, HTTPS, and trusted IP timezone headers through the proxy example for production.

Decoder viewing uses a circle under the held finger, two seconds per five words, immediate hiding on release, random session watermark, copy/print restrictions, and automatic clearing. Offline source deletion requires explicitly granted folder access, deletes only the selected unchanged encrypted file after successful decryption, and does not erase other copies. Website controls cannot block OS screenshots or external cameras. Offline copies can be reopened if their credentials are retained. Plaintext is not deliberately persisted; browser/OS memory cannot be forensically wiped by a website. File downloads intentionally save readable copies; their in-app links clear after 30 seconds.

The date code follows the visitor's public-IP timezone including VPN location. Local testing uses DEV_TIMEZONE, default Arizona. It is a predictable shared gate, not an encryption key. The broker is memory-only: unopened secrets expire after 24 hours and are lost on restart. A modified authorized recipient can retain material during opening. No independent security audit has been performed. Existing third-party VeilDrop formats are not assumed compatible without their source.
