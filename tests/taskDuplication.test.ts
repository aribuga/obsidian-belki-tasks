import { test } from "node:test";
import * as assert from "node:assert/strict";
import { copyDuplicateTaskAttachments } from "../src/taskAttachmentDuplication";
import { createDuplicateTaskPlan } from "../src/taskDuplication";
import type { BelkiTask, RepeatRule } from "../src/types";
import {
  duplicateTaskModalDescription,
  getDirectSubTaskCount
} from "../src/views/tasks/duplicateTaskText";

const TODAY = "2026-07-16";
const SOURCE_PATH = "_belki_files/Data/2026-07.md";

test("duplicating a task creates an independent uncompleted copy with a fresh id", () => {
  const repeat: RepeatRule = {
    frequency: "weekly",
    interval: 1,
    mode: "scheduledDate",
    weekday: 4,
    ends: "never"
  };
  const original = task("original", {
    title: "Prepare launch notes",
    completed: true,
    completedDate: "2026-07-15",
    created: "2026-07-01",
    due: "2026-07-20",
    deadline: "2026-07-22",
    project: "Belki Dev",
    priority: "P1",
    description: "Keep the editable fields.",
    labels: ["release", "qa"],
    attachments: ["_belki_files/Attachments/original/file.png"],
    repeat,
    completedOccurrences: ["2026-07-08"],
    extraProperties: [{ name: "custom", value: "internal" }],
    order: 0
  });

  const plan = createDuplicateTaskPlan([original], "original", options(["original", "duplicate"]));
  assert.ok(plan);
  const duplicate = plan.duplicatedParent;

  assert.equal(duplicate.id, "duplicate");
  assert.equal(duplicate.created, TODAY);
  assert.equal(duplicate.completed, false);
  assert.equal(duplicate.completedDate, undefined);
  assert.equal(duplicate.completedOccurrences, undefined);
  assert.equal(duplicate.repeat, undefined);
  assert.deepEqual(duplicate.extraProperties, []);
  assert.deepEqual(duplicate.attachments, []);
  assert.deepEqual(plan.attachmentCopyPlans, [
    {
      originalTaskId: "original",
      duplicateTaskId: "duplicate",
      attachmentPaths: ["_belki_files/Attachments/original/file.png"]
    }
  ]);

  assert.equal(duplicate.title, original.title);
  assert.equal(duplicate.description, original.description);
  assert.equal(duplicate.project, original.project);
  assert.equal(duplicate.priority, original.priority);
  assert.equal(duplicate.due, original.due);
  assert.equal(duplicate.deadline, original.deadline);
  assert.deepEqual(duplicate.labels, original.labels);
  assert.equal(duplicate.sourcePath, SOURCE_PATH);

  assert.equal(original.completed, true);
  assert.deepEqual(original.attachments, ["_belki_files/Attachments/original/file.png"]);
  assert.equal(original.repeat, repeat);
});

test("duplicate is inserted after the original in natural order", () => {
  const originalTasks = [
    task("before", { order: 0 }),
    task("original", { order: 1 }),
    task("after", { order: 2 })
  ];

  const plan = createDuplicateTaskPlan(originalTasks, "original", options(["duplicate"]));
  assert.ok(plan);

  assert.deepEqual(plan.tasks.map((candidate) => candidate.id), [
    "before",
    "original",
    "duplicate",
    "after"
  ]);
  assert.deepEqual(plan.tasks.map((candidate) => candidate.order), [0, 1, 2, 3]);
});

test("includeSubtasks false does not copy direct sub-tasks", () => {
  const originalTasks = [
    task("parent", { order: 0 }),
    task("child", { parentId: "parent", order: 1 })
  ];

  const plan = createDuplicateTaskPlan(
    originalTasks,
    "parent",
    options(["duplicate-parent"], { includeSubtasks: false })
  );
  assert.ok(plan);

  assert.deepEqual(plan.tasks.map((candidate) => candidate.id), [
    "parent",
    "duplicate-parent",
    "child"
  ]);
  assert.equal(plan.tasks.some((candidate) => candidate.parentId === "duplicate-parent"), false);
});

