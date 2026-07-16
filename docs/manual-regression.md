# Manual regression checklist

Use this checklist before a release or after changes that touch navigation, task actions, storage, calendar subscriptions, or mobile layout.

## Startup and navigation

1. Load belki in a test vault and confirm the plugin opens without console errors.
2. Navigate Inbox, Today, Upcoming, Projects, Filters & Labels, Activity, Completed, and Search.
3. Confirm sidebar counters match the visible task lists.
4. Collapse and expand the desktop sidebar.
5. Reload Obsidian and confirm the collapsed state persists.
6. Confirm Add Task is hidden in views where a new task would immediately disappear.

## Quick Add and composer

1. Open a regular Markdown note.
2. Press `Cmd/Ctrl + Shift + A`.
3. Confirm the global Quick Add modal opens.
4. Create a task and confirm it is added to Inbox.
5. Open belki Today on desktop.
6. Press `Cmd/Ctrl + Shift + A`.
7. Confirm the desktop floating composer opens and defaults to Today.
8. Open Upcoming and confirm the composer keeps Upcoming defaults.
9. Open a project view and confirm the current project is selected.
10. Open the composer and trigger Quick Add again.
11. Confirm no duplicate composer appears and the existing title field receives focus.
12. Keep belki open in a background tab, activate a Markdown note, and use the shortcut.
13. Confirm the global modal opens rather than the belki composer.
14. Assign a custom shortcut in Obsidian Settings -> Hotkeys.
15. Confirm the sidebar Add Task button shows the custom shortcut after returning to belki.
16. Remove the custom shortcut and confirm the sidebar hint updates or hides as expected.
17. Confirm mobile keeps the full-screen composer and global Quick Add behavior.

## Calendar subscriptions

1. Add a valid private or public iCal feed.
2. Confirm events appear in Today and Upcoming.
3. Confirm calendar-only Upcoming dates appear when a feed has events on days without belki tasks.
4. Expand and collapse calendar event strips.
5. Run manual Refresh and confirm visible events update.
6. Try an invalid URL and confirm a useful error appears.
7. Confirm private feed URLs are masked in settings and error messages.
8. Confirm events are not written into belki task Markdown files.
9. Confirm event editing, event creation, task export, and two-way sync are not implied or available.

## Daily Notes

1. Open a valid Daily Note and run **belki: Show Completed Tasks for Active Daily Note**.
2. Confirm completed tasks for that date appear.
3. Insert a `belki-completed` block and confirm it renders dynamically.
4. Confirm unrelated notes do not incorrectly resolve as Daily Notes.
5. Change the configured daily-note date format in a test vault and confirm matching still works.

## Overdue bulk actions

1. Show the Today Overdue section.
2. Reschedule visible overdue tasks to Today.
3. Reschedule visible overdue tasks to Tomorrow.
4. Reschedule visible overdue tasks to Next Week.
5. Pick a custom date.
6. Confirm hidden-range tasks are not changed.
7. Confirm completed tasks, sub-tasks, calendar events, and unrelated metadata are not changed.

## Task actions

1. Open the desktop task action menu from a task row.
2. Move a task to Today.
3. Move a task to Tomorrow.
4. Use Pick date and confirm the date picker opens in the expected position.
5. Clear a due date and confirm the task moves to Inbox when appropriate.
6. Duplicate a task without sub-tasks.
7. Duplicate a task with direct sub-tasks.
8. Confirm duplicated attachments are copied into independent duplicate task folders.
9. Delete a normal task and confirm the confirmation dialog appears.
10. Delete a parent task with sub-tasks and confirm the keep/delete sub-task options.
11. Delete a sub-task and confirm the parent counter updates.
12. Cancel destructive actions and confirm no task data changes.

## Screenshots and docs

1. Inspect the README screenshot gallery locally or in GitHub preview.
2. Confirm every referenced screenshot exists and renders.
3. Confirm screenshots do not expose private calendar URLs, API keys, email addresses, or sensitive personal data.
4. Confirm screenshot alt text is accurate.
5. Confirm documentation links from README and docs/README.md resolve.
