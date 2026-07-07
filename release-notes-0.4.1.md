# belki 0.4.1

Patch release with Daily Notes integration, safer contextual task creation, label keyboard improvements, and several consistency fixes.

## Added

- **Daily Note completed-task block** — Add a `belki-completed` code block to a Daily Note to show tasks completed on that note's date.

## Improved

- Add task controls now appear only where the created task will remain visible.
- Adding a task inside a selected project still defaults to that project.
- Adding from Upcoming now defaults the due date to tomorrow so the new task stays visible there.
- Add task label suggestions now support Arrow Up/Down navigation and Enter selection.

## Fixed

- Fixed Projects overview showing a misleading Add task action that created an Inbox task and disappeared from Projects.
- Fixed sidebar counters diverging from visible task lists after project moves/deletes.
- Fixed mobile task detail label creation requiring a second tap.
- Fixed project action menus not closing reliably on outside click or Escape.

## Internal

- Extracted board helper logic, project modal classes, and project action menu rendering for easier maintenance.
