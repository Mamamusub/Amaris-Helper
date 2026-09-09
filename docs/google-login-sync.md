# Google Login and account sync setup

No deployment or production database change is performed by this implementation.
Use a separate development Supabase project first. `.env.local` was not read,
changed, copied, or committed as part of this task.

## 1. Supabase database

1. Create a Supabase project and copy its Project URL and **publishable key**.
   A legacy anon key also works. Do not use a service-role/secret key.
2. Run `supabase/migrations/202609090001_workspace.sql` in that development
   project's SQL Editor, or apply it using your normal Supabase migration process.
   The migration is deliberately not run during `next build` or Vercel deployment.
3. It creates `workspace_records`, `workspace_operations`, RLS read policies,
   composite owner-scoped foreign keys, and `workspace_snapshot` / `workspace_apply`.
   Direct inserts/updates/deletes are revoked from anon/authenticated roles:
   the mutation RPC derives `auth.uid()` itself and enforces versions. Its
   SECURITY DEFINER functions have an empty search path and qualified table names.
4. No Realtime publication is required. Account data polls every 5 seconds and
   refreshes on focus/online; auth is revalidated every 10 seconds and on focus.

## 2. Google Login (Supabase Auth)

Create a Google OAuth **Web application** client for identity login. Configure
its consent screen and test users while the Google app is in Testing mode.
Enable the Google provider in Supabase Authentication > Providers and enter that
client's ID and secret **in Supabase**, not in frontend environment variables.
Login requests identity scopes only, never Calendar or Google Tasks scopes.

Google Cloud Console, this login client:

- Authorized JavaScript origins: `https://amarishelper.vercel.app` and
  `http://localhost:3000` for development.
- Authorized redirect URI: `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
  (use the exact provider callback shown by your Supabase project).

Supabase Authentication > URL Configuration:

- Site URL: `https://amarishelper.vercel.app`
- Allowed redirect URLs:
  - `https://amarishelper.vercel.app/api/auth/callback`
  - `http://localhost:3000/api/auth/callback`

Flow: POST `/api/auth/login` -> Google via Supabase -> Supabase provider callback
-> `/api/auth/callback` (PKCE exchange) -> `/`. The SSR SDK stores PKCE/session
cookies as HttpOnly, SameSite=Lax, Secure in HTTPS. Only Route Handlers touch
Supabase tokens. `/api/auth/session` returns verified ID/email, never tokens.
`getUser()` validates the identity; client-supplied IDs are only compared as a
session-switch guard and never used as database authority.

## 3. Optional Google Calendar (independent OAuth client)

Keep or create a separate Calendar Web application client and enable Google
Calendar API. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and a random
`INTEGRATION_SECRET` of at least 32 characters on the server.

Calendar client authorized redirect URIs:

- `https://amarishelper.vercel.app/api/integrations/google/callback`
- `http://localhost:3000/api/integrations/google/callback`

This is **not** the login callback. Login does not connect Calendar. Connect it
from existing Settings separately. Calendar refresh tokens remain encrypted in
HttpOnly cookies and include the verified Amaris user ID. The consent callback
rejects an account switch during consent. Login/logout clear old bindings.
Calendar authorization remains per browser: connect separately on each device.
When Supabase auth is configured, Calendar requires a verified Amaris account and
stores the verified user ID with the encrypted refresh token. Local mode can use
Calendar only when Supabase auth is not configured; a local token cannot be reused
by a logged-in account. This release does not sync credentials or write local edits
back to Google automatically, and does not integrate Google Tasks.

## 4. Local development and Vercel configuration

Copy `.env.example` to your local environment and replace placeholders privately:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `APP_ORIGIN`: `http://localhost:3000` locally, and
  `https://amarishelper.vercel.app` for the eventual Vercel production environment.
- Calendar variables above only if Calendar is needed.

