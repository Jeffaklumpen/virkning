# Security model and response notes

## Public repository: important limitations

This static app is NOT server-side access control. Anyone can download its encrypted pattern payloads and public key-derivation parameters from the repository/hosting and try password guesses offline. A short or reused password is vulnerable even with PBKDF2. For substantially stronger confidentiality, use a long, unique passphrase and do not put plaintext patterns in a public repository. A server-backed authenticated architecture is needed if content must be genuinely access-controlled.

A previous public commit included unencrypted purchased guide content. Deleting it from the current tree does not remove it from Git history, forked copies, search engines, caches or clones. Treat that earlier material as disclosed. A disruptive history rewrite alone cannot retract copies that were previously downloaded.

## Defenses implemented

- Downloaded guides are authenticated AES-GCM ciphertext. Password and unwrapped keys are not embedded in checked-in JavaScript.
- After login, guides are encrypted when saved to IndexedDB. Existing plaintext entries are upgraded on first successful unlock without erasing progress.
- The sign-out button removes the remembered browser login key and clears in-memory guide access. It does not delete encrypted guides or saved progress.
- The page has a restrictive Content Security Policy with no inline script execution. Avoid adding `<script>` blocks to `index.html`.
- The original source/PDF and private JSON files are excluded from Git; encrypt locally before committing.

## Practical limitations

- The current login mechanism can still remember an unextractable, decrypt-capable CryptoKey in IndexedDB. Someone controlling an unlocked device and the page origin may be able to access content while the login is remembered. Sign out on shared devices. Clearing Safari site data also removes saved progress and previously imported guides.
- Static ciphertext and historical files are still public. Protecting them more strongly requires a new long passphrase and **re-encrypting all bundled patterns and the wrapped master key together**; changing just `config/auth-config.js` would lock out existing guides. The existing local helper encrypts *new* guides only; it is not a complete password-rotation tool.
- Old browsers, site data backups and other cached copies can retain previous plaintext IndexedDB records until migration/cleanup. The browser cannot guarantee secure deletion from storage hardware.
- Do not rotate the password in GitHub source code, ask users to post it in an issue, or log it. Use a secure local re-key procedure when one is built and tested.

## Safe workflow

1. Work with original PDFs/guide JSON outside the repo. Never include them in Git commits, PRs or bug reports.
2. Add encrypted pattern files only. Update the script load order in `index.html` and cached URLs in `service-worker.js`.
3. Keep CSP restrictive, and test a fresh iPad login, a remembered login, image zoom, progress migration and offline restart.
4. Bump the offline cache version for every deploy with changed app files.
