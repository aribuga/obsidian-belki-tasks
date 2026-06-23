# belki

belki is a minimal Todoist-like task manager for Obsidian. It keeps your tasks inside your vault as readable Markdown and does not connect to Todoist or any external service.

Task data is stored by default in:

```text
_belki_files/
├─ main.md
├─ Data/
│  └─ YYYY-MM.md
└─ Attachments/
   └─ <task-id>/
```

## Features

- Inbox, Today, Upcoming, Projects, Filters & Labels, Search, and Completed views
- Add, edit, complete, uncomplete, delete, and reschedule tasks
- Due dates, deadlines, projects, priorities, descriptions, labels, and attachments
- Markdown-first storage using the Obsidian Vault API
- Automatic refresh when belki task data changes on disk
- Drag a task onto a project or compatible date group to update metadata
- Configurable data folder, sidebar icons, project colors, label colors, overdue range, sort mode, and fonts

## Task Format

belki stores tasks as Markdown list items with metadata underneath:

```markdown
- [ ] Task title
  id:: task-unique-id
  created:: 2026-06-22
  due:: 2026-06-22
  deadline:: 2026-06-25
  project:: Inbox
  priority:: P1
  description:: Optional description
  labels:: client, urgent
  attachments:: [[_belki_files/Attachments/task-unique-id/image.png]]
```

Completed tasks use `[x]` and include:

```markdown
completed:: 2026-06-22
```

Older `belki/tasks.md` files can be migrated with the command:

```text
belki: Migrate old task file
```

## Priority System

Priorities are stored as Markdown metadata:

- `P1` = Priority 1
- `P2` = Priority 2
- `P3` = Priority 3
- `P4` = Priority 4
- `none` = no priority

In the UI, priority is shown with subtle colors, including the task completion circle. Task titles are not recolored by priority.

## Labels

Labels are stored in the `labels::` metadata field as comma-separated values. belki normalizes duplicate labels and can show labels as small chips in task rows and task details.

The Filters & Labels view lets you browse label-based task lists. Label colors can be customized in settings; otherwise belki assigns stable muted colors automatically.

## Attachments

Attachments are copied into the vault under:

```text
_belki_files/Attachments/<task-id>/
```

Image attachments show previews in the task detail modal and can be opened in a lightbox. Other attachments are shown as compact file rows. Attachments can be downloaded or removed from a task.

## Sorting and Filtering

The task board includes a Sorting menu with:

- Smart
- Due date
- Priority
- Deadline
- Created date
- Project
- Alphabetical

Today keeps today's tasks and overdue tasks in separate groups. Upcoming keeps date groups in date order. Sorting applies inside the current group or view.

The Today view also includes an overdue range selector:

- Yesterday
- Last 7 days
- Last 30 days
- Older

## Installation

### From Community Plugins

Once belki is accepted into the Obsidian Community Plugins directory:

1. Open Obsidian Settings.
2. Go to Community plugins.
3. Search for `belki`.
4. Install and enable the plugin.
5. Run the command `belki: Open`.

### Manual Installation

1. Download `manifest.json`, `main.js`, and `styles.css` from a GitHub release.
2. Create this folder inside your vault:

```text
.obsidian/plugins/belki/
```

3. Copy the three downloaded files into that folder.
4. Reload Obsidian.
5. Enable `belki` in Community plugins.
6. Run the command `belki: Open`.

## Development

Requirements:

- Node.js
- npm

Install dependencies:

```bash
npm install
```

Build:

```bash
npm run build
```

The build outputs:

- `main.js`
- `styles.css`
- `manifest.json`

For local testing, copy or symlink this repository into an Obsidian vault at:

```text
.obsidian/plugins/belki/
```

Then reload Obsidian and enable the plugin.

## Release Checklist

Before publishing a release:

1. Update `version` in `manifest.json` and `package.json`.
2. Update `versions.json` with the same plugin version and the matching `minAppVersion`.
3. Run `npm install`.
4. Run `npm run build`.
5. Confirm `manifest.json`, `main.js`, and `styles.css` exist.
6. Create a GitHub release whose tag exactly matches the plugin version, for example `0.1.0`.
7. Do not prefix the release tag with `v`.
8. Upload `manifest.json`, `main.js`, and `styles.css` as individual release assets.

## Privacy and Network Usage

belki stores task data and attachments inside your Obsidian vault. It does not add telemetry, analytics, cloud sync, account login, or network requests.

## License

MIT

## Author

Yasin Aribuga
