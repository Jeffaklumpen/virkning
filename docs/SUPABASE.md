# Sunbeam — private Supabase sync

This app is hosted on static GitHub Pages. Its guide files remain AES-GCM encrypted on GitHub. Supabase stores only per-account progress: completed steps, materials checklist, selected variant, last step, and timestamps. No original PDFs, guide text, photos, or guide-decryption passwords are uploaded.

## Live project

- Supabase project: Sunbeam, ref ksmgnigwknzfargzjfzm.
- Public URL: https://ksmgnigwknzfargzjfzm.supabase.co
- Browser config: config/supabase-config.js contains a publishable key, never a service-role/secret key.
- Frontend: js/cloud.js uses Supabase Auth and PostgREST HTTPS endpoints without external libraries.
- Database: public.sunbeam_members, public.sunbeam_progress. Both have Row Level Security.

## One-time account setup (required)

The new Supabase project currently has no Auth users. To activate the private backup:

1. In [Sunbeam Supabase Auth Users](https://supabase.com/dashboard/project/ksmgnigwknzfargzjfzm/auth/users), choose Add user or Invite user to create Kimsi's email/password account. Confirm email if required.
2. Under Authentication > Providers > Email, disable public signups. Leave email/password login enabled. Unapproved accounts cannot read/write progress regardless.
3. Once Kimsi's account exists, grant her membership in the SQL Editor. Replace KIMSI_EMAIL_HERE with her actual email (never commit email to Git):

~~~sql
insert into public.sunbeam_members (user_id, display_name, role)
select id, 'Kimsi', 'owner'
from auth.users
where lower(email) = lower('KIMSI_EMAIL_HERE')
on conflict (user_id) do update
  set display_name = excluded.display_name, role = excluded.role, enabled = true;
~~~

Check that this SQL affects one row. If none, verify the account exists and email matches.

4. Open the existing PWA, unlock using the original pattern password, tap Connect cloud backup, and sign in with the Supabase account email and password. The two passwords can be different.
5. In the original browser, connecting Kimsi's owner account migrates old on-device progress automatically unless a cloud record already exists for that guide. Original local data remains intact.
6. On another device, unlock the PWA and connect the same account to restore her progress.

## Behavior and limitations

- Changes save to local storage immediately and upload asynchronously (about a 750 ms debounce). Reconnect triggers retry.
- On refresh, cloud values are pulled. Pending offline edits are uploaded after reconnect. Simultaneous edits to the same guide from two devices use simple last-write-wins, not per-step merging.
- Supabase authentication is separate from the existing pattern decryption password. Guide files and passwords never get sent to Supabase.
- Row Level Security allows approved users to read/write only rows under their own user ID. Membership is granted by an administrator; it cannot be self-created from the website. RLS also checks enabled=true.
- The browser keys for progress are user-scoped. Only the owner gets the one-time Kimsi legacy local-progress import.
- A signed-in session is remembered in browser storage. On shared devices Cloud backup > Switch account disconnects and locks the app.
- When Supabase is unavailable, the PWA stays usable offline and stores progress locally. Confirm the indicator says Saved in cloud after reconnect.

## Future accounts

Create an account in Supabase Auth, insert a membership with role member and enabled=true, and let that user sign in. RLS already isolates their progress. Do not share Kimsi's guide password or login. For a true multi-user product, plan separate guide entitlements, per-user encryption access, invitations, password recovery, and server-side content controls.

## Deployment checks

- Run node --test tests/smoke.test.mjs.
- Check GitHub Actions and Pages.
- Run Supabase Security Advisor; confirm both tables have RLS and limited grants.
- Test invited owner login, offline edits, reconnect sync, and a fresh device.
