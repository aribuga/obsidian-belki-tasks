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
