import type { BelkiTask } from "../../types";

export function getDirectSubTaskCount(task: BelkiTask, tasks: BelkiTask[]): number {
  return tasks.filter((candidate) => candidate.parentId === task.id).length;
}

export function taskDeleteConfirmationDescription(subTaskCount: number): string {
  if (subTaskCount > 0) {
    return `This task has ${subTaskCount} sub-task${subTaskCount === 1 ? "" : "s"}. Delete only this task, or delete it together with ${subTaskCount === 1 ? "its sub-task" : "its sub-tasks"}?`;
  }

  return "This task will be permanently deleted from Belki. This action cannot be undone within the plugin.";
}
