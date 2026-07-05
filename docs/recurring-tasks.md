# Recurring tasks

belki supports recurring tasks. When you complete a recurring task, it resets instead of marking as permanently done.

---

## Setting a repeat rule

Open the task detail view. Click the **Repeat** chip in the date section. Choose from:

- Daily
- Weekly
- Weekdays
- Monthly
- Yearly
- Custom (set a specific interval and unit)

Repeat rules can be calendar-based or completion-based:

- **Calendar-based** — the next due date is calculated from the original due date regardless of when you completed it.
- **Completion-based** — the next due date is calculated from the date you actually completed the task.

For weekly scheduled-date repeats, you can select more than one weekday, such as Monday, Wednesday, and Friday.

---

## How completion works

When you complete a recurring task:

1. The current occurrence is recorded.
2. The due date advances to the next occurrence.
3. The task stays active in the task list with the new due date.
4. The completed occurrence is stored in `completedOccurrences::`.

If a recurring task has a repeat end condition (after N occurrences or by a specific date), it will mark as permanently completed when the condition is met.

---

## Removing a repeat rule

Open the task detail, open the date/repeat popover, and select the active repeat rule to toggle it off.

Removing the repeat rule on a task that has already completed occurrences will keep the occurrence history in the file. It will not affect the completed view.

---

## Permanently completing a recurring task

Open the task detail. If the task has a repeat rule, a **Complete permanently** button appears at the bottom. Clicking it marks the task as done and removes the repeat rule.