test("includeSubtasks true copies direct sub-tasks with fresh ids and the new parent id", () => {
  const originalTasks = [
    task("parent", { order: 0 }),
    task("child-a", {
      parentId: "parent",
      completed: true,
      completedDate: "2026-07-10",
      completedOccurrences: ["2026-07-09"],
      attachments: ["attachment.png"],
      repeat: {
        frequency: "daily",
        interval: 1,
        mode: "scheduledDate",
        ends: "never"
      },
      title: "First child",
      description: "Copy me",
      project: "Client Work",
      priority: "P2",
      due: "2026-07-18",
      deadline: "2026-07-19",
      labels: ["client"],
      order: 1
    }),
    task("child-b", { parentId: "parent", title: "Second child", order: 2 }),
    task("grandchild", { parentId: "child-a", order: 3 })
  ];

  const plan = createDuplicateTaskPlan(
    originalTasks,
    "parent",
    options(["duplicate-parent", "duplicate-child-a", "duplicate-child-b"], {
      includeSubtasks: true
    })
  );
  assert.ok(plan);

  assert.deepEqual(plan.tasks.map((candidate) => candidate.id), [
    "parent",
    "duplicate-parent",
    "duplicate-child-a",
    "duplicate-child-b",
    "child-a",
    "child-b",
    "grandchild"
  ]);

  const duplicateChildren = plan.tasks.filter((candidate) => candidate.parentId === "duplicate-parent");
  assert.deepEqual(duplicateChildren.map((candidate) => candidate.id), [
    "duplicate-child-a",
    "duplicate-child-b"
  ]);
  assert.deepEqual(duplicateChildren.map((candidate) => candidate.title), [
    "First child",
    "Second child"
  ]);

  const firstChild = duplicateChildren[0];
  assert.equal(firstChild.completed, false);
  assert.equal(firstChild.completedDate, undefined);
  assert.equal(firstChild.completedOccurrences, undefined);
  assert.deepEqual(firstChild.attachments, []);
  assert.equal(firstChild.repeat, undefined);
  assert.equal(firstChild.description, "Copy me");
  assert.equal(firstChild.project, "Client Work");
  assert.equal(firstChild.priority, "P2");
  assert.equal(firstChild.due, "2026-07-18");
  assert.equal(firstChild.deadline, "2026-07-19");
  assert.deepEqual(firstChild.labels, ["client"]);
  assert.equal(plan.tasks.some((candidate) => candidate.id === "duplicate-grandchild"), false);
  assert.deepEqual(plan.attachmentCopyPlans, [
    {
      originalTaskId: "child-a",
      duplicateTaskId: "duplicate-child-a",
      attachmentPaths: ["attachment.png"]
    }
  ]);
});

test("copied duplicate attachments are assigned to the duplicated task only", async () => {
  const original = task("original", {
    attachments: [
      "_belki_files/Attachments/original/design.png",
      "_belki_files/Attachments/original/spec.pdf"
    ]
  });
  const plan = createDuplicateTaskPlan([original], "original", options(["duplicate"]));
  assert.ok(plan);

  const files = new Map<string, string>([
    ["_belki_files/Attachments/original/design.png", "image-data"],
    ["_belki_files/Attachments/original/spec.pdf", "pdf-data"]
  ]);
  const result = await copyDuplicateTaskAttachments({
    tasks: plan.tasks,
    attachmentCopyPlans: plan.attachmentCopyPlans,
    copyAttachment: async (duplicateTaskId, attachmentPath) =>
      copyFakeAttachment(files, duplicateTaskId, attachmentPath)
  });

  const duplicate = result.tasks.find((candidate) => candidate.id === "duplicate");
  assert.ok(duplicate);
  assert.equal(duplicate.attachments.length, 2);
  assert.notDeepEqual(duplicate.attachments, original.attachments);
  assert.deepEqual(duplicate.attachments, [
    "_belki_files/Attachments/duplicate/design.png",
    "_belki_files/Attachments/duplicate/spec.pdf"
  ]);
  assert.equal(files.get("_belki_files/Attachments/duplicate/design.png"), "image-data");
  assert.equal(files.get("_belki_files/Attachments/duplicate/spec.pdf"), "pdf-data");
  assert.equal(files.get("_belki_files/Attachments/original/design.png"), "image-data");
  assert.deepEqual(original.attachments, [
    "_belki_files/Attachments/original/design.png",
    "_belki_files/Attachments/original/spec.pdf"
  ]);
});

