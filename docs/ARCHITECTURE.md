# Code architecture

The app is a classic static site: each `<script defer>` publishes a single small global namespace; `js/app.js` owns mutable view state and event handling. No bundler or build step is required.

- `js/storage.js`: IndexedDB schemas (existing database and keys are preserved), AES-GCM encryption at rest, progress in localStorage, remembered login key.
- `js/crypto.js`: PBKDF2 key derivation, master-key unwrap and encrypted bundled pattern decoding.
- `js/patterns.js`: pure pattern validation, steps, completion summaries and safe HTML/image helpers.
- `js/app.js`: login workflow, state management, navigation, user actions, and on-demand guide hydration.
- `js/views.js`: presentation-only HTML for login, library, guide steps, and completed projects.
- `js/previews.js`: generates a small cover preview on first open, encrypted and stored separately by `js/storage.js`. A lightweight pre-encrypted cover bundle supplies all five original images without opening guides.\n- `data/encrypted/cover-previews.json`: standalone AES-GCM encrypted image payloads keyed by guide ID, authenticated with ID-specific associated data and decrypted only after sign-in.
- `js/guide-loader.js`: reads the public pattern catalogue, downloads encrypted script parts in execution order only when a guide needs loading.
- `data/pattern-catalog.json`: public ID/title/designer/revision and ordered encrypted asset paths. Never includes guide plaintext.
- `js/pwa.js`: registers the service worker; no inline JavaScript is needed.
- `css/base.css`: core variables, reset, typography and app shell.
- `css/components.css`: reusable UI elements and responsive base rules.
- `css/theme.css`: Sunbeam visual overrides, additions and installed-app safe areas.

## Guide and progress continuity

Do not change existing guide IDs. Completion entries are stored in localStorage under `kimsi-progress:<id>` and are not removed during migration or logout. IndexedDB `kimsi-cozy-guides-v1` keeps the same `guides` store keyed by guide ID. After successful password unlock, old plaintext entries become AES-GCM records; newly bundled patterns are encrypted before being stored. Manual file importing has been removed.

## Publishing checklist

1. Inspect `index.html` script order: auth-config, storage, crypto, patterns, estimates, guide-loader, views, previews, app, PWA. Encrypted guide chunks must not be on the page.
2. The worker precaches **only the small app shell**. Encrypted chunks are runtime-cached on first opening. Bump `CACHE` for shell updates.
3. Run `node --check` on JS files and check CSS brackets/syntax.
4. Test first login, remembered login, logout, image zoom and progress persistence in Safari.
5. Test installed iPad PWA online and offline. A CSP must permit local data: images and hosted Google Fonts.

## Selectable pattern variants

`variants` on a pattern enumerates options, and optional `variant` on each step selects which instructions are shown. `SunbeamPatterns.stepsFor` and `groupSteps` filter by `progress.variantOption` in addition to the existing ear option. `choose-style` renders style selectors. Shared steps omit `variant`; switching never removes progress saved under the existing pattern ID.

## Crafting time labels

Public, editorial time ranges are defined in `js/estimates.js` and loaded before `js/app.js`. Labels appear on grid cards and inside guide headers. The selected variation is read from saved progress; unrelated guide instructions remain encrypted. Include expected crochet time, colorwork, stuffing, embroidery, and finishing. Never infer a plausible-looking hour count for unfamiliar imported guides without reviewing their instructions.

## Performance boundary

The initial bundle no longer downloads or decrypts every copyrighted pattern. After successful unlock, catalogue metadata and stored IndexedDB previews populate the grid immediately; the separate small encrypted cover bundle fills any missing previews without fetching unopened guides. `getGuide(id)` reads/decrypts one saved record as needed; `SunbeamGuides.load(entry)` loads only the missing or outdated encrypted source in order. Existing local copies are used when offline, and progress keys do not change. Keep the loader's script serialization, since the legacy tooth payload replaces a shared global registry. No framework or build process is required.

For new guides, run the local encryption utility. It writes the ciphertext and adds its assets to the catalogue automatically. No per-pattern changes to `index.html` or the service worker are needed.
