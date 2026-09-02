import type { BelkiTask } from "../../types";
import { t } from "../../i18n";

export function getDirectSubTasks(task: BelkiTask, tasks: BelkiTask[]): BelkiTask[] {
  return tasks
    .filter((candidate) => candidate.parentId === task.id)
    .sort((a, b) => a.order - b.order);
}

export function getDirectSubTaskCount(task: BelkiTask, tasks: BelkiTask[]): number {
  return getDirectSubTasks(task, tasks).length;
}

export function duplicateTaskModalDescription(subTaskCount: number): string {
  return t(subTaskCount === 1 ? "modal.duplicateTaskDesc" : "modal.duplicateTaskDescPlural", { count: subTaskCount });
}
