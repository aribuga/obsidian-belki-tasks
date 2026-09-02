import type { BelkiTask } from "../../types";
import { t } from "../../i18n";

export function getDirectSubTaskCount(task: BelkiTask, tasks: BelkiTask[]): number {
  return tasks.filter((candidate) => candidate.parentId === task.id).length;
}

export function taskDeleteConfirmationDescription(subTaskCount: number): string {
  if (subTaskCount > 0) {
    return t(subTaskCount === 1 ? "modal.deleteTaskWithSubtasksDesc" : "modal.deleteTaskWithSubtasksDescPlural", { count: subTaskCount });
  }

  return t("modal.deleteTaskDesc");
}
