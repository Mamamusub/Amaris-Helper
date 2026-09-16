# Google Classroom → Calendar / Assignments

The dashboard now reads published coursework directly from active courses where the connected Google user is a student. It refreshes when the page loads or Refresh is pressed (Assignments also refreshes on window focus). No AI API is used. This is a read-only feed into the dashboard; it does not automatically create events in Google Calendar or mark work submitted in Classroom. Imported My tasks retain their locally edited dates/status, as before.

## Google Cloud setup

1. In the project containing GOOGLE_CLIENT_ID, enable Google Classroom API and Google Calendar API. Keep Google Sheets API enabled if using the existing Sheets integration.
2. Google Auth Platform → Data Access: add only https://www.googleapis.com/auth/calendar.events.readonly, https://www.googleapis.com/auth/calendar.calendarlist.readonly, https://www.googleapis.com/auth/classroom.courses.readonly, https://www.googleapis.com/auth/classroom.coursework.me.readonly and https://www.googleapis.com/auth/userinfo.email for the Calendar/Classroom data connection. It does not request calendar.events.owned or spreadsheets.readonly.
3. In Audience, add the student's school account as a test user while the OAuth app is in Testing. School Workspace policy may require administrator approval. External production apps may require Google verification for the requested scopes.
4. In Clients → existing Web application, register the exact origin followed by /api/integrations/google/callback. Local example: http://localhost:3000/api/integrations/google/callback. Register the deployed HTTPS URL separately. Set APP_ORIGIN to that trusted origin in deployment; the callback must match it exactly. This Google integration callback is separate from Supabase /api/auth/callback.
5. Keep GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and INTEGRATION_SECRET (at least 32 characters) configured on the server. Restart after environment changes. Do not put these secrets in NEXT_PUBLIC variables.
6. In dashboard Settings, click อัปเดตสิทธิ์อ่าน Calendar/Classroom, choose the school account and grant all requested permissions. Old refresh tokens do not automatically gain Classroom scopes. The callback rejects an incomplete consent response.

## Behavior and limits

- dueDate + dueTime are UTC according to Google's API. Empty dueTime means midnight UTC. Display uses Asia/Bangkok. Undated coursework appears separately without inventing a deadline.
- Identity uses course ID + coursework ID, so refreshes and repeated pages cannot duplicate an assignment. Calendar copies with the exact Classroom source URL are suppressed. Events without a source URL cannot safely be matched by title alone and may still appear beside an assignment.
- Pagination follows courses and coursework; a bounded request limit returns a visible failure rather than silently claiming a complete result. One failed course currently fails the Classroom feed, while Calendar and local tasks remain available.
- Completion in the app is local; student submission state is not synchronized. Archived courses and courses taught by the user are outside this student dashboard feed.
- The Amaris login identity and Google data identity are separate. With Supabase configured, the read-only Google connection is stored encrypted on the server in `google_data_connections`, protected by owner-scoped RPCs and available across devices. The connected email is returned as status only; no token is returned to the browser.
- Replacing or disconnecting the data connection deletes the old server row immediately. Calendar/Classroom responses are `no-store` and are not persisted as event cache; local Tasks remain untouched. Google Calendar writes and Sheets continue to use the pre-existing legacy connection path and never use this read-only source.
- Access tokens refresh server-side. Revoked/expired refresh grants delete that user's connection and return an authorization error. Temporary Google failures preserve it. Existing state and signed-in-owner checks remain in place.
- No background scheduler or Google Calendar write-through is added. Existing manual + Google Calendar export retains its stable event ID.

## Live end-to-end acceptance

After completing Cloud setup and consent: open Calendar and Assignments; confirm a known course assignment and its Bangkok deadline; check an undated assignment; press Refresh twice and verify one row per source assignment; compare the adjacent-day boundary with Classroom; import a task and complete/delete it, then refresh to confirm no resurrection. Revoke access and confirm a reconnect message; reconnect and repeat. Live school-account OAuth consent has to be completed by the account holder.

Official references:
- https://developers.google.com/workspace/classroom/reference/rest/v1/courses/list
- https://developers.google.com/workspace/classroom/reference/rest/v1/courses.courseWork/list
- https://developers.google.com/workspace/classroom/reference/rest/v1/courses.courseWork
