# Amaris Helper

A full-stack productivity workspace for university study, task management, career preparation, and personal projects.

## Live Demo

https://amarishelper.vercel.app

## Preview

### Dashboard

![Amaris Helper Dashboard](dashboard.png)

### Calendar

Google Calendar integration for viewing university assignments and managing deadlines.

![Amaris Helper Calendar](calendar.png)

### Study Workspace

Subject-based workspaces for organizing assignments, exams, and study planning.

![Amaris Helper Study Workspace](study.png)

## Key Features

- **Smart Dashboard** — Displays priorities, upcoming deadlines, exams, and suggested next actions in one place.
- **Task Management** — Organize tasks by deadline and priority, track completion, and focus on selected tasks.
- **Google Calendar Integration** — View Google Calendar and Classroom assignment deadlines and convert events into manageable tasks.
- **Study Workspace** — Organize subjects, assignments, exams, and study activities in dedicated subject workspaces.
- **AI Agent Workspace** — Specialized assistants for study, career preparation, project planning, development, and other workflows.
- **Cross-Device Sync** — Sign in with Google and synchronize workspace data across devices using Supabase.
- **Career & Exam Planning** — Dedicated workspaces for internship preparation, career planning, exams, and checklists.
- **Personal Management** — Includes finance tracking, investment records, file storage, focus tools, and personal project planning.

## Tech Stack

**Frontend**
- Next.js
- React
- TypeScript

**Backend**
- Next.js API Routes
- Node.js

**Database & Authentication**
- PostgreSQL
- Supabase
- Supabase Auth
- Row Level Security (RLS)

**Integrations**
- Google OAuth 2.0
- Google Calendar API
- Google Classroom Assignments via Calendar

**Development & Deployment**
- Git & GitHub
- ESLint
- Vercel

**Testing**
- Node.js Test Runner
- Integration and task logic tests



## Architecture

Amaris Helper uses a full-stack Next.js architecture with server-side integrations and optional cloud synchronization through Supabase.

```text
User
  │
  ▼
Next.js / React / TypeScript
  │
  ├── Dashboard, Tasks, Study, Career, Exam
  │
  ├── AI Agent Workspaces
  │
  └── Calendar & Personal Management
  │
  ▼
Next.js Server / API Routes
  │
  ├── Google OAuth
  ├── Google Calendar API
  └── Server-side integrations
  │
  ▼
Supabase
  ├── PostgreSQL
  ├── Authentication
  ├── Row Level Security
  └── Cross-device workspace sync
```

The application can operate in local mode using browser storage or in signed-in mode with Supabase-backed synchronization. Sensitive credentials and external API access are handled server-side rather than exposed to the browser.

### AI Agent System

Specialized agents are defined through a central registry containing their roles, capabilities, and routing information. The application uses this registry to route requests to the appropriate workspace while keeping agent configuration separate from the UI.

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/Mamamusub/Amaris-Helper.git
cd Amaris-Helper
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy the example environment file:

```bash
cp .env.example .env.local
```

Fill in the required environment variables for the integrations you want to use. Keep API keys and secrets in `.env.local` and never commit them to the repository.

### 4. Start the development server

```bash
npm run dev
```

Open `http://localhost:3000` in your browser.

### 5. Verify the project

```bash
npm run lint
npm run build
node --test tests/*.test.mjs
```

The application can run in local mode without Supabase. Google Login, cross-device synchronization, Calendar integration, and other external services require their respective environment variables and configuration.

## AI Agent Team

Amaris Helper includes specialized agents designed for different student and development workflows.

| Agent | Role |
| --- | --- |
| 🐼 Panda | Secretary & task coordination |
| 🦉 Owl | Research assistance |
| 🦅 Eagle | Content and work review |
| 🐶 Dog | Career coaching |
| 🐱 Cat | CV and resume review |
| 🦊 Fox | Project idea generation |
| 🐝 Bee | Product planning |
| 🦫 Beaver | Web development |
| 🦋 Butterfly | UI/UX design |
| 🐙 Octopus | Code review |

Each agent has a defined role and capability set, allowing requests to be routed to the appropriate workspace.

## Integrations

### Google Calendar & Classroom

Amaris Helper connects with Google Calendar to bring university schedules and deadlines into the workspace.

- View Google Calendar events directly inside the application
- Access Classroom assignment deadlines through the Classroom Assignments calendar
- Convert Google events into local tasks
- Filter between Google Calendar events and personal tasks
- Export local tasks to Google Calendar
- Handle calendar data using the Asia/Bangkok timezone

### Google Authentication & Supabase

Users can sign in with Google through Supabase Auth to synchronize their workspace across devices.

- Google OAuth authentication
- PostgreSQL-backed workspace synchronization
- Row Level Security (RLS) for user data isolation
- Local mode available without an account
- Import existing local data when signing in

Detailed setup instructions are available in [`docs/google-login-sync.md`](docs/google-login-sync.md).

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