test("duplicate attachment filename collisions use the next available filename", async () => {
  const original = task("original", {
    attachments: ["_belki_files/Attachments/original/design.png"]
  });
  const plan = createDuplicateTaskPlan([original], "original", options(["duplicate"]));
  assert.ok(plan);

  const files = new Map<string, string>([
    ["_belki_files/Attachments/original/design.png", "new-copy"],
    ["_belki_files/Attachments/duplicate/design.png", "existing-file"]
  ]);
  const result = await copyDuplicateTaskAttachments({
    tasks: plan.tasks,
    attachmentCopyPlans: plan.attachmentCopyPlans,
    copyAttachment: async (duplicateTaskId, attachmentPath) =>
      copyFakeAttachment(files, duplicateTaskId, attachmentPath)
  });

  const duplicate = result.tasks.find((candidate) => candidate.id === "duplicate");
  assert.ok(duplicate);
  assert.deepEqual(duplicate.attachments, ["_belki_files/Attachments/duplicate/design-2.png"]);
  assert.equal(files.get("_belki_files/Attachments/duplicate/design.png"), "existing-file");
  assert.equal(files.get("_belki_files/Attachments/duplicate/design-2.png"), "new-copy");
});

test("task-only duplication copies parent attachments but not sub-task attachments", async () => {
  const originalTasks = [
    task("parent", {
      attachments: ["_belki_files/Attachments/parent/parent.pdf"],
      order: 0
    }),
    task("child", {
      parentId: "parent",
      attachments: ["_belki_files/Attachments/child/child.pdf"],
      order: 1
    })
  ];
  const plan = createDuplicateTaskPlan(
    originalTasks,
    "parent",
    options(["duplicate-parent"], { includeSubtasks: false })
  );
  assert.ok(plan);

  const files = new Map<string, string>([
    ["_belki_files/Attachments/parent/parent.pdf", "parent-data"],
    ["_belki_files/Attachments/child/child.pdf", "child-data"]
  ]);
  const result = await copyDuplicateTaskAttachments({
    tasks: plan.tasks,
    attachmentCopyPlans: plan.attachmentCopyPlans,
    copyAttachment: async (duplicateTaskId, attachmentPath) =>
      copyFakeAttachment(files, duplicateTaskId, attachmentPath)
  });

  const duplicateParent = result.tasks.find((candidate) => candidate.id === "duplicate-parent");
  assert.ok(duplicateParent);
  assert.deepEqual(duplicateParent.attachments, [
    "_belki_files/Attachments/duplicate-parent/parent.pdf"
  ]);
  assert.equal(result.tasks.some((candidate) => candidate.parentId === "duplicate-parent"), false);
  assert.equal(files.has("_belki_files/Attachments/duplicate-parent/child.pdf"), false);
});

test("including sub-tasks copies parent and sub-task attachments into their own directories", async () => {
  const originalTasks = [
    task("parent", {
      attachments: ["_belki_files/Attachments/parent/parent.pdf"],
      order: 0
    }),
    task("child", {
      parentId: "parent",
      attachments: ["_belki_files/Attachments/child/child.pdf"],
      order: 1
    })
  ];
  const plan = createDuplicateTaskPlan(
    originalTasks,
    "parent",
    options(["duplicate-parent", "duplicate-child"], { includeSubtasks: true })
  );
  assert.ok(plan);

  const files = new Map<string, string>([
    ["_belki_files/Attachments/parent/parent.pdf", "parent-data"],
    ["_belki_files/Attachments/child/child.pdf", "child-data"]
  ]);
  const result = await copyDuplicateTaskAttachments({
    tasks: plan.tasks,
    attachmentCopyPlans: plan.attachmentCopyPlans,
    copyAttachment: async (duplicateTaskId, attachmentPath) =>
      copyFakeAttachment(files, duplicateTaskId, attachmentPath)
  });

  const duplicateParent = result.tasks.find((candidate) => candidate.id === "duplicate-parent");
  const duplicateChild = result.tasks.find((candidate) => candidate.id === "duplicate-child");
  assert.ok(duplicateParent);
  assert.ok(duplicateChild);
  assert.deepEqual(duplicateParent.attachments, [
    "_belki_files/Attachments/duplicate-parent/parent.pdf"
  ]);
  assert.deepEqual(duplicateChild.attachments, [
    "_belki_files/Attachments/duplicate-child/child.pdf"
  ]);
  assert.equal(files.get("_belki_files/Attachments/duplicate-parent/parent.pdf"), "parent-data");
  assert.equal(files.get("_belki_files/Attachments/duplicate-child/child.pdf"), "child-data");
});

