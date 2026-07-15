import type { BelkiTask } from "../../types";

export function getDirectSubTaskCount(task: BelkiTask, tasks: BelkiTask[]): number {
  return tasks.filter((candidate) => candidate.parentId === task.id).length;
}

export function taskDeleteConfirmationDescription(subTaskCount: number): string {
  if (subTaskCount > 0) {
    return `This task contains ${subTaskCount} sub-task${subTaskCount === 1 ? "" : "s"}. The task cannot be restored from Belki after deletion.`;
  }

  return "This task will be permanently deleted from Belki. This action cannot be undone within the plugin.";
}
