import { dedupeLabels } from "./labels";
import { normalizeTaskProject } from "./projects";
import type { BelkiTask } from "./types";

export interface CreateDuplicateTaskPlanOptions {
  includeSubtasks?: boolean;
  today: string;
  createId: () => string;
  sourcePathForDate: (date: string) => string;
}

export interface DuplicateTaskPlan {
  tasks: BelkiTask[];
  duplicatedParent: BelkiTask;
  duplicatedTasks: BelkiTask[];
  attachmentCopyPlans: DuplicateTaskAttachmentCopyPlan[];
  changedSourcePaths: string[];
}

export interface DuplicateTaskAttachmentCopyPlan {
  originalTaskId: string;
  duplicateTaskId: string;
  attachmentPaths: string[];
}

export function createDuplicateTaskPlan(
  tasks: BelkiTask[],
  taskId: string,
  options: CreateDuplicateTaskPlanOptions
): DuplicateTaskPlan | undefined {
  const orderedTasks = [...tasks].sort((a, b) => a.order - b.order);
  const originalIndex = orderedTasks.findIndex((task) => task.id === taskId);
  if (originalIndex === -1) {
    return undefined;
  }

  const original = orderedTasks[originalIndex];
  const created = options.today;
  const sourcePath = options.sourcePathForDate(created);
  const existingIds = new Set(orderedTasks.map((task) => task.id));
  const nextId = () => uniqueTaskId(options.createId, existingIds);
  const parentId = nextId();

  const duplicatedParent = duplicateTaskFields(original, {
    id: parentId,
    created,
    sourcePath
  });

  const directSubtasks = options.includeSubtasks
    ? orderedTasks
        .filter((task) => task.parentId === original.id)
        .sort((a, b) => a.order - b.order)
    : [];
  const duplicatedSubtasks = directSubtasks.map((subtask) =>
    duplicateTaskFields(subtask, {
      id: nextId(),
      created,
      parentId,
      sourcePath
    })
  );

  const duplicatedTasks = [duplicatedParent, ...duplicatedSubtasks];
  const nextTasks = [
    ...orderedTasks.slice(0, originalIndex + 1),
    ...duplicatedTasks,
    ...orderedTasks.slice(originalIndex + 1)
  ].map((task, order) => ({ ...task, order }));

  return {
    tasks: nextTasks,
    duplicatedParent: { ...duplicatedParent, order: originalIndex + 1 },
    duplicatedTasks: duplicatedTasks.map((task, index) => ({
      ...task,
      order: originalIndex + 1 + index
    })),
    attachmentCopyPlans: duplicateAttachmentsForTasks([original, ...directSubtasks], duplicatedTasks),
    changedSourcePaths: [...new Set(duplicatedTasks.map((task) => task.sourcePath).filter(Boolean) as string[])]
  };
}

function duplicateTaskFields(
  task: BelkiTask,
  overrides: {
    id: string;
    created: string;
    parentId?: string;
    sourcePath: string;
  }
): BelkiTask {
  return {
    id: overrides.id,
    title: task.title,
    completed: false,
    completedDate: undefined,
    created: overrides.created,
    due: task.due,
    deadline: task.deadline,
    project: normalizeTaskProject(task.project),
    priority: task.priority || "P4",
    description: task.description,
    labels: dedupeLabels(task.labels),
    attachments: [],
    repeat: undefined,
    completedOccurrences: undefined,
    parentId: overrides.parentId,
    extraProperties: [],
    order: task.order,
    sourcePath: overrides.sourcePath
  };
}

function duplicateAttachmentsForTasks(
  originals: BelkiTask[],
  duplicates: BelkiTask[]
): DuplicateTaskAttachmentCopyPlan[] {
  return originals
    .map((original, index) => ({
      originalTaskId: original.id,
      duplicateTaskId: duplicates[index]?.id || "",
      attachmentPaths: [...original.attachments]
    }))
    .filter((plan) => plan.duplicateTaskId && plan.attachmentPaths.length > 0);
}

function uniqueTaskId(createId: () => string, existingIds: Set<string>): string {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const id = createId();
    if (!existingIds.has(id)) {
      existingIds.add(id);
      return id;
    }
  }

  throw new Error("belki could not create a unique duplicate task id.");
}
