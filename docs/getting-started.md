# Getting started

## Install belki

**From Community plugins:**

1. Open Obsidian Settings → Community plugins.
2. Click **Browse** and search for `belki`.
3. Install and enable the plugin.

**Manual installation:**

1. Download `manifest.json`, `main.js`, and `styles.css` from a [GitHub release](https://github.com/aribuga/obsidian-belki-tasks/releases).
2. Create `.obsidian/plugins/belki/` inside your vault.
3. Copy the three files into that folder.
4. Reload Obsidian.
5. Go to Settings → Community plugins → enable **belki**.

---

## Open belki

Run `belki: Open` from the command palette, or click the belki icon in the sidebar ribbon.

---

## Create your first task

1. Click **+ Add task** in a view where task creation is available.
2. Type a task title.
3. Optionally set a project, due date, priority, or labels from the composer.
4. Press Enter or click **Add task**.

You can also run `belki: Quick Add Task` from the command palette or press `Cmd/Ctrl + Shift + A`. When Belki is the active desktop view, the shortcut opens the contextual `+ Add task` composer with the current view defaults. Everywhere else, it opens the global Quick Add modal and adds the task to Inbox. Custom Obsidian hotkeys override this default shortcut.

On desktop, the sidebar **Add Task** button shows the currently assigned shortcut when one exists. If you remove the hotkey in Obsidian settings, the hint is hidden.

**Quick-add shortcuts in the title field:**

| Type | Effect |
|---|---|
| `#label` | Adds a label to the task |
| `//project` | Assigns the task to a project |

Example: `Write report #work //Client Work` — creates a task titled "Write report" with label `work` in project `Client Work`.

---

## Understand the views

| View | Shows |
|---|---|
| **Inbox** | Tasks with no project |
| **Today** | Tasks due today, overdue tasks, and optional read-only calendar events |
| **Upcoming** | Future tasks and optional calendar-only dates grouped by date |
| **Projects** | All projects or a single project |
| **Filters & Labels** | Browse by priority, date, or label |
| **Activity** | Completed task stats and history |
| **Completed** | Done tasks grouped by completion date |

---

## Where are my tasks stored?

belki stores tasks as Markdown files inside your vault. The default location is `_belki_files/`. You can change this in Settings.

See [Markdown storage](markdown-storage.md) for details.
