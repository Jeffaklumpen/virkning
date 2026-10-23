# Sunbeam Art — Your Pattern Hive

A small personal crochet companion built as a static installable iPad web app (PWA).

## Structure

- `index.html` — app entrypoint and ordered scripts
- `manifest.webmanifest`, `service-worker.js` — install metadata and offline cache
- `js/app.js` — login, state, navigation, and interactive crochet actions
- `js/views.js` — library, guide and completion HTML templates
- `js/overview.js` and `css/overview.css` — single-page, scrollable guide overview with sections, step navigation and original images
- `js/guide-loader.js` — small public catalogue and on-demand encrypted-file loader
- `js/previews.js` — creates compact on-device cover previews after a pattern opens
- `data/pattern-catalog.json` — metadata and ordered assets for all bundled guides
- `js/storage.js` — encrypted on-device patterns, remembered login and progress
- `js/crypto.js` — password-derived keys and encrypted pattern decryption
- `js/patterns.js` — shared pattern selectors and output escaping
- `js/estimates.js` — editorial time ranges for projects and selectable variants
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

An older public commit contained a purchased guide in plaintext. The file has been removed from the current repository and app. **Past Git commits, forks, and third-party caches may still contain the original material.** Removing files now does not erase Git history. Never commit a purchased PDF or plaintext pattern.

## Storage and upgrades

- Progress: localStorage `kimsi-progress:<pattern-id>`
- Patterns: IndexedDB `kimsi-cozy-guides-v1`
- Remembered login: IndexedDB `sunbeam-art-login-v1`

These are device-local. Progress is preserved when pattern IDs stay the same. Clearing Safari website data can erase progress and locally installed guides. Guides are now encrypted at rest in IndexedDB with AES-GCM. Older plaintext IndexedDB copies are encrypted in place after a successful login. Remembered browser keys remain on the same device until logout, so a device with an active remembered login should not be considered locked.

## Development

Use HTTPS (or a secure local development context). Update `index.html` and the service worker shell when adding core app scripts or styles, and bump its cache version. **New guides only need their encrypted files and a catalogue entry**; the local encryption tool now updates the catalogue for you. Keep purchased pattern source/PDF content out of commits, pull requests, and public assets. The local encryption helper is `tools/encrypt-pattern.mjs` (Node 20+). Instructions for adding encrypted patterns: [docs/ADDING_PATTERNS.md](docs/ADDING_PATTERNS.md).

## Security and maintenance

See [SECURITY.md](SECURITY.md) for threat model, password rotation limitations and incident guidance, and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for module boundaries and deployment checks.

## Cute Loaf Cat variations

The `Cute Loaf Cat Plushies` guide has two selectable options: **Solid Color** and **Spotted**. Individual steps can specify `variant`, and only the currently selected variant appears in navigation. Completion tracking uses unique step IDs, so switching does not delete previous completion. Color underlining from the PDF is preserved in encrypted, enlargable reference-chart images.

The visible **Log out** button has been removed on request; remembered login and invalid-key recovery remain available.

## Time estimates

Cards in Your Pattern Hive and each pattern header display an approximate range of **active crafting hours**. The ranges account for crocheting, stuffing, yarn changes, details and assembly for a hobby crocheter; they are not generated from a timer, are not precise, and vary with experience and yarn size. They are stored separately in `js/estimates.js` as public metadata and do not expose the underlying protected pattern instructions. Cute Loaf Cat uses distinct estimates for the solid and spotted variants. New or unknown patterns do not display a made-up time estimate until reviewed.

## Fast startup and offline guides

The home screen loads only the small public catalogue, app modules and design assets. Encrypted guide payloads (and their full-size photos) are **not** downloaded on app startup. Opening a guide retrieves its encrypted parts once, decrypts that guide only and saves it encrypted in IndexedDB. On the same iPad, it can subsequently open from local storage without another network request. The service worker also caches requested parts for offline access. A new guide requires one online opening before it is available offline.

Catalogue cards display encrypted on-device cover previews, automatically generated from the original guides when needed. Purchased images remain inside the protected payload; previews are encrypted locally. Progress percentages from earlier opens are remembered without scanning all saved ciphertext on every launch.

Run `node --test tests/smoke.test.mjs` to check the public catalogue, module dependencies, encryption storage and navigation templates.

## Original crochet photographs

The grid displays original photographs rather than illustrated substitutes. After unlocking, it uses encrypted previews from device storage or automatically fetches encrypted guides to create small on-device thumbnails. The first visit can briefly show “Loading photo…” while images are prepared.

Removing a guide from the visible library does not delete saved progress or encrypted local records. Only the five bundled patterns appear in the app; older device data is preserved for safety.

## Full pattern overview

Open any guide and tap **Pattern overview** near “Back to patterns”. The app switches to a single long, scrollable overview: all steps in their original order, grouped by section, including instructions, material details, all available reference photos, tips, warnings, and current completion status. The sticky section bar lets you jump to any chapter; **Open this step** returns directly to that step in the normal guide. **Back to guide** returns to the step you were reading. The overview is read-only: it does not mark steps complete or reset progress.

The overview respects the saved ear-method and solid/spotted variant selection, showing exactly the steps visible in the normal guide. Change choices in the regular step-by-step view, then open Overview to see the revised list. Photos are accessed only from the locally decrypted guide and are lazy-loaded in the long overview to reduce initial rendering work. No new unencrypted pattern assets or personal guide content are committed.
