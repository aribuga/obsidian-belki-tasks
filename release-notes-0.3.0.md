# belki 0.3.0

This release is a larger usability update focused on mobile task capture, Markdown descriptions, multi-day recurring tasks, and sub-task organization.

## Highlights

- Full-screen mobile Add Task composer
- Markdown formatting toolbar for task descriptions
- Weekly repeats with multiple selected weekdays
- Manual drag-and-drop ordering for sub-tasks
- Cleaner repeat/date layouts on mobile and desktop

## Added

### Full-screen mobile composer

The mobile Add Task flow now opens as a full-screen task creation screen instead of a bottom sheet. This makes the composer more stable inside Obsidian mobile, especially when the keyboard is open.

The new mobile composer:

- keeps the task title compact
- gives more room to the description field
- keeps metadata controls reachable
- respects mobile safe areas
- avoids being covered by Obsidian's mobile toolbar
- returns to the previous view after task creation

### Markdown description formatting

Task descriptions now include a lightweight floating Markdown toolbar when text is selected.

Supported formatting actions include:

- bold
- italic
- strikethrough
- quote
- inline code
- code block
- bullet list
- numbered list
- link

Descriptions are still stored as regular Markdown in the local belki data files.

### Multi-day weekly repeats

Weekly scheduled-date repeats can now use more than one weekday.

Examples:

- Every week on Tuesday
- Every week on Tue, Thu
- Every week on Mon, Wed, Fri

The selected weekdays are saved, restored after reopening the task, and preserved after plugin reload.

Existing single-weekday repeat data remains backward compatible.

### Manual sub-task ordering

Sub-tasks can now be manually reordered from the task detail view.

The order is persistent:

- drag a sub-task using the handle
- close and reopen the task
- reload the plugin
- the custom order is preserved

Completed sub-tasks now stay in the user-defined order instead of being automatically pushed to the bottom.

## Improved

- Task list description previews are cleaner when descriptions contain Markdown syntax.
- The mobile composer now shows Labels and Deadline as direct controls instead of hiding them behind the overflow menu.
- Date, deadline, repeat, project, and overflow popovers are better anchored in the mobile composer.
- The Custom Repeat modal now shows the weekday selector correctly on mobile for weekly scheduled-date repeats.
- The Custom Repeat `Every` row now aligns the interval input and unit selector as a single control group.
- Long repeat labels now truncate instead of overflowing the task detail panel or mobile composer.
- Repeat chips in task detail now reopen the repeat editor directly.

## Fixed

- Fixed mobile quick add layout instability caused by keyboard and bottom-sheet interactions.
- Fixed custom date/repeat popovers drifting outside the mobile viewport.
- Fixed long multi-day repeat labels overflowing task detail controls.
- Fixed sub-task reordering snapping back after drop because the Markdown block order was still being serialized in the previous order.

## Compatibility

- Existing tasks and data files remain compatible.
- Existing single-weekday weekly repeats continue to load correctly.
- The plugin still stores task data as local Markdown files.

## Notes

Sub-task drag-and-drop is currently optimized for desktop. Mobile/tablet behavior may need a future touch-specific fallback if native drag-and-drop is inconsistent inside Obsidian mobile.
