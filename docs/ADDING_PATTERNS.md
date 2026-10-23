# Guide development

## Current guide formats

- Little Tooth: AES-256-GCM encrypted gzip JSON stored in `data/encrypted/tooth.js`
- Baby Boba Bunny: AES-256-GCM encrypted gzip JSON split across numbered files in `data/encrypted/bunny/`
- Donut Kitty: **not bundled** because the previous public asset was unencrypted; already installed copies in IndexedDB remain available, and local import is supported.

## Add or upgrade a guide safely

1. Start from content you have permission to use; work locally rather than pushing plaintext or PDFs into this public repository.
2. Convert the guide into the existing JSON schema (`id`, `title`, `groups[].steps`, `images`). Keep an existing ID unchanged to preserve progress.
3. Encrypt locally using Web Crypto AES-256-GCM, with a fresh random 96-bit nonce and authenticated associated data. Never commit the password, derived encryption key, or unencrypted material.
4. Put the ciphertext and public metadata in `data/encrypted/<pattern-name>/`; refer to the files in order from `index.html`. Add every file to the offline shell in `service-worker.js`.
5. Increment the guide `revision` metadata and service-worker cache version, then test login, step images, saved progress, and offline mode on an iPad.

Local import accepts either guide JSON or the historical `window.KIMSI_PRELOADED_GUIDES = [...];` format. This import is strictly client-side and does not publish content to GitHub.
