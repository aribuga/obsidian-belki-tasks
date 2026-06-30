# Belki Manual Regression Checklist

Run `npm run test:vault:reset` before starting to ensure a clean baseline.

---

## Startup

- [ ] Plugin loads without error.
- [ ] No "File already exists" error appears.
- [ ] Existing tasks are loaded correctly.
- [ ] Empty vault state works.
- [ ] Plugin can be disabled and re-enabled without breaking.
- [ ] Reloading Obsidian does not duplicate files or tasks.

---

## Quick Add

- [ ] Add a simple task.
- [ ] Add a task with deadline.
- [ ] Add a task with label.
- [ ] Add a task with project.
- [ ] Add a task with both label and project.
- [ ] Add a task with a long title.
- [ ] Empty title cannot create a broken task.
- [ ] Escape closes autocomplete, not the whole composer.
- [ ] Escape closes date picker or dropdown first before closing the composer.
- [ ] Quick add does not lose typed content unexpectedly.

---

## Deadline

- [ ] Add deadline to a new task.
- [ ] Edit deadline from task detail.
- [ ] Remove deadline.
- [ ] Deadline chip displays correctly.
- [ ] Deadline clear X is aligned correctly.
- [ ] Overdue tasks appear correctly.
- [ ] Today tasks appear correctly.
- [ ] Upcoming tasks appear correctly.

---

## Labels

- [ ] Add label from quick add.
- [ ] Add label from task detail.
- [ ] Remove label.
- [ ] Existing labels autocomplete correctly.
- [ ] Label display does not overflow on small screens.
- [ ] Labels are saved correctly to markdown.

---

## Projects

- [ ] Add project from quick add.
- [ ] Add project from task detail.
- [ ] Remove project.
- [ ] Existing projects autocomplete correctly.
- [ ] Project display is correct on task cards.
- [ ] Project data is saved correctly to markdown.

---

## Task Detail

- [ ] Open task detail.
- [ ] Edit task title.
- [ ] Edit deadline.
- [ ] Add label.
- [ ] Remove label.
- [ ] Add project.
- [ ] Remove project.
- [ ] Delete task.
- [ ] Complete task.
- [ ] Reopen or undo completed task if supported.
- [ ] Detail panel does not visually break with long content.

---

## Subtasks

- [ ] Add subtask from task detail.
- [ ] Complete subtask.
- [ ] Delete subtask.
- [ ] Edit subtask title.
- [ ] Subtask counter appears on board.
- [ ] Subtask counter updates after completion.
- [ ] Subtask detail view still feels visually nested.
- [ ] Parent task remains clear when viewing a subtask.
- [ ] Subtasks are saved correctly to markdown.
- [ ] Deleting a parent task handles subtasks safely.

---

## Recurring Tasks

- [ ] Add daily recurring task.
- [ ] Add weekly recurring task.
- [ ] Open repeat settings from task detail.
- [ ] Edit repeat settings.
- [ ] Complete recurring task.
- [ ] Next occurrence is created correctly.
- [ ] Completing recurring task does not duplicate broken tasks.
- [ ] Recurring task keeps labels/projects/deadline rules correctly.

---

## Completed Tasks

- [ ] Complete a normal task.
- [ ] Completed task is displayed in the correct completed section.
- [ ] Completed tasks do not disappear incorrectly.
- [ ] Completed tasks do not duplicate after reload.
- [ ] Completed recurring tasks behave correctly.

---

## Board UI

- [ ] Task cards display title correctly.
- [ ] Task cards display labels correctly.
- [ ] Task cards display project correctly.
- [ ] Task cards display deadline correctly.
- [ ] Subtask counter displays correctly.
- [ ] Board refreshes after adding, editing, deleting, or completing a task.

---

## Mobile Layout

- [ ] Quick add works in narrow/mobile width.
- [ ] Footer buttons do not jump.
- [ ] Delete button stays aligned.
- [ ] Complete permanently button does not push layout awkwardly.
- [ ] Deadline picker does not leave an empty box.
- [ ] Deadline text appears in the correct place after selection.
- [ ] Deadline clear X is aligned correctly.
- [ ] Labels and deadline fit without overflow.
- [ ] Task detail remains usable on small screens.

---

## File Operations

- [ ] Plugin creates required files only when needed.
- [ ] Plugin does not throw "File already exists".
- [ ] Existing files are reused safely.
- [ ] Markdown is updated without corrupting unrelated content.
- [ ] Reloading the vault keeps task data stable.
- [ ] Empty files do not crash the plugin.
- [ ] Missing files are recreated safely.

---

## Release Smoke Test

- [ ] Run `npm run build`.
- [ ] Run `npm run test:vault`.
- [ ] Open `test-vaults/belki-test` in Obsidian.
- [ ] Enable plugin.
- [ ] Check console for errors.
- [ ] Add task.
- [ ] Edit task.
- [ ] Complete task.
- [ ] Delete task.
- [ ] Reload Obsidian.
- [ ] Confirm no duplicate or broken tasks.
