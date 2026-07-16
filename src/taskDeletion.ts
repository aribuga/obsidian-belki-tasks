import type { BelkiTask } from "./types";

export interface CreateDeleteTaskPlanOptions {
  includeSubtasks?: boolean;
  sourcePathForTask?: (task: BelkiTask) => string | undefined;
}

export interface DeleteTaskPlan {
  tasks: BelkiTask[];
  deletedTaskIds: string[];
  promotedSubTaskIds: string[];
  changedSourcePaths: string[];
}

export function createDeleteTaskPlan(
  tasks: BelkiTask[],
  taskId: string,
  options: CreateDeleteTaskPlanOptions = {}
): DeleteTaskPlan | undefined {
  const orderedTasks = [...tasks].sort((a, b) => a.order - b.order);
  const task = orderedTasks.find((candidate) => candidate.id === taskId);
  if (!task) {
    return undefined;
  }

  const directSubTasks = orderedTasks.filter((candidate) => candidate.parentId === task.id);
  const deletedTaskIds = new Set([task.id]);
  if (options.includeSubtasks) {
    for (const subTask of directSubTasks) {
      deletedTaskIds.add(subTask.id);
    }
  }

  const promotedSubTaskIds = options.includeSubtasks
    ? []
    : directSubTasks.map((subTask) => subTask.id);

  const affectedTasks = orderedTasks.filter(
    (candidate) => deletedTaskIds.has(candidate.id) || promotedSubTaskIds.includes(candidate.id)
  );
  const nextTasks = orderedTasks
    .filter((candidate) => !deletedTaskIds.has(candidate.id))
    .map((candidate) =>
      promotedSubTaskIds.includes(candidate.id)
        ? { ...candidate, parentId: undefined }
        : candidate
    )
    .map((candidate, order) => ({ ...candidate, order }));

  return {
    tasks: nextTasks,
    deletedTaskIds: [...deletedTaskIds],
    promotedSubTaskIds,
    changedSourcePaths: [
      ...new Set(
        affectedTasks
          .map((candidate) =>
            options.sourcePathForTask
              ? options.sourcePathForTask(candidate)
              : candidate.sourcePath
          )
          .filter(Boolean) as string[]
      )
    ]
  };
}
