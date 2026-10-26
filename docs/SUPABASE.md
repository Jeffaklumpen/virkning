# Sunbeam — private Supabase account sign-in

The private PWA requires an approved Supabase Auth email/password account on **every new app opening**. The original single-password login and optional "Connect cloud backup" UI are retired.

## Project

- Supabase: Sunbeam (project `ksmgnigwknzfargzjfzm`)
- Frontend config: `config/supabase-config.js` (only the safe public publishable key)
- Login: `js/cloud.js` — Auth REST API, **in-memory session only**
- Private pattern key migration: `js/keyring.js`
- Encrypted guides and photos: remain on static GitHub Pages and encrypted locally
- Database: `public.sunbeam_members`, `public.sunbeam_progress`, `public.sunbeam_keyrings`; RLS enabled on all three

## Sign-in without an extra password screen

1. The administrator creates an email/password user in Supabase Auth and grants approved membership.
2. The account's encrypted keyring must already have been provisioned before its first login. Kimsi's account currently has a valid version-1 keyring in Supabase.
3. The user signs in on the welcome screen with Supabase email and password, once. The app fetches their RLS-protected encrypted keyring and unwraps it locally with their account password.
4. There is no second form or old pattern password prompt. If an account has no keyring, login stops with a clear message for the administrator instead of requesting a second password.
5. The library loads and progress syncs automatically, preserving existing on-device progress.

### Important password-change caveat

The encrypted keyring is bound to the **Supabase account password**. If that password is changed or reset, its envelope cannot be opened with the new password until an administrator securely reprovisions the keyring (or it is rewrapped using the old account password while still available). Do not reset or change it without planning the envelope re-enrollment. Account password recovery alone does not recover private encrypted pattern keys. Never store the original pattern password in GitHub, SQL, metadata, or email.

## Session and security

- **No remembered sessions**: the app refuses to load the private library without a fresh Supabase sign-in on each app opening, even if an old device had remembered the previous legacy unlock or Supabase session.
- Old IndexedDB remembered login keys are deleted on new app start; old localStorage cloud tokens are deleted. A Sign out button clears runtime encryption keys and the current Auth session.
- The change forces logout **inside the new PWA**, but does not globally invalidate all historic JWTs on Supabase's servers; old sessions expire by provider rules.
- Supabase progress and keyring data are only available to approved users via RLS. No anon access to user data.
- Only encrypted derived key bytes are uploaded to Supabase, never any pattern text or plaintext keys.
- The Supabase Auth login is **not** a server-side paywall for the static files: public GitHub Pages hosts pre-encrypted patterns. Multi-user guide-specific entitlements would require an additional architecture change.
- The password remains only in JS memory during sign-in; no refresh token is persisted between page reloads.
- Local progress is written immediately; cloud sync runs after a short debounce. Offline edits work until the tab is closed; to reopen the site, internet is required to complete Supabase Auth login.
- Simultaneous edits on two devices use last-write-wins per pattern, not a per-step merge.

## Administration

Disable public Auth signups in **Authentication → Providers → Email**, keep email/password logins enabled, and consider Leaked Password Protection. To authorize another account, create its Auth user and insert a membership with `role='member'`; RLS already isolates user progress. New users need admin-managed encrypted keyring provisioning; an independent per-user content licensing system is a separate future feature.

## Validation

Run `node --test tests/smoke.test.mjs`, confirm GitHub Actions smoke tests and GitHub Pages deployment are green, run the Supabase Security Advisor, then test a real owner login and one-time key migration in the PWA. Validate on a fresh second device and after signing out. User account credentials are not held by the developer or tests.
