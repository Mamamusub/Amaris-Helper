# Amaris · Pai's AI team

Pai's local-first personal AI team for university, internship preparation, personal projects, and daily planning. The workspace keeps state in the browser. Pipeline prepares a prompt to copy into ChatGPT and saves the answer pasted back by the user; the separate agent workspace chat remains a local demo.

## What works

- Dashboard with priorities, deadlines, suggested next action, and recent handoffs.
- Team Grid with the initial Panda, Shared, Career, and Development agents.
- Agent registry in `src/lib/agents.ts`, including capability and routing metadata.
- Agent workspace chat, task creation, and routing to the right specialist. Real agent replies use the server-side OpenAI provider when configured.
- Pipeline trace with useful execution summaries, never hidden chain-of-thought.
- Tasks view with Today, Upcoming, All Tasks, priorities, deadlines, and completion.
- Study dashboard with configurable subjects and subject-specific workspaces.
- Career and Development team views.
- Browser persistence through localStorage for Local mode, with optional Supabase Auth/Postgres account sync.
- Manual ChatGPT prompt preparation, image downloads, and saved pasted answers. The former API provider is inactive.

## Run it

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Useful checks:

```bash
npm run lint
npm run build
```

## Architecture

```text
src/
  app/                  Next.js route and global styles
  components/
    app-shell.tsx       Main application UI and interaction orchestration
  lib/
    agents.ts           Central registry and routing rules
    types.ts            Agent, task, subject, chat, and run contracts
    storage.ts          Demo records and localStorage adapter
    ai-provider.ts      Provider interface and Demo provider
```

The current UI is intentionally one route with view state. This keeps the MVP easy to understand while preserving clear boundaries for a later route split and server-backed repository.

### How agents work

Agents are data in the registry, not definitions scattered across components. Add an entry to `agents` with an id, team, role, description, capabilities, and status. Team Grid and workspaces will pick it up automatically. Add a routing rule in `chooseRoute` only when Panda should recognize a new request category.

### How routing works

The Live Pipeline sends a command to the selected Team Grid agent through `/api/pipeline/run`. The server reads the API key from `AI_PROVIDER=openai` and `OPENAI_API_KEY` in `.env.local`; the key is never sent from the browser. Older saved runs may still contain the manual copy/paste prompt format. Individual agent workspaces use the same server-side provider through `/api/agent/chat`.

### Add a subject

Use Study > Add subject. The subject is persisted locally and opens as its own subject agent workspace. A future SQLite repository can store notes, assignments, exam dates, resources, and conversation history against the same subject id.

## Environment

Copy `.env.example` to `.env.local` when you want a local configuration file. Do not commit `.env.local` or API keys. To enable real replies in the Pipeline and individual agent workspaces, set `AI_PROVIDER=openai`, `OPENAI_API_KEY`, and optionally `OPENAI_MODEL` in `.env.local`, then restart the dev server.

For the Port page, set `GOOGLE_SHEET_URL` to the Google Sheet URL (or use `GOOGLE_SHEET_ID`) and optionally set `GOOGLE_SHEET_RANGE=PORT!A1:I100`. The Port page then loads that sheet without requiring the URL each time. Reconnect Google after enabling the Sheets API so the read-only Sheets permission is granted.

## Next implementation steps

1. Replace the localStorage adapter with SQLite and a migration layer.
2. Add server actions/API routes for conversations, tasks, and agent runs.
3. Add streamed text responses to the individual agent workspace.
4. Add uploads and structured study records for assignments and exam reviews.
5. Add authentication and multi-workspace boundaries if the app leaves one device.

## Assistant names

| Role | Name | Avatar |
| --- | --- | --- |
| Secretary | Panda | 🐼 |
| Researcher | Owl | 🦉 |
| Reviewer | Eagle | 🦅 |
| Career Coach | Dog | 🐶 |
| CV Reviewer | Cat | 🐱 |
| Project Idea Agent | Fox | 🦊 |
| Product Planner | Bee | 🐝 |
| Web Developer | Beaver | 🦫 |
| UI/UX Agent | Butterfly | 🦋 |
| Code Reviewer | Octopus | 🐙 |

## Integrations

Open **Calendar** and choose a calendar to see its Google events and local task deadlines in a monthly view. Subscribed calendars such as **Classroom Assignments** are supported; a calendar with that name is selected automatically when available. The connected account appears below the calendar selector. Select a date to see details, choose a due date and an assistant, then click **Assign as task**. The task is saved locally and can be completed in **Tasks**. Each Google event can be assigned once; recurring occurrences are separate events.

Use **Everything / Google Calendar / My tasks** to filter the calendar, the arrows to change months, **Today** to return to the current date, and **Refresh** to reload Google changes. The calendar uses **Asia/Bangkok (UTC+7)**. Multi-day all-day events exclude Google's end date; assignment defaults to the last included day. Timed events default to their start date in Bangkok. You can choose another deadline before assigning.

Events load from Google when you open Calendar, change months, or refresh. Assigned tasks are local copies: later edits or deletions in Google do not silently change your task. A task with a different deadline also appears on its assigned date. The existing **+ Google Calendar** button in Tasks can still export a local task as an all-day event; imported tasks are not exported again.

If Google is not connected or cannot load, local deadlines remain visible with a connection/retry prompt. No sample Google events are presented as live data.

### Google Login and cross-device sync

The implementation and external setup checklist are in [docs/google-login-sync.md](docs/google-login-sync.md).
The app uses Supabase Google OAuth for identity and server-side `workspace_snapshot` / `workspace_apply`
RPCs for account data. RLS binds records to the verified `auth.uid()`. Login and Calendar use separate callbacks:

- Login: `/api/auth/callback`
- Calendar: `/api/integrations/google/callback`

