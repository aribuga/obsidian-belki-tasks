# Mobile

belki works on Obsidian Mobile (iOS and Android).

---

## Layout

On mobile, belki uses a single-panel layout. The sidebar and task detail view stack vertically instead of showing side by side.

The task detail view has a back button (←) in the header to return to the task list.

---

## Adding tasks

The **+ Add task** button is available at the top of every view. On mobile, belki opens a full-screen composer so the title, description, metadata chips, project selector, and action buttons remain reachable around the keyboard.

You can also use `belki: Add task` from the command palette.

---

## Sub-tasks on mobile

The sub-task inline composer on mobile shows **Date** and **Priority** chips in a compact size consistent with the rest of the UI. The delete button (×) is always visible on the right side of each sub-task row.

Parent task counters can be tapped to expand a lightweight sub-task preview in the task list. Completing a sub-task from the preview updates the counter without closing the preview.

---

## Moving tasks on mobile

Use the task action menu (`…`) to move a task:

- Move to Today
- Move to Tomorrow
- Pick date
- Clear date

---

## Known limitations

- Drag-and-drop reordering is not supported on mobile. Use action menus for moving tasks and desktop for sub-task reordering.
- Wikilink autocomplete works in the description field but may behave differently depending on the mobile keyboard.

---

## Tips

- Use the `#label` and `//project` quick-add shortcuts to assign metadata without opening the full composer.
- The Sorting menu is accessible on mobile by tapping the **Sorting** button in the top-right corner of any view.
