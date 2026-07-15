# Changelog

All notable changes to belki are documented here.

---

## Unreleased

### Changed

- Added a confirmation step before permanently deleting tasks.

---

## 0.4.3 - 2026-07-13

Patch release focused on a better desktop add-task flow, narrow-pane navigation, and Obsidian review cleanup.

### Added

- Added a **desktop floating task composer**. On desktop, clicking `+ Add task` now opens a compact floating composer above the current task list instead of inserting an inline composer at the bottom.
- Added a collapsible desktop sidebar. The belki sidebar can now collapse into an icon rail and remembers the preferred layout.

### Improved

- Opening the desktop task composer no longer intentionally scrolls the task list or moves the user's current position.
- The floating composer preserves contextual defaults, including Today due dates, Upcoming defaults, and selected project defaults.
- Composer popovers for dates, labels, deadlines, and projects were adjusted for the floating composer layout.
- The Projects header add button now uses a transparent background for a quieter sidebar appearance.
- Sidebar collapse controls now use panel icons, a transparent background, and a more muted visual style.

### Fixed

- Fixed Obsidian review warnings by removing the default Quick Add hotkey, using cross-window-safe HTMLElement checks, and avoiding direct self-calls to deprecated settings tab rendering.

### Internal

- Split the root stylesheet into ordered partial CSS files while preserving the generated release `styles.css`.
- Completed several focused extraction passes from large UI/store modules, including composer controls, settings tab UI, task detail helpers, task action menus, filters/labels, and low-risk storage helpers.
- Added a small unit test setup for composer context behavior.

### Breaking Changes

- None expected.

---

## 0.4.2 — 2026-07-08

Patch release focused on iPadOS layout stability and a small internal cleanup.

### Fixed

- Fixed task completion circles stretching into pill-shaped checkboxes on iPadOS/mobile Obsidian panes wider than the narrow-phone breakpoint.
- Mobile/tablet task layout now also follows the `.is-mobile` state set by the plugin, instead of relying only on viewport width.
- Tightened task and sub-task checkbox sizing so they remain round and do not overlap task text.

### Internal

- Extracted label action menu rendering from `TaskBoardView` for maintainability.

---

## 0.4.1 — 2026-07-07

Patch release with Daily Notes integration, safer contextual task creation, label keyboard improvements, and several consistency fixes.

### Added

- **Daily Note completed-task block** — Add a `belki-completed` code block to a Daily Note to show tasks completed on that note's date. belki reads the note date from the Daily Notes context when possible.

### Improved

- Add task controls are now only shown in views where the created task will remain visible.
- Adding a task inside a selected project still defaults to that project.
- Adding from Upcoming now defaults the due date to tomorrow so the task stays visible in Upcoming.
- Label suggestions in the Add task composer can now be navigated with Arrow Up/Down and selected with Enter.
- Label suggestion options expose basic listbox/option accessibility attributes.

### Fixed

- Fixed Projects overview showing a misleading Add task action that created an Inbox task and then disappeared from the current view.
- Fixed sidebar counters counting hidden sub-tasks or archived-project tasks differently from the visible task lists.
- Fixed mobile task detail label creation requiring a second tap.
- Fixed project action menus not closing reliably on outside click or Escape.

### Internal

- Extracted board helper logic for maintainability.
- Extracted project modal classes and project action menu rendering from `TaskBoardView`.

---

## 0.4.0 — 2026-07-05

This release focuses on project and label management, activity history, faster capture, cleaner navigation, and more useful sub-task visibility.

### Highlights

- Added an **Activity** view with completed-task stats and a 26-week completion heatmap.
- Added command-palette quick add via `belki: Add task`.
- Added expandable sub-task previews directly in the main task list.
- Added label rename/delete management.
- Added project color selection during project creation.
- Refreshed the UI icon system with a centralized Lucide-based icon language.

### New Features

- **Activity view** — See completed task counts for today, yesterday, this week, this month, all time, and current streak, plus a contribution-style completed-task heatmap.
- **Vault-wide quick add** — Capture a task from the command palette without opening the task board first.
- **Expandable sub-task previews** — Click the sub-task counter on a parent task to preview sub-tasks inline and complete them without opening the detail view.
- **Label management** — Rename or delete labels from Settings or Filters & Labels. Renaming updates tasks safely; deleting removes the label from tasks without deleting the tasks.
- **Project color on creation** — Choose a project color when creating a project, or leave it on Auto for deterministic generated colors.

