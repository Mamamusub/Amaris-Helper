# Build Lab Project Hub

Build Lab now tracks multiple projects using the existing component and account storage. It uses deterministic local logic and makes no AI API calls.

## Routes and navigation

- The existing Build Lab navigation still renders `src/components/build-lab.tsx`.
- `/build-lab` renders the same dashboard, wrapped by the existing AccountBoundary.
- `/build-lab/[id]` renders project details, also within AccountBoundary.

## Storage and migration

`src/lib/build-lab-storage.ts` owns the model, persistence, migration, progress, readiness, search and filters. It accepts the existing storage interface.

- Key: `agent-helper.build-lab`, with `{ version: 2, projects: [...] }`.
- Signed out: localStorage in the current browser.
- Signed in: the existing account document queue, workspace API and Supabase backend; the existing sync bar reports pending writes and conflicts.
- Guest data still requires the application's explicit import flow when signing in.
- Existing single-project drafts are read as one project. Name, brief, stack, notes and all five checklist completion flags are preserved.
- The original raw draft is backed up to `agent-helper.build-lab.legacy-backup` before the first successful format upgrade. Merely viewing the draft does not write anything. Original drafts have no recorded dates, so migrated dates remain unset.
- Empty state contains no hardcoded example projects.
- Malformed records and stale edits cause an error instead of silently replacing data.

## Features

Project CRUD, status/type/technology filters, text search, four sort orders, Grid/List views, real summary totals, automatic/manual progress, project links, task CRUD and completion, milestone CRUD and completion, newest-first Dev Log CRUD, resource CRUD, editable portfolio information and a six-rule resume readiness checklist. Demo is optional and excluded from the six-rule score. Include in Resume and presentable are explicit user choices.

External links accept only HTTP(S) and open in a new tab. Forms check required nonblank text, URLs and project date order. Destructive actions request confirmation. Save failures retain the editor and existing stored data. Styles reuse the existing palette, variables, button classes and responsive conventions; dialogs use the shared keyboard helper.

## Manual acceptance steps

1. Open the existing Build Lab menu, or `/build-lab`. With no stored projects, verify the empty state and zero totals.
2. Create a project, fill the descriptions, dates, type, status, technologies, tags, next task and URLs. Save; verify the card and summary counts. Reload and verify persistence.
3. Edit the project. Verify changed values persist. Test a blank name, invalid URL and target date before start date; saving should be rejected.
4. Search by project name or technology. Combine status, type and technology filters, then clear filters. Try each sort and switch Grid/List.
5. Open the project card. Add two tasks with priorities, categories and due dates. Complete one: automatic progress should be 50%. Edit, uncomplete and delete tasks; progress should recalculate immediately, with zero for an empty checklist.
6. Edit the project and disable automatic progress. Set 35%. Change a task and verify manual progress stays at 35%.
7. Add, edit, complete/uncomplete and delete a milestone.
8. Add two Dev Logs. Verify newest first, then edit and delete one. Reload to confirm persistence.
9. Add and edit a resource. Open it in a new tab, then delete it. Check repository, demo and documentation links too.
10. Fill Portfolio Info and a clear result. Add description, technologies, repository and documentation, then mark the project presentable. Verify readiness reaches 6/6 without requiring a demo. Toggle Include in Resume and reload.
11. Cancel deletion and verify no data changed. Confirm Delete Project and verify it disappears with its nested content; reload and ensure it does not return.
12. On a narrow mobile viewport, check wrapping of long names/URLs, filter controls, cards and dialogs; use Tab/Shift+Tab/Escape in dialogs.
13. With an old draft, verify its brief, notes, technologies and checked steps appear. Save once and verify the legacy backup remains intact.
14. For a configured account, wait for confirmed sync, then open a second device with the same account. Verify persistence and existing conflict handling. Guest data must not be imported automatically.

## Automated checks and limits

- `node --test tests/build-lab*.test.mjs` tests data migration, CRUD, search/filter, progress, readiness, damaged/stale data and actual component form handlers with the repository's hook-harness approach.
- `npm run test`, `npm run lint`, `npx tsc --noEmit`, `npm run build` are the project checks.
- The component harness does not replace real browser layout, focus or navigation testing. No browser was available in the implementation session, so mobile visual QA and live multi-device account testing remain manual.
- Projects share one account document, matching the previous storage design. Concurrent cross-device edits use the existing document conflict workflow rather than field-level merging. Large histories remain subject to existing storage/backend limits.
- No file uploads, automatic repository inspection, AI generation or direct Career-page synchronization were added.