test("attachment copy failure cleans up copied files and does not return partial tasks", async () => {
  const original = task("original", {
    attachments: [
      "_belki_files/Attachments/original/first.png",
      "_belki_files/Attachments/original/fail.png"
    ]
  });
  const plan = createDuplicateTaskPlan([original], "original", options(["duplicate"]));
  assert.ok(plan);

  const files = new Map<string, string>([
    ["_belki_files/Attachments/original/first.png", "first-data"],
    ["_belki_files/Attachments/original/fail.png", "fail-data"]
  ]);
  const cleaned: string[] = [];
  await assert.rejects(
    () =>
      copyDuplicateTaskAttachments({
        tasks: plan.tasks,
        attachmentCopyPlans: plan.attachmentCopyPlans,
        copyAttachment: async (duplicateTaskId, attachmentPath) => {
          if (attachmentPath.endsWith("/fail.png")) {
            throw new Error("copy failed");
          }
          return copyFakeAttachment(files, duplicateTaskId, attachmentPath);
        },
        cleanupAttachment: async (attachmentPath) => {
          files.delete(attachmentPath);
          cleaned.push(attachmentPath);
        }
      }),
    /copy failed/
  );

  assert.deepEqual(cleaned, ["_belki_files/Attachments/duplicate/first.png"]);
  assert.equal(files.has("_belki_files/Attachments/duplicate/first.png"), false);
  assert.equal(files.get("_belki_files/Attachments/original/first.png"), "first-data");
  assert.equal(files.get("_belki_files/Attachments/original/fail.png"), "fail-data");
  assert.deepEqual(plan.tasks.find((candidate) => candidate.id === "duplicate")?.attachments, []);
});

test("tasks without attachments continue to duplicate normally", async () => {
  const plan = createDuplicateTaskPlan([task("original")], "original", options(["duplicate"]));
  assert.ok(plan);
  assert.deepEqual(plan.attachmentCopyPlans, []);

  const result = await copyDuplicateTaskAttachments({
    tasks: plan.tasks,
    attachmentCopyPlans: plan.attachmentCopyPlans,
    copyAttachment: async () => {
      throw new Error("should not copy");
    }
  });

  assert.deepEqual(result.copiedAttachmentPaths, []);
  assert.deepEqual(result.tasks.map((candidate) => candidate.id), ["original", "duplicate"]);
});

test("duplicate task plan skips colliding generated ids", () => {
  const plan = createDuplicateTaskPlan(
    [task("original")],
    "original",
    options(["original", "fresh-id"])
  );

  assert.ok(plan);
  assert.equal(plan.duplicatedParent.id, "fresh-id");
});

test("duplicate task modal copy and bypass count use direct sub-tasks only", () => {
  const parent = task("parent");
  const tasks = [
    parent,
    task("child", { parentId: "parent" }),
    task("grandchild", { parentId: "child" })
  ];

  assert.equal(getDirectSubTaskCount(parent, tasks), 1);
  assert.equal(getDirectSubTaskCount(task("solo"), tasks), 0);
  assert.equal(
    duplicateTaskModalDescription(1),
    "This task has 1 sub-task. Would you like to include it in the duplicate?"
  );
  assert.equal(
    duplicateTaskModalDescription(4),
    "This task has 4 sub-tasks. Would you like to include them in the duplicate?"
  );
});

function options(
  ids: string[],
  overrides: Partial<Parameters<typeof createDuplicateTaskPlan>[2]> = {}
): Parameters<typeof createDuplicateTaskPlan>[2] {
  let index = 0;
  return {
    today: TODAY,
    includeSubtasks: false,
    createId: () => ids[index++] || `generated-${index}`,
    sourcePathForDate: (date) => `_belki_files/Data/${date.slice(0, 7)}.md`,
    ...overrides
  };
}

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
    sourcePath: SOURCE_PATH,
    ...overrides
  };
}

function copyFakeAttachment(
  files: Map<string, string>,
  duplicateTaskId: string,
  attachmentPath: string
): string {
  const sourceContent = files.get(attachmentPath);
  if (!sourceContent) {
    throw new Error(`missing source attachment: ${attachmentPath}`);
  }

  const filename = attachmentPath.split("/").pop() || "attachment";
  const extensionStart = filename.lastIndexOf(".");
  const base = extensionStart > 0 ? filename.slice(0, extensionStart) : filename;
  const extension = extensionStart > 0 ? filename.slice(extensionStart) : "";
  let targetPath = `_belki_files/Attachments/${duplicateTaskId}/${filename}`;
  let index = 2;
  while (files.has(targetPath)) {
    targetPath = `_belki_files/Attachments/${duplicateTaskId}/${base}-${index}${extension}`;
    index += 1;
  }

  files.set(targetPath, sourceContent);
  return targetPath;
}