Set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `APP_ORIGIN` on the server. Run the workspace migration
on a development Supabase project before enabling Login. No production deployment or production database
change is performed by this repository work.

Local mode remains available when Supabase is not configured. On first login, the UI offers an explicit
local-data import with counts; untouched demo records are excluded and the original local data remains.

### Local setup

Start locally with `npm run dev -- --hostname 127.0.0.1` and open `http://localhost:3000`. For account sync,
complete the Supabase setup in `docs/google-login-sync.md`; otherwise the app stays in Local mode.

Copy `.env.example` to `.env.local` and fill in the integration values. Leave unused providers blank. Never put credentials in `NEXT_PUBLIC_` variables or browser storage. Restart the dev server after changing environment variables.

### Google Calendar

1. In Google Cloud, create/select a project and enable **Google Calendar API**.
2. Configure the OAuth consent screen and add your Google account as a test user if the app is in Testing mode.
3. Create an OAuth client of type **Web application**. Add this exact authorized redirect URI: `http://localhost:3000/api/integrations/google/callback`.
4. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env.local`.
5. Generate a random encryption secret with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` and set it as `INTEGRATION_SECRET` (at least 32 characters).
6. Set `APP_ORIGIN=http://localhost:3000`. If you use a different port, update both this value and the registered Google redirect URI.
7. Restart the app, open **Settings → Connect Google Calendar**, and grant permission. Open **Calendar**, select a Google event, and assign it as a task.

The app requests `calendar.events.readonly` to read events in calendars you can access, `calendar.calendarlist.readonly` to list those calendars, and `calendar.events.owned` for optional exports to your primary calendar. The refresh token is encrypted in an HttpOnly cookie lasting 30 days; access tokens are requested server-side and never returned to browser JavaScript. Google may expire or revoke authorization earlier, in which case reconnect. Disconnect clears the browser connection and attempts to revoke Google access. Clearing browser cookies or changing the encryption secret also requires reconnecting.

Reference: [Google OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server) and [Calendar event creation](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert).

### Integration checks

Run `node --test tests/integrations.test.mjs`, `npm run lint`, and `npm run build`. Integration tests mock external requests and do not create real Calendar events. Live verification requires your own OAuth credentials, and Google consent.
Calendar listing follows the [Google Calendar events.list API](https://developers.google.com/workspace/calendar/api/v3/reference/events/list), including pagination and recurring event expansion.

### Classroom Assignments and other calendars

Connections made before the calendar selector was added need updated consent. Open **Settings → อัปเดตสิทธิ์ Google / เปลี่ยนบัญชี**, choose the Google account that can see your Classroom calendar, and grant access to calendar lists and events. No new client ID or secret is needed. If you maintain the consent screen's Data Access scopes, add `https://www.googleapis.com/auth/calendar.events.readonly` and `https://www.googleapis.com/auth/calendar.calendarlist.readonly` there too.

Return to **Calendar**, select **Classroom Assignments**, and click **Today** to see deadlines for today. The page shows the fetched date range and Google event count. This integration reads events; Google Tasks is a separate service and is not imported here. Local task exports still go to the primary calendar, even when another calendar is selected for viewing.
### Pipeline image attachments

Use **Pipeline → + แนบรูป**, or paste an image into the request box with Ctrl+V. Attach up to 3 PNG/JPEG/WebP images (1 MB per file, 2 MB combined), preview/remove them, and send with or without text. Enter sends; Shift+Enter adds a newline. Click an attached thumbnail to view it larger; Escape closes the preview.

Images stay in browser localStorage. Download and attach them in ChatGPT manually; copying a prompt does not include image files.

## ChatGPT Pipeline (manual)

1. Enter a request and click the prepare-prompt button.
2. Copy the generated prompt and open ChatGPT. Paste it and attach any images yourself.
3. Copy ChatGPT's answer back into the response field and save it.

History and answers remain in localStorage across reloads. Previous runs remain readable. Pipeline's old POST endpoint returns 410 and never calls OpenAI, including for stale browser tabs. Existing API implementation files are inactive references. ChatGPT usage is governed by the user's ChatGPT plan.

### Shared local tasks

Study, Tasks, Calendar and Today read the same `agent-helper.tasks` collection.
Tasks keep their existing IDs; `subjectId` links a task to its learning room.
Optional `focused` and `deletedAt` fields are backward compatible. The original
stored task JSON is backed up to `agent-helper.tasks.legacy-backup` before the
first write. Legacy tasks assigned to a known subject ID gain that relationship
without guessing from names or replacing other fields.

Deletion retains a tombstone, and Undo restores the same record even after a
reload. Imported Google events represented by local tasks are suppressed,
including deleted tasks; local changes do not write back to Google Calendar.
Date-only deadlines stay `YYYY-MM-DD`, and Today uses `Asia/Bangkok` to select
unfinished overdue, due-today and focused tasks once each. Undated tasks remain
in Study and All Tasks but do not produce calendar entries.

Run `node --test tests/*.test.mjs`, `npm run lint`, and `npm run build` to verify.
`tests/tasks.test.mjs` exercises component callbacks with a lightweight hook and
localStorage harness, including remounts, safe migration and failed writes. It
does not replace real-browser layout, focus or hydration testing. No dependency
was added. Storage remains local to this browser; concurrent browser tabs and
cross-device synchronization are available when signed in; see docs/google-login-sync.md.

## Account sync across devices

Signed-in workspace data now includes Career, Exam/checklists, Finance, Build Lab, navigation preferences, active Focus sessions, and private Study/Career/Exam files. Apply both 20260916 migrations and configure Supabase before using this feature. See [setup and migration instructions](docs/google-login-sync.md#upgrade-all-workspace-data-and-files). Guest data/files can be copied into the account from the sync bar on the original device.
