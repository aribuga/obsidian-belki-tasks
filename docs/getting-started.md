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

1. Click **+ Add task** at the top of any view.
2. Type a task title.
3. Optionally set a project, due date, priority, or labels from the composer.
4. Press Enter or click **Add task**.

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
| **Today** | Tasks due today + overdue tasks |
| **Upcoming** | Future tasks grouped by date |
| **Projects** | All projects or a single project |
| **Filters & Labels** | Browse by priority, date, or label |
| **Completed** | Done tasks grouped by completion date |

---

## Where are my tasks stored?

belki stores tasks as Markdown files inside your vault. The default location is `_belki_files/`. You can change this in Settings.

See [Markdown storage](markdown-storage.md) for details.
