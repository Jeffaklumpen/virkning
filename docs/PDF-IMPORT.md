# Private PDF import and custom guide editor

## How it works (no AI/API cost)

1. The user signs in with their approved Supabase account.
2. On the Sunbeam library homepage they tap **Import PDF**.
3. **Mozilla PDF.js 3.11.174**, loaded only after an import is requested, parses the PDF in browser memory. The source PDF is never uploaded, saved in Supabase, cached as a PDF, or written to IndexedDB. The file input is discarded after parsing.
4. Each PDF page is rendered locally to a compressed **WebP reference snapshot** (maximum roughly 960px along the longest dimension). Text is extracted from the PDF's text layer and common crochet labels such as `Round 1`, `Rnd 2`, and section headings are used to build an editable first draft.
5. The user can reorder steps, move a step to another section, add/remove sections and steps, rewrite text, choose the page image for any step, crop an image with mouse/touch, and select a cover. These changes happen entirely in memory until the user saves.
6. Only **Save to My Patterns** uploads the chosen WebP reference images to the private Supabase Storage bucket `sunbeam-pattern-images` and the structured, editable guide JSON to `sunbeam_custom_patterns`. Original PDF bytes never touch Supabase.
7. Saved guides appear alongside the twelve existing encrypted catalogue guides. They use the same Sunbeam guide renderer, complete/next navigation, overview, progress sync, and whole-pattern personal notes. **Edit guide** returns to the editor.

## Storage / security

- `sunbeam_custom_patterns`: `(user_id,id)` primary key, title + structured payload JSON, RLS select/insert/update/delete limited to a current approved user.
- `sunbeam-pattern-images`: private Storage bucket, object path `<auth.uid()>/<pattern-id>/<image-key>-<random>.webp`; Storage RLS select/insert/delete checks signed-in user folder and approved membership.
- Supabase Auth / RLS determines who may access finished personal guides.
- The guide JSON is private under Supabase's RLS and database encryption at rest. This is a different scheme from the legacy 12 guides, whose ciphertext is prepackaged in the static public GitHub repository. If end-to-end encryption of custom guides is desired, add a client-side encryption layer later.
- Locally, loaded personal guides can be cached in encrypted IndexedDB using the existing pattern-key.
- Only images referenced by the finished steps or cover are uploaded. Unused page snapshots are thrown away, not stored.
- To keep the UI and upload bounded, PDFs are limited to **20 MB** and **35 pages** in this version; this is a client-side performance guard.
- The parser needs a selectable PDF text layer. For scanned/image-only pages, it creates a review step with the page screenshot but cannot perform OCR or infer stitches. Users must correct all instructions.
- PDF.js JavaScript and worker are served from pinned cdnjs.cloudflare.com URLs on demand. The PDF itself is processed locally, but the browser needs access to that CDN for first-time PDF importing. For strict offline import, vendor a local, pinned copy of PDF.js in a later update.
- Guide photos are stored as WebP page images or hand-cropped WebP extracts. Users must confirm image placement and text accuracy.
- Deleting guides / cleaning up orphaned images is an administrative follow-up; the initial editor supports creating and editing. Do not delete already-uploaded photos automatically on a failed save.

## Existing features retained

- Email/password Supabase login; no public registration flow
- Encrypted pre-existing guides and covers (unchanged)
- Per-account progress and pattern notes
- Page overview and step-navigation experience
- Original photos always preferred over synthetic illustrations
- GitHub Pages PWA

## Validation

Run `node --test tests/smoke.test.mjs` and confirm GitHub Actions + Pages deployment. Test with at least one actual crochet PDF with a text layer and one scanned page in Safari on iPad (pointer/touch crop, reorder, save, reopen, edit from another device). No original PDF should appear in Supabase Storage, requests, or user-scoped database rows.

## Image preview and quality improvement

During editing, tap either the chosen step image or the cover to open a full-screen preview. Use the left/right controls to compare all page images, the + / − buttons to zoom, and Close or Escape to return without losing changes. This works with touch on iPad.

The standard draft thumbnails are intentionally small to avoid loading dozens of heavy pages on iPad. **When viewing or cropping an imported PDF page, the editor now renders that page afresh from the PDF.js in-memory document, up to approximately 7 megapixels**, then exports selected crops at WebP quality 0.94 with no artificial upscaling. The PDF is destroyed when the user saves/cancels; it is never uploaded or stored.

Previously imported guides can only use the WebP images that were already saved, so those existing blurry images cannot be reconstructed without reimporting the original PDF.

## Permanently deleting imported guides

Use **Delete pattern** from the personal pattern card or the guide header. Confirmation is required. The removal process blocks pending progress uploads, lists all stored images from the private guide folder (including previous edit versions), deletes these images through the Supabase Storage API, deletes that pattern's progress/notes from `sunbeam_progress`, and deletes the guide JSON from `sunbeam_custom_patterns`. The app also clears its local encrypted guide, thumbnail and progress.

The bundled twelve private guides cannot be deleted via this feature. Supabase RLS continues to ensure that each user can only delete their own imports. Progress inserts and updates are now conditional on the associated custom guide still existing, protecting against stale sessions recreating deleted progress.
