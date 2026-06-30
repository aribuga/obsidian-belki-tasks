# Changelog

All notable changes to belki are documented here.

---

## 0.2.3 — 2026-06-30

### Fixed

- Bumped `minAppVersion` to `1.6.6` to match the `FileManager.trashFile()` API introduced in that version.

---

## 0.2.2 — 2026-06-30

### Fixed

- Fixed Obsidian CSS lint warnings: replaced `:has()` selectors with JS-added classes on the modal element, removed duplicate `height: 100vh/100dvh` fallbacks, eliminated all `!important` overrides by increasing selector specificity, and removed `scrollbar-width: none` in favour of the `::-webkit-scrollbar` rule already present.

---

## 0.2.1 — 2026-06-30

### Fixed

- Fixed TypeScript build error (`deadlinePanel` reference left over from the `renderDeadlineButton` refactor).
- Replaced direct `style.xxx` assignments with `setCssStyles()` and CSS class toggling to comply with the Obsidian plugin lint rule `obsidianmd/no-static-styles-assignment`.

---

## 0.2.0 — 2026-06-29

This release adds recurring tasks, sub-tasks, wikilinks, project management actions, group-by options, and a large number of mobile UX improvements and bug fixes.

### Added

- **Recurring tasks** — Set a repeat rule (daily, weekly, monthly, or custom) from the due date picker. Completing a recurring task moves it forward to the next occurrence instead of marking it done permanently. Use "Complete permanently" in the task detail view to end the recurrence.
- **Custom repeat modal** — Configure custom repeat intervals with a weekday selector. When a repeat rule is set, the due date auto-advances to today if no date was previously set.
- **Sub-tasks** — Add sub-tasks directly from the parent task detail view. Sub-tasks are hidden from top-level views. A badge on the parent task card shows the completion count (e.g. 2/5). Completed sub-tasks are sorted to the bottom with strikethrough styling.
- **Group by in project views** — Inside a project view, choose to group tasks by Label or Priority from the Sorting popover. Sorting still applies within each group. Default remains ungrouped.
- **Completed tasks grouped by date** — The Completed view now groups tasks by the date they were completed.
- **Quick-add token parsing** — Type `#label` or `//Project` in the task title when adding a task to apply them automatically. The tokens are stripped from the saved title. Autocomplete suggestions appear while typing.
- **Wikilink support** — Use `[[Note Name]]` in task titles and descriptions. Links open the referenced note in Obsidian.
- **Wikilink autocomplete** — Typing `[[` in the description field opens a note picker filtered from the vault. Navigate with arrow keys, confirm with Enter or tap.
- **Project actions** — Rename, archive, and delete projects from the `…` menu on each project section header. Deleting a project moves its tasks to Inbox. Archived projects can be restored from a separate view.
- **Label chip navigation** — Tapping a label chip on a task card opens the Labels filter view filtered to that label.
- **Clickable links in descriptions** — URLs and wikilinks in task descriptions are now tappable.

### Improved

- **Due date picker** — Redesigned as a single chip button that opens a popover. Repeat options are accessible directly inside the picker without a separate step.
- **Repeat chip** — Now clickable in the task detail view to reopen the repeat picker.
- **Scroll position preserved** — The board view no longer jumps to the top after saving a task or completing one.
- **Project picker** — Added a confirm button. Fixed toggle behavior and stale DOM element issues.

### Mobile

- **Labels and Deadline as direct buttons** — The mobile composer now shows Labels and Deadline as separate chips in the action row instead of behind an overflow menu.
- **Label chips in composer** — Selected labels appear as removable chips inline inside the composer.
- **Custom inline calendar picker** — The date input in the task detail modal is replaced with a pure-DOM month calendar grid. This fixes an iOS WKWebView issue where native `<input type="date">` would silently auto-confirm to today's date before the user had a chance to pick a date.
- **Deadline chip shows selected date** — After picking a deadline in the mobile composer, the date replaces the "Deadline" label inside the button. Tapping it again reopens the picker. A clear button (`×`) is rendered inline inside the chip.
- **Task detail footer layout** — When the "Complete permanently" button is visible (repeat tasks), it now appears on its own full-width row above the Cancel and Save buttons. The Delete button stays at the bottom of the footer.
- **Delete button on task rows** — The delete button (`×`) is now visible on mobile without requiring hover.
- **Project actions menu positioning** — The `…` menu is now appended to `document.body` and positioned using viewport coordinates after browser layout, so it appears correctly regardless of sidebar state or panel transforms.

### Fixed

- Fixed double reload triggered when a task is saved (vault event suppressed during in-flight writes).
- Fixed excessive re-renders from external vault events by routing them through a debounced handler.
- Fixed task ID collisions when tasks are stored across multiple monthly source files.
- Fixed wikilink dropdown becoming an orphaned element when the modal closes during autocomplete.
- Fixed Escape key being captured by the composer before the wikilink dropdown could close.
- Fixed quickAdd dropdown Escape handling and missing listener cleanup on close.
- Fixed project picker not reopening after being closed by a DOM leak fix.
- Fixed project menu DOM leak when the composer is closed without submitting.
- Fixed label chip remove button (`×`) showing a background border on mouse-out due to Obsidian theme hover transitions.
- Fixed task creation being attempted with an empty title.
- Fixed image preview modal leaving a CSS class on `document.body` after closing.
- Fixed sub-task creation error going uncaught in some edge cases.

### Internal

- Event listener cleanup standardized across all autocomplete dropdowns (quickAdd, wikilink).
- Outside-click and Escape handling normalized to use a consistent capture-phase pattern.
- Project menu moved to `document.body` to escape Obsidian panel CSS transforms; tracked as a class field and removed on render or view close.

---

## 0.1.6 and earlier

See [GitHub releases](https://github.com/aribuga/obsidian-belki-tasks/releases) for earlier changelogs.
