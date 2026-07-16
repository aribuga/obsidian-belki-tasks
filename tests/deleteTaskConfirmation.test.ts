import { test } from "node:test";
import * as assert from "node:assert/strict";
import { createDeleteTaskPlan } from "../src/taskDeletion";
import {
  getDirectSubTaskCount,
  taskDeleteConfirmationDescription
} from "../src/views/tasks/deleteTaskConfirmationText";
import type { BelkiTask } from "../src/types";

test("task delete confirmation copy handles tasks without sub-tasks", () => {
  assert.equal(getDirectSubTaskCount(task("parent"), [task("parent")]), 0);
  assert.equal(
    taskDeleteConfirmationDescription(0),
    "This task will be permanently deleted from Belki. This action cannot be undone within the plugin."
  );
});

test("task delete confirmation copy handles one direct sub-task", () => {
  const parent = task("parent");
  const tasks = [parent, task("child", { parentId: "parent" })];

  assert.equal(getDirectSubTaskCount(parent, tasks), 1);
  assert.equal(
    taskDeleteConfirmationDescription(1),
    "This task has 1 sub-task. Delete only this task, or delete it together with its sub-task?"
  );
});

test("task delete confirmation copy handles multiple direct sub-tasks", () => {
  const parent = task("parent");
  const tasks = [
    parent,
    task("child-a", { parentId: "parent" }),
    task("child-b", { parentId: "parent" }),
    task("grandchild", { parentId: "child-a" })
  ];

  assert.equal(getDirectSubTaskCount(parent, tasks), 2);
  assert.equal(
    taskDeleteConfirmationDescription(2),
    "This task has 2 sub-tasks. Delete only this task, or delete it together with its sub-tasks?"
  );
});

test("deleting task only promotes direct sub-tasks to top-level tasks", () => {
  const tasks = [
    task("parent", { order: 0, sourcePath: "_belki_files/Data/2026-07.md" }),
    task("child-a", { parentId: "parent", order: 1, sourcePath: "_belki_files/Data/2026-07.md" }),
    task("child-b", { parentId: "parent", order: 2, sourcePath: "_belki_files/Data/2026-08.md" }),
    task("after", { order: 3, sourcePath: "_belki_files/Data/2026-08.md" })
  ];

  const plan = createDeleteTaskPlan(tasks, "parent");
  assert.ok(plan);
  assert.deepEqual(plan.deletedTaskIds, ["parent"]);
  assert.deepEqual(plan.promotedSubTaskIds, ["child-a", "child-b"]);
  assert.deepEqual(plan.tasks.map((candidate) => candidate.id), ["child-a", "child-b", "after"]);
  assert.equal(plan.tasks.find((candidate) => candidate.id === "child-a")?.parentId, undefined);
  assert.equal(plan.tasks.find((candidate) => candidate.id === "child-b")?.parentId, undefined);
  assert.deepEqual(plan.tasks.map((candidate) => candidate.order), [0, 1, 2]);
  assert.deepEqual(plan.changedSourcePaths, [
    "_belki_files/Data/2026-07.md",
    "_belki_files/Data/2026-08.md"
  ]);
});

test("deleting with sub-tasks removes direct sub-tasks but not nested descendants", () => {
  const tasks = [
    task("parent", { order: 0 }),
    task("child-a", { parentId: "parent", order: 1 }),
    task("child-b", { parentId: "parent", order: 2 }),
    task("grandchild", { parentId: "child-a", order: 3 })
  ];

  const plan = createDeleteTaskPlan(tasks, "parent", { includeSubtasks: true });
  assert.ok(plan);
  assert.deepEqual(plan.deletedTaskIds, ["parent", "child-a", "child-b"]);
  assert.deepEqual(plan.promotedSubTaskIds, []);
  assert.deepEqual(plan.tasks.map((candidate) => candidate.id), ["grandchild"]);
  assert.equal(plan.tasks[0].parentId, "child-a");
  assert.equal(plan.tasks[0].order, 0);
});

test("delete task plan returns undefined for missing tasks", () => {
  assert.equal(createDeleteTaskPlan([task("existing")], "missing"), undefined);
});

function task(id: string, overrides: Partial<BelkiTask> = {}): BelkiTask {
  return {
    id,
    title: id,
    completed: false,
    priority: "P4",
    labels: [],
    attachments: [],
    extraProperties: [],
    order: 0,
    sourcePath: "_belki_files/Data/2026-07.md",
    ...overrides
  };
}
