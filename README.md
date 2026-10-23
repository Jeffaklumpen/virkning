# Sunbeam Art — Your Pattern Hive

A small personal crochet companion built as a static installable iPad web app (PWA).

## Structure

- `index.html` — app entrypoint and ordered scripts
- `manifest.webmanifest`, `service-worker.js` — install metadata and offline cache
- `js/app.js` — app orchestration and interactive crochet guide UI
- `js/storage.js` — encrypted on-device patterns, remembered login and progress
- `js/crypto.js` — password-derived keys and encrypted pattern decryption
- `js/patterns.js` — shared pattern selectors and output escaping
- `js/pwa.js` — standalone service-worker registration
- `css/base.css`, `css/components.css`, `css/theme.css` — foundations, interface components, brand and responsive overrides
- `config/auth-config.js` — public PBKDF2 key-wrapping parameters
- `data/encrypted/tooth.js` — encrypted Little Tooth guide
- `data/encrypted/bunny/` — encrypted Baby Boba Bunny (12 high-resolution parts and loader)
- `data/encrypted/appa/` — encrypted Baby Appa guide (23 high-resolution ciphertext parts and loader)
- `data/encrypted/brie/` — encrypted Brie Mouse guide (22 ciphertext parts and loader; 51 steps, 42 original reference images)
- `data/encrypted/loaf/` — encrypted Cute Loaf Cat pattern (34 parts, 72 steps, 84 reference images, 2 selectable variations)
- `assets/` — app icons and decorative SVGs

## Important privacy notes

This repository and its static hosting are **public**. The site's client-side password protects the encrypted Little Tooth, Baby Boba Bunny, Baby Appa, Brie Mouse and Cute Loaf Cat payloads, but it is **not server authentication**. An attacker can download those ciphertexts and attempt offline password guesses. Use a long, unique password for meaningful protection.

The legacy `private-guide.js` contained an **unencrypted purchased Donut Kitty guide**, so it has been removed from the current repository tree and site. **Past Git commits, forks, and third-party caches may still contain the original plaintext.** Deleting a file in a new commit cannot erase Git history. Do not assume this original content is fully private.

Donut Kitty already installed on a device remains stored locally in IndexedDB. This release removes the manual file-import button and import code. On a new device Donut Kitty is not bundled and therefore will not appear automatically. Never re-add its original plaintext file to the public repository.

## Storage and upgrades

- Progress: localStorage `kimsi-progress:<pattern-id>`
- Patterns: IndexedDB `kimsi-cozy-guides-v1`
- Remembered login: IndexedDB `sunbeam-art-login-v1`

These are device-local. Progress is preserved when pattern IDs stay the same. Clearing Safari website data can erase progress and locally installed guides. Guides are now encrypted at rest in IndexedDB with AES-GCM. Older plaintext IndexedDB copies are encrypted in place after a successful login. Remembered browser keys remain on the same device until logout, so a device with an active remembered login should not be considered locked.

## Development

Use HTTPS (or a secure local development context). Update `index.html` and the service worker cache list when changing scripts, and bump the cache name for offline deployments. Keep purchased pattern source/PDF content out of commits, pull requests, and public assets. The local encryption helper is `tools/encrypt-pattern.mjs` (Node 20+). Instructions for adding encrypted patterns: [docs/ADDING_PATTERNS.md](docs/ADDING_PATTERNS.md).

## Security and maintenance

See [SECURITY.md](SECURITY.md) for threat model, password rotation limitations and incident guidance, and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for module boundaries and deployment checks.

## Cute Loaf Cat variations

The `Cute Loaf Cat Plushies` guide has two selectable options: **Solid Color** and **Spotted**. Individual steps can specify `variant`, and only the currently selected variant appears in navigation. Completion tracking uses unique step IDs, so switching does not delete previous completion. Color underlining from the PDF is preserved in encrypted, enlargable reference-chart images.

The visible **Log out** button has been removed on request; remembered login and invalid-key recovery remain available.
