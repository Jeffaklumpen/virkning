# Sunbeam — private Supabase account sign-in

The private PWA requires an approved Supabase Auth email/password account on **every new app opening**. The original single-password login and optional "Connect cloud backup" UI are retired.

## Project

- Supabase: Sunbeam (project `ksmgnigwknzfargzjfzm`)
- Frontend config: `config/supabase-config.js` (only the safe public publishable key)
- Login: `js/cloud.js` — Auth REST API, **in-memory session only**
- Private pattern key migration: `js/keyring.js`
- Encrypted guides and photos: remain on static GitHub Pages and encrypted locally
- Database: `public.sunbeam_members`, `public.sunbeam_progress`, `public.sunbeam_keyrings`; RLS enabled on all three

## First sign-in (once per user)

1. The administrator creates an email/password user in Supabase Auth.
2. The administrator adds their UUID to `sunbeam_members` as an approved account. The existing Kimsi owner is already approved.
3. The user signs in on the **main welcome screen** with their Supabase email and account password.
4. If the account does not yet have a keyring envelope, the PWA asks for the **previous pattern password** once. This is a migration of previously encrypted content, not a second permanent login. Verify the previous password in-browser against `config/auth-config.js`.
5. The PWA derives the previous 256-bit legacy password key locally and encrypts **the derived key bytes, not the password** under a new PBKDF2/AES-256-GCM key derived from the Supabase password with a random salt and IV. The encrypted envelope is saved in the user's RLS-protected `sunbeam_keyrings` row.
6. On the next sign-in (including from another device), the user only needs email + Supabase password; the client unwraps the encrypted keyring locally and unlocks all bundled encrypted patterns without the old password.
7. The first successful library opening migrates local Kimsi progress to the owner's user-scoped progress store without deleting legacy data. Remote progress is pulled and changes sync automatically.

### Important password-change caveat

The encrypted keyring is bound to the **Supabase account password at initial setup**. If that password is changed or reset, its envelope cannot be opened with the new password until re-enrolled with the previous pattern password (or rewrapped while signed in using the current password). Do not reset or change it without planning the envelope re-enrollment. Account password recovery alone does not recover private encrypted pattern keys. Never store the original pattern password in GitHub, SQL, metadata, or email.

## Session and security

- **No remembered sessions**: the app refuses to load the private library without a fresh Supabase sign-in on each app opening, even if an old device had remembered the previous legacy unlock or Supabase session.
- Old IndexedDB remembered login keys are deleted on new app start; old localStorage cloud tokens are deleted. A Sign out button clears runtime encryption keys and the current Auth session.
- The change forces logout **inside the new PWA**, but does not globally invalidate all historic JWTs on Supabase's servers; old sessions expire by provider rules.
- Supabase progress and keyring data are only available to approved users via RLS. No anon access to user data.
- Only encrypted derived key bytes are uploaded to Supabase, never any pattern text or plaintext keys.
- The Supabase Auth login is **not** a server-side paywall for the static files: public GitHub Pages hosts pre-encrypted patterns. Multi-user guide-specific entitlements would require an additional architecture change.
- The password remains only in JS memory during sign-in and the one-time migration; no refresh token is persisted between page reloads.
- Local progress is written immediately; cloud sync runs after a short debounce. Offline edits work until the tab is closed; to reopen the site, internet is required to complete Supabase Auth login.
- Simultaneous edits on two devices use last-write-wins per pattern, not a per-step merge.

## Administration

Disable public Auth signups in **Authentication → Providers → Email**, keep email/password logins enabled, and consider Leaked Password Protection. To authorize another account, create its Auth user and insert a membership with `role='member'`; RLS already isolates user progress. Existing users must have access to the old guide-password for initial keyring migration; an independent per-user content licensing system is a separate future feature.

## Validation

Run `node --test tests/smoke.test.mjs`, confirm GitHub Actions smoke tests and GitHub Pages deployment are green, run the Supabase Security Advisor, then test a real owner login and one-time key migration in the PWA. Validate on a fresh second device and after signing out. User account credentials are not held by the developer or tests.