### Improvements

- Project colors are preserved when projects are renamed.
- Project actions close their popover before opening rename/archive/delete dialogs.
- Sidebar navigation uses lighter default states and clearer hover/active states.
- Priority selectors render as one cohesive control in both the composer and task detail.
- Repeat chips use shorter labels in compact task composer/detail spaces.
- Task detail date and deadline popovers stay contained within the modal.
- Task row checkmarks are smaller and visually centered.
- Wikilinks in task list/detail surfaces open more reliably.

### Mobile & Responsive

- Added mobile task move actions: Move to Today, Move to Tomorrow, Pick date, and Clear date.
- Improved mobile fallback behavior so users do not need drag-and-drop to move tasks.
- Smoothed mobile sub-task preview updates to avoid list jitter.
- Improved date, deadline, project, and action popover containment on small screens.

### Fixes

- Fixed overdue cards showing conflicting date/relative labels.
- Fixed generated project color readability in dark and custom themes.
- Fixed label chip color/readability issues.
- Fixed project action popovers staying visible behind modal dialogs.
- Fixed task detail close button alignment and date popover clipping.
- Addressed Obsidian review warnings around direct style assignment, unsafe typings, and unnecessary assertions.

### Internal

- Added a small internal Belki UI primitive layer for shared controls.
- Centralized icon rendering through Lucide-based `BelkiIcon` helpers.
- Cleaned up review-related TypeScript and icon typing warnings.

### Breaking Changes

- None expected.

---

## 0.3.1 — 2026-07-02

### Fixed

- Replaced direct style assignments in the task detail Markdown formatting toolbar measurement code with Obsidian-safe `setCssStyles()` calls to satisfy Community Plugin review linting.

---

## 0.3.0 — 2026-07-02

This release focuses on mobile capture, richer task descriptions, more flexible recurring tasks, and better sub-task control.

### Added

- **Full-screen mobile task composer** — On mobile, the quick add flow now opens as a dedicated full-screen composer instead of a cramped bottom sheet. It keeps the title compact, gives more room to the description, respects safe areas, and returns to the previous view after creating a task.
- **Markdown formatting toolbar for descriptions** — Selecting text in a task description now shows a small Belki-owned formatting toolbar for Markdown actions such as bold, italic, strikethrough, quote, inline code, code block, bullet list, numbered list, and link.
- **Multi-day weekly repeats** — Weekly scheduled-date repeats can now target more than one weekday, such as Tuesday and Thursday. The selection is saved, restored after reload, and used when calculating the next occurrence.
- **Manual sub-task ordering** — Sub-tasks can now be reordered inside the task detail view using a drag handle. The custom order is persisted by updating the underlying Markdown task block order.

### Improved

- Task list descriptions now show cleaner preview text for Markdown-formatted descriptions.
- The mobile composer exposes Labels and Deadline as direct chips instead of hiding them behind the overflow menu.
- Date, deadline, repeat, project, and overflow popovers in the mobile composer now stay better anchored and avoid being covered by the keyboard or Obsidian mobile toolbar.
- The Custom Repeat modal now keeps the weekly weekday selector visible on mobile when it is relevant.
- The Custom Repeat `Every` row now aligns the number input and unit selector as one control group.
- Long repeat labels now truncate instead of overflowing task detail or mobile composer layouts.
- Repeat chips in task detail now reopen the repeat editor directly.
- Completed sub-tasks now stay in the user-defined order instead of being forced to the bottom.

### Fixed

- Fixed mobile quick add layout instability caused by the bottom-sheet composer interacting poorly with the keyboard.
- Fixed Custom Repeat calendar and repeat popovers drifting outside the mobile viewport.
- Fixed long multi-day repeat labels overflowing task detail controls.
- Fixed sub-task reordering appearing to drag but snapping back after drop because the Markdown block order was still being serialized in the old order.

### Notes

- Sub-task drag-and-drop is currently optimized for desktop. Mobile/tablet behavior may need a future touch-specific fallback if native drag-and-drop is inconsistent in Obsidian mobile.

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
