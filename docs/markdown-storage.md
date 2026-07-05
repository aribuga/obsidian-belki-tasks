# Markdown storage

belki stores all task data as plain Markdown files inside your vault. There is no external database, no hidden file format, and no external service.

---

## File structure

```
_belki_files/           ← configurable in Settings
├─ Data/
│  ├─ 2026-05.md        ← tasks created in May 2026
│  ├─ 2026-06.md        ← tasks created in June 2026
│  └─ ...
└─ Attachments/
   └─ <task-id>/
      └─ filename.ext   ← attachment files
```

Tasks are stored in monthly files based on their creation date.

---

## Task format

Each task is a Markdown list item followed by metadata lines:

```markdown
- [ ] Write portfolio case study draft
  id:: abc123
  created:: 2026-06-29
  due:: 2026-07-01
  deadline:: 2026-07-05
  project:: Client Work
  priority:: P2
  description:: Keep it short and visual.
  labels:: writing, portfolio
  attachments:: _belki_files/Attachments/abc123/sketch.png
```

A completed task:

```markdown
- [x] Write portfolio case study draft
  id:: abc123
  created:: 2026-06-29
  completed:: 2026-07-01
  project:: Client Work
  priority:: P2
```

A recurring task:

```markdown
- [ ] Weekly review
  id:: def456
  created:: 2026-06-01
  due:: 2026-07-07
  repeat:: every 1 week
  completedOccurrences:: 2026-06-30, 2026-06-23
```

A sub-task:

```markdown
- [ ] Research CMS options
  id:: ghi789
  created:: 2026-06-29
  parentId:: abc123
  project:: Client Work
```

---

## Known metadata fields

| Field | Description |
|---|---|
| `id` | Unique task identifier |
| `created` | Creation date (ISO 8601) |
| `due` | Due date (ISO 8601) |
| `deadline` | Deadline date (ISO 8601) |
| `completed` | Completion date (ISO 8601) |
| `project` | Project name |
| `priority` | `P1`, `P2`, `P3`, `P4`, or legacy `none` |
| `description` | Single-line description |
| `labels` | Comma-separated label names |
| `attachments` | Comma-separated vault paths |
| `repeat` | Repeat rule string, including custom repeat rules |
| `completedOccurrences` | Comma-separated completion dates for recurring tasks |
| `parentId` | ID of the parent task (sub-tasks only) |

Unknown metadata fields in the file are preserved as-is and not modified.

---

## Obsidian compatibility

Because task data is real vault Markdown, it is visible to:

- Obsidian search
- Obsidian graph
- Obsidian unlinked mentions
- Any other plugin that reads vault files

If you do not want task data to appear in those surfaces, add your belki data folder to Obsidian's excluded files list.

---

## Backups and sync

belki task files are plain text and work with any file-based sync or backup system (iCloud, Obsidian Sync, Dropbox, git, etc.). belki itself does not handle sync.
