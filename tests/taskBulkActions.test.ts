import { test } from "node:test";
import * as assert from "node:assert/strict";
import { addDaysIso, todayIso } from "../src/dateUtils";
import {
  createTaskDueDateUpdatePlan,
  dueDateForBulkRescheduleShortcut,
  getVisibleOverdueTasksForBulkReschedule,
  type OverdueRangeDates
} from "../src/taskBulkActions";
import type { BelkiTask, RepeatRule } from "../src/types";

const rangeDates: OverdueRangeDates = {
  today: "2026-07-15",
  yesterday: "2026-07-14",
  last7Start: "2026-07-08",
  last30Start: "2026-06-15"
};

test("bulk reschedule action is hidden when no visible overdue tasks exist", () => {
  const tasks = [
    task("today", { due: "2026-07-15" }),
    task("future", { due: "2026-07-16" }),
    task("completed", { due: "2026-07-14", completed: true })
  ];

  assert.equal(
    getVisibleOverdueTasksForBulkReschedule(tasks, "yesterday", rangeDates).length,
    0
  );
});

test("bulk reschedule count uses visible overdue tasks only", () => {
  const tasks = [
    task("yesterday", { due: "2026-07-14" }),
    task("last-week", { due: "2026-07-10" }),
    task("last-month", { due: "2026-06-20" }),
    task("completed", { due: "2026-07-14", completed: true }),
    task("subtask", { due: "2026-07-14", parentId: "parent" }),
    task("today", { due: "2026-07-15" })
  ];

  assert.deepEqual(
    getVisibleOverdueTasksForBulkReschedule(tasks, "last7", rangeDates).map((candidate) => candidate.id),
    ["yesterday", "last-week"]
  );
});

test("bulk reschedule respects the selected overdue range", () => {
  const tasks = [
    task("yesterday", { due: "2026-07-14" }),
    task("last-seven", { due: "2026-07-08" }),
    task("last-thirty", { due: "2026-06-15" }),
    task("older", { due: "2026-06-14" })
  ];

  assert.deepEqual(
    getVisibleOverdueTasksForBulkReschedule(tasks, "yesterday", rangeDates).map((candidate) => candidate.id),
    ["yesterday"]
  );
  assert.deepEqual(
    getVisibleOverdueTasksForBulkReschedule(tasks, "last7", rangeDates).map((candidate) => candidate.id),
    ["yesterday", "last-seven"]
  );
  assert.deepEqual(
    getVisibleOverdueTasksForBulkReschedule(tasks, "last30", rangeDates).map((candidate) => candidate.id),
    ["yesterday", "last-seven", "last-thirty"]
  );
  assert.deepEqual(
    getVisibleOverdueTasksForBulkReschedule(tasks, "older", rangeDates).map((candidate) => candidate.id),
    ["older"]
  );
});

test("bulk reschedule shortcuts use existing local date behavior", () => {
  assert.equal(dueDateForBulkRescheduleShortcut("today"), todayIso());
  assert.equal(dueDateForBulkRescheduleShortcut("tomorrow"), addDaysIso(1));
  assert.equal(dueDateForBulkRescheduleShortcut("nextWeek"), addDaysIso(7));
});

test("bulk due-date update plan supports custom dates and changes only due fields", () => {
  const repeat: RepeatRule = {
    frequency: "weekly",
    interval: 1,
    mode: "scheduledDate",
    weekday: 2,
    ends: "never"
  };
  const original = [
    task("visible", {
      due: "2026-07-14",
      deadline: "2026-07-20",
      repeat,
      project: "Work",
      labels: ["urgent"],
      attachments: ["_belki_files/Attachments/a/file.png"],
      description: "Keep me",
      priority: "P1"
    }),
    task("hidden", { due: "2026-07-01", deadline: "2026-07-22" })
  ];

  const plan = createTaskDueDateUpdatePlan(original, ["visible"], "2026-07-31");
  const updated = plan.tasks.find((candidate) => candidate.id === "visible");
  const untouched = plan.tasks.find((candidate) => candidate.id === "hidden");

  assert.deepEqual(plan.changedIds, ["visible"]);
  assert.equal(updated?.due, "2026-07-31");
  assert.equal(updated?.deadline, "2026-07-20");
  assert.deepEqual(updated?.repeat, repeat);
  assert.equal(updated?.project, "Work");
  assert.deepEqual(updated?.labels, ["urgent"]);
  assert.deepEqual(updated?.attachments, ["_belki_files/Attachments/a/file.png"]);
  assert.equal(updated?.description, "Keep me");
  assert.equal(updated?.priority, "P1");
  assert.equal(untouched, original[1]);
  assert.equal(original[0].due, "2026-07-14");
});

test("bulk due-date update plan ignores tasks outside the affected id set", () => {
  const original = [
    task("visible", { due: "2026-07-14" }),
    task("calendar-events-are-not-tasks", { due: "2026-07-14" })
  ];
  const plan = createTaskDueDateUpdatePlan(original, ["visible"], "2026-07-15");

  assert.equal(plan.tasks[0].due, "2026-07-15");
  assert.equal(plan.tasks[1], original[1]);
});

function task(id: string, overrides: Partial<BelkiTask> = {}): BelkiTask {
  return {
    id,
    title: id,
    completed: false,
    created: "2026-07-01",
    priority: "P4",
    labels: [],
    attachments: [],
    extraProperties: [],
    order: 0,
    sourcePath: "_belki_files/Data/2026-07.md",
    ...overrides
  };
}
