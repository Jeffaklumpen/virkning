# Guide development

## Current guide formats

- Little Tooth: AES-256-GCM encrypted gzip JSON stored in `data/encrypted/tooth.js`
- Baby Boba Bunny: AES-256-GCM encrypted gzip JSON split across numbered files in `data/encrypted/bunny/`
- Baby Appa (Huniebeecrafts): AES-256-GCM encrypted gzip JSON including individual high-resolution reference photos in `data/encrypted/appa/` (23 parts and loader). Includes 62 steps and source color-coded round strips.
- Brie Mouse (Oak and Marlow): AES-256-GCM encrypted gzip JSON with 42 reference photographs in `data/encrypted/brie/` (22 parts and loader), arranged as 51 steps in 10 groups.
- Cute Loaf Cat (Annie Carraway Art): AES-256-GCM encrypted gzip JSON with photo references and color charts in `data/encrypted/loaf/` (34 parts and loader). Supports solid and spotted variants within one guide.

- Donut Kitty (The Whimsy Whale): AES-256-GCM encrypted guide with RSA-OAEP wrapped session key and separately encrypted original cover; ear-method options are preserved.
- Easter Bunny Bundle (Krochet by Kris): one AES-256-GCM/gzip guide covering Bunny, Carrot and Carrot Hat. Its 43 original PDF pages are protected zoomable WebP references alongside 44 text steps. Source PDF and plaintext stay outside Git.

## Add or upgrade a guide safely

1. Start from content you have permission to use; work locally rather than pushing plaintext or PDFs into this public repository.
2. Convert the guide into the existing JSON schema (`id`, `title`, `groups[].steps`, `images`). Keep an existing ID unchanged to preserve progress.
3. Encrypt locally using Web Crypto AES-256-GCM, with a fresh random 96-bit nonce and authenticated associated data. Never commit the password, derived encryption key, or unencrypted material.
4. Put ciphertext in `data/encrypted/<pattern-name>/`. The encryption helper now registers its ordered files, revision and public title in `data/pattern-catalog.json` automatically. **Do not add guide parts to `index.html` or the service-worker precache.**
5. Increment guide `revision` when changing an existing guide, then test login, guide download, step images, saved progress, and offline mode on an iPad after the guide has been opened online once.

## Local encryption helper (Node.js 20+)

Prepare a single guide JSON file or an existing private `window.KIMSI_PRELOADED_GUIDES` JS file **outside Git**. From the project root, run:

```sh
SUNBEAM_PASSWORD='your-private-password' node tools/encrypt-pattern.mjs /path/to/my-guide.json guide-slug
```

Use `SUNBEAM_REVISION=3` when updating revision 2. The script derives the same browser login key from the public auth configuration, generates a fresh random IV, uses authenticated AES-256-GCM and writes numbered encrypted parts and a loader. It refuses to overwrite existing output parts; remove/backup the previous encrypted slug directory before an intentional update. The script also writes or updates the matching entry in `data/pattern-catalog.json`; keep that file in the same commit as the ciphertext. The runtime loads `part-XX.js` in order, followed by `loader.js`, only when opening the guide. No HTML/service-worker edits are needed. Change the service-worker cache version only when you change the app shell.

Do not hardcode the password in this script or upload the original file, shell history, or environment configuration. Be careful with shell commands containing secrets in shared systems.

## Add or replace a lightweight encrypted cover

After producing a small 440 × 440 WebP photograph from the original guide **outside
the public repository**, run:

```sh
SUNBEAM_PASSWORD='your-private-password' node tools/encrypt-cover.mjs guide-id /absolute/path/to/cover.webp
```

The cover utility verifies the password against the wrapped login key, encrypts
the supplied image with AES-256-GCM and updates
`data/encrypted/cover-previews.json`. Commit only the encrypted JSON. Never
commit plaintext cover images or purchased PDFs. Each cover is keyed by stable
guide ID and independent of the full guide; no new script tags or asset lists
are necessary. Bump the service-worker cache version when changing the bundle.

- Plush Mermaid Mod (Oak and Marlow): encrypted Fable Collection add-on, with 3 selectable styles, all 8 PDF pages as protected references, and original reference photos. A separate animal pattern is required. ID: `oakandmarlow-plush-mermaid-mod`.

- Pooh Snuggler (frauskau.dk): 16-page AES-256-GCM/gzip encrypted personal pattern, 33 interactive steps, ten sections and 16 protected, zoomable original PDF pages. ID: `frauskau-pooh-snuggler`. The PDF and original source must not be committed.
