# Guide development

## Current guide formats

- Little Tooth: AES-256-GCM encrypted gzip JSON stored in `data/encrypted/tooth.js`
- Baby Boba Bunny: AES-256-GCM encrypted gzip JSON split across numbered files in `data/encrypted/bunny/`
- Baby Appa (Huniebeecrafts): AES-256-GCM encrypted gzip JSON including individual high-resolution reference photos in `data/encrypted/appa/` (23 parts and loader). Includes 62 steps and source color-coded round strips.
- Brie Mouse (Oak and Marlow): AES-256-GCM encrypted gzip JSON with 42 reference photographs in `data/encrypted/brie/` (22 parts and loader), arranged as 51 steps in 10 groups.
- Cute Loaf Cat (Annie Carraway Art): AES-256-GCM encrypted gzip JSON with photo references and color charts in `data/encrypted/loaf/` (34 parts and loader). Supports solid and spotted variants within one guide.
- Donut Kitty: **not bundled** because the previous public asset was unencrypted; existing on-device copies remain available, but manual in-app importing is no longer offered.

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
