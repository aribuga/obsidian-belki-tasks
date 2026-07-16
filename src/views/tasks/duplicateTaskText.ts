import type { BelkiTask } from "../../types";

export function getDirectSubTasks(task: BelkiTask, tasks: BelkiTask[]): BelkiTask[] {
  return tasks
    .filter((candidate) => candidate.parentId === task.id)
    .sort((a, b) => a.order - b.order);
}

export function getDirectSubTaskCount(task: BelkiTask, tasks: BelkiTask[]): number {
  return getDirectSubTasks(task, tasks).length;
}

export function duplicateTaskModalDescription(subTaskCount: number): string {
  if (subTaskCount === 1) {
    return "This task has 1 sub-task. Would you like to include it in the duplicate?";
  }

  return `This task has ${subTaskCount} sub-tasks. Would you like to include them in the duplicate?`;
}
