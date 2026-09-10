# Tasks, recurring rounds and Focus

## Try the features

1. Open Tasks and create a task, or choose Edit on an existing task.
2. Add subtasks with Enter. Rename, check, delete and Undo within the editor, then Save task. Cards show completed/total and a small progress bar. Completing all subtasks offers a separate parent completion button.
3. Select daily, weekly (one or more weekdays), or monthly recurrence. Choose an optional end date and timezone. Existing Calendar dates default to Asia/Bangkok.
4. Complete a recurring task. A single next round is created with its scheduled date and unchecked subtasks. If the next round is already overdue, choose either the next missed round or skip to today/the next scheduled date. Each choice creates at most one round.
5. Edit/delete a recurring task with an explicit occurrence scope. Earlier completed rounds remain available in All Tasks. Undo restores a deleted batch, including its recurrence continuation state.
6. Choose เริ่มโฟกัส or Open focus. Select 25, 50, or 1–240 custom minutes. Start, pause, resume, write the next step, or end the session. Closing the panel leaves a mini timer. Refresh restores the persisted session.
7. The summary offers another round, a break, or task completion. Session history is stored on the task; today's total splits active intervals at Bangkok midnight and excludes pauses.

## Persistence and compatibility

- New Task properties are optional. Old tasks retain their existing fields and IDs. No destructive migration or database schema change is required.
- Account workspaces reuse the existing JSON records, optimistic versions and offline queue. Local writes merge unrelated newer records and report detected same-task conflicts.
- Recurrence IDs derive from series ID and scheduled date. Creation and parent completion are committed together through the existing task batch. Tombstones and handled flags prevent ordinary refresh/replay from recreating a round.
- Subtasks never become standalone tasks or Calendar events. Each generated round clears the original Calendar binding and uses the existing manual Calendar export. That endpoint's deterministic event ID and duplicate response handling are unchanged.
- Calendar export does not automatically update an already exported event when task details change, consistent with the previous integration. Rescheduling an existing round preserves its task ID.
- Focus uses an account-scoped browser storage key, timestamps, active intervals and Web Locks across tabs. End records have a stable session ID and cannot be appended twice to a task's history.
- An active timer is scoped to this browser profile/device. Completed history follows normal task sync. It does not hand off a running timer between devices. Web Locks support is required; unsupported browsers show an error rather than start an unsafe parallel timer.
- No AI calls, paid services, notification permissions or production deployment are introduced.

## Verification

Run `npm test`, `npm run lint`, and `npm run build`.

Automated coverage includes the existing task lifecycle and Calendar regression suite, month-end/leap-year/year boundaries, weekday selection, timezone/DST day boundaries, recurrence replay, missed-round choices, edit scopes, subtask Enter/Undo/refresh, timestamp restoration, pause exclusion, repeated end, deadline capping and midnight totals. The component harness is not a real browser layout test.

Real mobile/tablet/desktop visual verification and screenshots remain unverified in this session: Computer Use stopped because it could not confidently determine the Windows browser URL. Do not interpret passing automated tests as a completed visual or live Google Calendar check. No live Calendar event was created during testing.
