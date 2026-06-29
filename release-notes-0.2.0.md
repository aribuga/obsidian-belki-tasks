# Belki Tasks 0.2.0

This release focuses on recurring tasks, sub-tasks, project management, mobile UX, and a wide range of stability fixes.

---

## What's new

### Recurring tasks

Set a repeat rule (daily, weekly, monthly, or custom) from the due date picker. Completing a recurring task moves it forward to the next occurrence. Use **Complete permanently** in the task detail to end the recurrence. A custom repeat modal lets you pick specific weekdays and intervals.

### Sub-tasks

Add sub-tasks directly from a parent task's detail view. Sub-tasks are hidden from top-level views so they don't clutter Inbox or Today. A completion counter badge appears on the parent task card (e.g. 2/5).

### Project actions

Rename, archive, and delete projects using the `…` menu on project headers. Deleted projects move their tasks to Inbox. Archived projects can be restored later.

### Group by in project views

Inside any project view, open the Sorting popover to group tasks by **Label** or **Priority**. Sorting still applies within each group.

### Quick-add token parsing

Type `#label` or `//Project` directly in the task title to assign them while adding a task. Tokens are stripped from the saved title. Autocomplete suggestions appear as you type.

### Wikilinks

Use `[[Note Name]]` in task titles and descriptions to link to vault notes. Typing `[[` in the description field opens an autocomplete picker.

---

## Mobile improvements

- Labels and Deadline now appear as direct chips in the composer action row instead of behind an overflow menu.
- Selected labels appear as removable chips inline in the composer.
- After picking a deadline, the selected date appears inside the Deadline chip. Tapping it reopens the picker; `×` clears it.
- The task detail footer layout is fixed when **Complete permanently** is visible — it now occupies its own row above Cancel and Save.
- The date picker in the task detail modal is replaced with a custom inline calendar grid, fixing an iOS issue where native date inputs would silently auto-confirm to today before the user could choose.
- The delete button on task rows is now visible on mobile without hover.
- The project actions menu (`…`) positions correctly regardless of sidebar state.

---

## Bug fixes

- Fixed double reload when a task is saved.
- Fixed task ID collisions across multiple monthly storage files.
- Fixed wikilink and quickAdd dropdowns not cleaning up properly when modals close.
- Fixed Escape key conflicts between the composer and autocomplete dropdowns.
- Fixed project picker not reopening after a DOM cleanup pass.
- Fixed label chip remove button showing a background on mouse-out.
- Fixed image preview modal leaving a CSS class on the document body after closing.

---

Thanks to everyone who shared feedback, reported issues, and helped shape this release.
