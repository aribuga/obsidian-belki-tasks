# belki 0.4.0

This release is a broad usability update focused on project and label management, activity history, faster capture, cleaner navigation, and more useful sub-task visibility.

## Highlights

- New **Activity** view with completed-task stats and a contribution-style heatmap.
- New command-palette quick add flow for capturing tasks without opening the board first.
- Parent tasks can now expand their sub-task preview directly in the task list.
- Labels can now be renamed or deleted, with task metadata updated safely.
- Projects can be created with a color, and project colors are preserved across renames.
- The interface now uses a consistent Lucide-based icon system.

## New features

### Activity view

The sidebar now includes **Activity**, a compact overview of completed tasks. It shows counts for today, yesterday, this week, this month, all time, current streak, plus a 26-week completion heatmap.

### Vault-wide quick add

Run `belki: Add task` from the command palette to add a task quickly. It uses the same parser and metadata behavior as the board composer, including labels, projects, dates, priorities, and storage.

### Expandable sub-task preview

Parent task rows with sub-tasks now show a clickable completion counter. Click the counter to expand an inline preview, complete sub-tasks directly, or open a sub-task detail view.

### Label management

Labels are now manageable from Settings and the Filters & Labels view:

- Rename a label and update all tasks that use it.
- Delete a label from tasks and settings without deleting any tasks.
- Keep existing label color reset behavior as a color-only reset.

### Project color on creation

When creating a project, you can now choose a color immediately or leave it on Auto. Auto keeps using belki's deterministic generated color without creating unnecessary settings overrides.

## Improvements

- Project colors are preserved when projects are renamed.
- Project actions now dismiss their popover before opening rename/archive/delete flows.
- Sidebar navigation now uses lighter interaction states, closer to the mobile navigation behavior.
- Task row checkmarks are visually centered and smaller inside completed circles.
- Priority controls now render as one cohesive chip/select surface.
- Repeat chips use compact labels in task creation and task detail layouts.
- Task detail date and deadline popovers stay inside the modal instead of overflowing.
- Task wikilinks now open more reliably from list and detail surfaces.
- The README screenshots and documentation have been refreshed for the current UI.

## Mobile & responsive

- Mobile task action menus now include practical move actions such as Move to Today, Move to Tomorrow, Pick date, and Clear date.
- Mobile users have a fallback for moving tasks without relying on drag-and-drop.
- Date, deadline, and project popovers have better containment in small screens.
- Several mobile jitter and layout issues around task actions and sub-task previews were smoothed out.

## Fixes

- Fixed overdue date labels so the visible date and relative label are derived from the same source date.
- Fixed project color readability for generated/default project colors across light and dark themes.
- Fixed label color/readability issues in chips.
- Fixed project action popovers staying visible behind rename/archive/delete dialogs.
- Fixed Obsidian review warnings around unsafe typings, unnecessary assertions, and direct style assignment.
- Fixed task detail close button alignment and date popover clipping.

## Internal

- Added a small internal Belki UI primitive layer for shared buttons, chips, cards, inputs, and modal action rows.
- Refactored UI icons through a centralized Lucide icon map and `BelkiIcon` helper.
- Cleaned up Obsidian review warnings in TypeScript and icon typing.

## Compatibility

- No breaking changes are expected.
- Existing tasks, projects, labels, colors, recurring rules, attachments, and sub-tasks should continue to load normally.