In Vercel Project Settings > Environment Variables, add those values to the
intended environment. Do not prefix secrets with NEXT_PUBLIC. Configure preview
origins explicitly if testing previews; the auth API trusts APP_ORIGIN exactly,
not forwarded host headers. Do not deploy until the development acceptance
checks below pass and the production migration is separately authorized.

## Behavior and data preservation

- Local mode retains the existing `agent-helper.*` keys and demo experience.
  Logged-in views use only account records, including task status/focus/deletion,
  subject notes, per-message chat records, Pipeline progress and embedded subtasks.
  Parent task links, when present, have owner-scoped foreign keys.
- First login offers explicit import counts. Untouched demo records are excluded;
  demo rows with user edits are treated as real data. Original Local keys are
  never cleared by import. Repeating imports skips existing IDs (including
  tombstones) rather than overwriting the cloud. Receipts and records commit in
  one transaction, with deferred references checked before success.
- Cloud writes first journal stable operation IDs locally, then send serially.
  “บันทึกแล้ว” appears only after acknowledgement. Offline/unacknowledged edits
  survive remount in the same account. The pending draft can be inspected/exported.
  The queue does not silently rebase a stale record onto a newer version.
- A conflict keeps the draft and blocks subsequent queued writes. Export it,
  choose the explicit discard-pending/use-server action, review current data,
  and reapply desired fields manually. This is intentionally not automatic merge.
- Account caches/outboxes live under `amaris.account.<verified-user-id>`; individual
  `.op.<uuid>` journals prevent tabs from overwriting each other's pending work.
  Auth must be verified before opening an account cache. Explicit logout is
  blocked with pending journals, then clears the account cache and cookies.
  A forced session expiry/account switch hides and unmounts previous data;
  unacknowledged drafts remain isolated for that same account's next verified login.
  Local data is a separate workspace, never populated with cloud private data.
- If the browser cannot write its journal (quota/storage denied), the edit is not
  acknowledged as queued. The task/notes editor remains available to copy/retry.
  Clearing browser site data manually can still destroy unsent drafts.
- Large queues/images may exceed hosting request limits. The RPC caps 5,000
  changes / 8 MB JSON per batch; Vercel may impose a smaller body limit. Such a
  batch stays failed/pending for export; automatic chunked import is not included.
- Supabase service outages are not treated as successful saves or confirmed
  logout. Offline page reload requires auth revalidation when connectivity returns
  before private cached data can be shown.

## Verification and remaining external acceptance checks

Commands:

```sh
node --test tests/*.test.mjs
npm run lint
npm run build
```

`tests/workspace.test.mjs` runs the actual migration and RPCs in embedded
Postgres (PGlite, development dependency), with two auth UID contexts. It checks
RLS/direct grants, foreign ownership, duplicate import, CAS, tombstones, two sync
clients, dropped acknowledgements and offline queue recovery. Auth Route Handlers
and Calendar ownership are tested with mocked identity/provider services. Existing
component and pipeline tests remain part of the suite. No test contacts production.

Still required on a **development** Supabase project and real browsers:

1. Complete a Google login on desktop and mobile; confirm cookies, PKCE refresh,
   redirects, consent cancellation and current account display.
2. Same Google account: add/edit/complete/delete/Undo tasks, edit notes and subtasks,
   and save Pipeline progress; confirm the second device updates within a poll.
3. Different accounts: verify empty isolation, direct REST/RPC rejection, logout,
   expiry and switching while an editor is open. Inspect browser storage visibility.
4. Import twice, interrupt a request, go offline and reload, restore connectivity,
   and exercise conflict export/discard/reapply. Verify original Local keys remain.
5. Independently connect Calendar on each device and test read/export/disconnect,
   including switching accounts during Calendar consent.
6. Review responsive layout and keyboard focus on real desktop/mobile browsers.

References: [Supabase Google Login](https://supabase.com/docs/guides/auth/social-login/auth-google),
[server-side client](https://supabase.com/docs/guides/auth/server-side/creating-a-client),
[PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow),
[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[database functions](https://supabase.com/docs/guides/database/functions).
