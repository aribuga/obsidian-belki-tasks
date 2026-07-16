# Attachments

You can attach files to any task. Attachments are stored inside your vault.

---

## Adding an attachment

Open the task detail view. Scroll to the **Attachments** section. Click **+ Add attachment** and select a file from your device.

---

## How attachments are stored

Attachments are copied into the vault at:

```
_belki_files/Attachments/<task-id>/filename.ext
```

The path uses your configured data folder. Attachments are referenced from the task file using the vault path.

---

## Viewing attachments

**Images** — displayed as inline previews in the task detail view. Click a preview to open it in a lightbox.

**Other files** — displayed as a compact file row with the filename.

---

## Downloading an attachment

In the task detail view, click the download icon on an attachment row to save the file to your device.

---

## Removing an attachment

In the task detail view, click the remove button on an attachment row. This removes the reference from the task. The file remains in the vault.

---

## Duplicating tasks with attachments

When you duplicate a task, belki copies that task's attachments into the duplicated task's own attachment folder. The original and duplicate do not share the same physical attachment files.

If you choose to include direct sub-tasks during duplication, each duplicated sub-task receives independent copies of its own attachments. Parent attachments are not attached to duplicated sub-tasks, and sub-task attachments are not attached to the duplicated parent.

---

## Obsidian search

Because attachments are real vault files, images and documents may appear in Obsidian search results. If you do not want attachment files to appear in search, add the attachments path to Obsidian's excluded files list.
