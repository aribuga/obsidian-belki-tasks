# Daily Notes

belki can show completed tasks for the active daily note date.

By default, the integration is non-invasive: belki can show the list in its own panel or in a code block you add manually. If you enable auto-insert in settings, belki can append that code block to daily notes that do not already have it.

---

## How to use it

### belki panel

If a belki panel is already open, opening a daily note switches that panel to the matching Daily Note view automatically.

You can also run **belki: Show Completed Tasks for Active Daily Note** from the command palette. belki opens its task panel and shows tasks completed on that daily note date.

### Markdown code block

Add this block to a daily note to show completed tasks directly inside the note:

````markdown
```belki-completed
```
````

By default, belki detects the date from the note path/name. You can also pass an explicit date:

````markdown
```belki-completed
date: 2026-07-05
```
````

The code block is read-only. It renders completed tasks from belki task data, but it does not write task content into the note.

You can insert the block from the command palette with **belki: Insert Completed Tasks Block in Active Daily Note**.

### Auto-insert

Settings → belki → Daily Notes includes **Auto-add completed tasks block**.

When enabled, opening a daily note appends this block to the end of the note if it is not already present:

````markdown
```belki-completed
```
````

belki only inserts the block wrapper. The completed-task list still renders dynamically from belki task data.

---

## Date matching

By default, belki looks for daily notes named like:

```text
YYYY-MM-DD.md
```

You can change the date format in Settings → belki → Daily Notes.

Supported numeric tokens:

- `YYYY`
- `YY`
- `MM`
- `M`
- `DD`
- `D`

Example:

```text
YYYY/MM/YYYY-MM-DD
```

belki also falls back to detecting an ISO date like `2026-07-05` from the note name.

---

## Recurring tasks

Recurring task completions are included when the task has a completed occurrence for that date.

---

## Notes

The integration currently uses the configurable date format in belki settings plus an ISO-date fallback. Auto-insert is optional and disabled by default.
