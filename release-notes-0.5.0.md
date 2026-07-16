# belki 0.5.0

belki 0.5.0 makes the task board more useful day to day: read-only calendar events can sit beside tasks, Daily Notes can show completed work, desktop capture is faster, overdue cleanup is easier, and task actions are safer.

## Highlights

- Read-only iCal calendar subscriptions in Today and Upcoming.
- Daily Notes completed-task panel and `belki-completed` code block.
- Desktop floating Add Task composer with contextual defaults.
- Context-aware `Cmd/Ctrl + Shift + A` Quick Add shortcut.
- Collapsible desktop sidebar with shortcut hint on the Add Task button.
- Bulk overdue rescheduling.
- Safer task action menu with duplicate and delete confirmation.

## Added

- Multiple read-only iCal subscriptions for private or public feeds, including Google Calendar Secret iCal links, Apple/iCloud Calendar feeds, and other HTTPS or `webcal://` feeds.
- Calendar-only Upcoming dates, collapsible event strips, manual refresh, automatic refresh, ETag/Last-Modified handling, and masked feed URLs.
- Daily Notes commands for showing completed tasks and inserting a `belki-completed` block.
- Desktop floating composer for Today, Upcoming, Inbox, and project contexts.
- Desktop task action menu with Move to Today, Move to Tomorrow, Pick date, Clear date, Duplicate task, and Delete task.
- Duplicate task support with optional direct sub-task duplication and independent attachment copies.
- Bulk overdue rescheduling for visible eligible overdue tasks.

## Improved

- Sidebar Add Task now uses a wider desktop button and shows the current Obsidian shortcut when assigned.
- Quick Add respects custom Obsidian hotkeys and opens the contextual composer only when an active desktop belki view should receive it.
- Navigation counters now match visible tasks more closely.
- Add Task controls are hidden where new tasks would immediately disappear from the current view.
- Project, label, date, deadline, repeat, priority, and detail menus have better containment and spacing.
- Calendar feed errors avoid exposing private URLs or secret tokens.
- Build and release docs now align with the pnpm workflow while keeping Obsidian release assets at the repository root.

## Fixed

- Added confirmation before deleting tasks.
- Parent task deletion now asks whether to keep direct sub-tasks or delete them with the parent.
- Fixed Projects overview Add Task behavior, sidebar counter mismatches, mobile label creation, menu close behavior, task detail picker spacing, and task action Pick date positioning.
- Addressed several Obsidian review warnings around API compatibility, unsafe typings, cross-window element checks, and direct style assignment.

## Mobile

- Mobile keeps the existing full-screen composer and global Quick Add behavior.
- Mobile task action menus provide no-drag options for moving, clearing dates, duplicating, and deleting tasks.
- Fixed iPadOS/mobile completion circles and improved small-screen picker behavior.

## Internal

- Continued splitting large view, detail, composer, settings, storage, and style files into focused modules.
- Added calendar parser/service/cache helpers and broad regression coverage.
- Added tests for calendar subscriptions, bulk rescheduling, delete confirmation, task duplication, attachment duplication, composer context, and Quick Add hotkey formatting.

## Breaking Changes

- None expected. Existing belki task Markdown files remain compatible.
