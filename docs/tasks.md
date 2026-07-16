# Tasks

## Creating a task

Click **+ Add task** or run `belki: Add task` from the command palette.

The quick-add composer lets you set:

- Title
- Project
- Due date
- Priority
- Labels
- Description
- Attachments

You can also type `#label` or `//project` directly in the title field. belki parses these tokens and applies them automatically when you save.

---

## Editing a task

Click a task row to open its detail view. You can edit:

- Title (with wikilink support)
- Description (with wikilink support)
- Project
- Due date
- Deadline
- Priority
- Labels
- Attachments
- Repeat rule

Changes are saved automatically when you close the detail view or click **Save**.

---

## Wikilinks in tasks

You can use Obsidian wikilinks inside task titles and descriptions:

```
[[Note name]]
[[Note name|Alias]]
[[Note name#Heading]]
```

Clicking a wikilink opens the linked note in Obsidian.

---

## Completing a task

Click the circle on the left of any task row. Completed tasks move to the **Completed** view.

To undo completion, click the circle again in the Completed view or open the task detail.

---

## Recurring tasks

Recurring tasks reset after completion instead of marking as done. See [Recurring tasks](recurring-tasks.md).

---

## Deleting a task

Use the task row delete control, the task action menu, or open the task detail and click **Delete task** at the bottom. belki asks for confirmation before permanently deleting a task.

If the task has direct sub-tasks, belki asks whether to delete only the parent task or delete the parent together with its sub-tasks. Deleting only the parent turns its direct sub-tasks into normal top-level tasks.

---

## Duplicating a task

Use **Duplicate task** from the task action menu to create an independent copy of a task. belki copies editable fields such as title, description, project, priority, due date, deadline, labels, and attachments.

Attachments are copied into the duplicated task's own attachment folder, so the original and duplicate do not share the same physical files. If the task has direct sub-tasks, belki asks whether to duplicate only the task or include its sub-tasks. Completion history and repeat rules are not copied.

---

## Drag and drop

On desktop, you can drag a task onto a project or date group to update its project or due date. For example, dragging a task onto an Upcoming date group changes its due date to that date.

On mobile, use the task action menu for actions such as **Move to Today**, **Move to Tomorrow**, **Pick date**, **Clear date**, and **Duplicate task**.
