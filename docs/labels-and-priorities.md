# Labels and priorities

## Labels

Labels are freeform tags you assign to tasks. A task can have multiple labels.

### Adding labels

- In the quick-add composer: type `#label` in the title field.
- In the task detail view: click the **Labels** field and type or select a label.

### Label colors

Labels get stable muted colors by default. You can customize label colors in Settings → Label colors.

### Managing labels

You can rename or delete labels from Settings or the **Filters & Labels** view.

- Renaming a label updates all tasks that use the old label.
- Deleting a label removes it from tasks and settings, but does not delete any tasks.
- Reset still only resets the label color.

### Filters & Labels view

The **Filters & Labels** view shows all your labels. Click a label to see all tasks with that label.

You can also click a label chip on a task card to jump directly to the filtered view for that label.

---

## Priorities

belki uses four priority levels:

| Priority | Label |
|---|---|
| P1 | Priority 1 (highest) |
| P2 | Priority 2 |
| P3 | Priority 3 |
| P4 | Default / normal priority |

P4 is treated as the default state. It appears as **Priority** in closed selectors and does not create a strong visual badge. Older tasks that store `priority:: none` are still supported and render like P4.

### Setting priority

- In the quick-add composer: use the **Priority** selector chip.
- In the task detail view: use the **Priority** field in the right panel.

### How priority appears

Priority is shown as a color on the task's completion circle. Task titles are not recolored. Priority colors are subtle by default.

---

## Filters & Labels view

The **Filters & Labels** view groups tasks into these filter sections:

- Priority 1 through Priority 4
- View all
- No due date
- Today
- Overdue
- With deadline
- No label

Click any filter row to see the matching tasks.
