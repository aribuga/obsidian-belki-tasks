import { test } from "node:test";
import * as assert from "node:assert/strict";
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
    "This task contains 1 sub-task. The task cannot be restored from Belki after deletion."
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
    "This task contains 2 sub-tasks. The task cannot be restored from Belki after deletion."
  );
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
    ...overrides
  };
}
