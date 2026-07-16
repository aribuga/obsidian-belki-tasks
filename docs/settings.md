# Settings

Open Settings → belki to configure the plugin.

---

## Data folder

**Data folder path** — the vault folder where belki stores task data. Default: `_belki_files`.

Changing this after you have existing tasks will not move your data. Move the folder manually and update this setting to match.

---

## Project colors

Assign a color to each project. The color appears as a dot in the sidebar and on task cards.

Projects can also receive a color when they are created. Auto colors are generated from the project name; explicit color overrides are stored in settings.

---

## Label colors

Assign a color to each label. If no color is set, belki assigns a stable muted color automatically based on the label name.

You can also rename or delete labels from this section. Deleting a label removes it from tasks and settings, but does not delete tasks.

---

## Overdue range (default)

Sets the default range for the Overdue section in the Today view:

- Yesterday
- Last 7 days (default)
- Last 30 days
- Older

---

## Sort mode

Sets the default sort order for task lists. This can also be changed per-session from the Sorting menu.

---

## Daily Notes

**Enable Daily Notes integration** allows belki to show completed tasks for the active daily note date.

**Daily note date format** controls how belki matches a note path to a date. Default: `YYYY-MM-DD`.

**Auto-add completed tasks block** appends a `belki-completed` code block to daily notes that do not already have one. This is disabled by default.

belki can show completed tasks in its own Daily Note panel or with a `belki-completed` Markdown code block. Auto-insert only writes the code block wrapper, not a static list of tasks.

---

## Calendar

The Calendar settings group controls optional read-only iCal subscriptions.

- **Add iCal calendar** subscribes to a private or public iCal feed.
- Each calendar has a local name, masked URL, color, and enabled toggle.
- **Refresh** reloads one feed or all feeds.
- **Edit** changes the name, color, enabled state, or replaces the saved URL.
- **Remove** clears the saved URL and cached events for that feed.

Google Calendar Secret iCal links, Apple/iCloud Calendar iCal feeds, and other HTTPS or `webcal://` iCal feeds can be used when the provider exposes a valid feed URL. Calendar events are not written to belki task Markdown files and are not counted as tasks. See [Calendar Subscriptions](calendar-subscriptions.md) for setup, refresh behavior, and troubleshooting.

---

## Fonts

Set the font used for different text areas inside belki:

- **UI font** — general plugin interface
- **Task title font** — task title in cards and detail view
- **Task description font** — description field
- **Label font** — label chip text

Font options: system default, serif, monospace, or any custom font available in Obsidian.

---

## Obsidian excluded files

belki data files are real vault files and may appear in Obsidian search and graph. To hide them, add your belki data folder to:

> Obsidian Settings → Files and links → Excluded files
