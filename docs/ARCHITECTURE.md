# Code architecture

The app is a classic static site: each `<script defer>` publishes a single small global namespace; `js/app.js` owns mutable view state and event handling. No bundler or build step is required.

- `js/storage.js`: IndexedDB schemas (existing database and keys are preserved), AES-GCM encryption at rest, progress in localStorage, remembered login key.
- `js/crypto.js`: PBKDF2 key derivation, master-key unwrap and encrypted bundled pattern decoding.
- `js/patterns.js`: pure pattern validation, steps, completion summaries and safe HTML/image helpers.
- `js/app.js`: login workflow, library rendering, guide UI, dialogs, navigation, user actions and data migration orchestration.
- `js/pwa.js`: registers the service worker; no inline JavaScript is needed.
- `css/base.css`: core variables, reset, typography and app shell.
- `css/components.css`: reusable UI elements and responsive base rules.
- `css/theme.css`: Sunbeam visual overrides, additions and installed-app safe areas.

## Guide and progress continuity

Do not change existing guide IDs. Completion entries are stored in localStorage under `kimsi-progress:<id>` and are not removed during migration or logout. IndexedDB `kimsi-cozy-guides-v1` keeps the same `guides` store keyed by guide ID. After successful password unlock, old plaintext entries become AES-GCM records; newly bundled patterns are encrypted before being stored. Manual file importing has been removed.

## Publishing checklist

1. Inspect `index.html` script order: encrypted chunks + loader, auth-config, storage, crypto, patterns, app, PWA.
2. Check that every page-local JS/CSS/encrypted file is listed in the service worker `SHELL` and increment `CACHE` when updating.
3. Run `node --check` on JS files and check CSS brackets/syntax.
4. Test first login, remembered login, logout, image zoom and progress persistence in Safari.
5. Test installed iPad PWA online and offline. A CSP must permit local data: images and hosted Google Fonts.
