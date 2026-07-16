import type { DuplicateTaskAttachmentCopyPlan } from "./taskDuplication";
import type { BelkiTask } from "./types";

export interface CopyDuplicateTaskAttachmentsOptions {
  tasks: BelkiTask[];
  attachmentCopyPlans: DuplicateTaskAttachmentCopyPlan[];
  copyAttachment: (duplicateTaskId: string, attachmentPath: string) => Promise<string>;
  cleanupAttachment?: (attachmentPath: string) => Promise<void>;
}

export interface CopyDuplicateTaskAttachmentsResult {
  tasks: BelkiTask[];
  copiedAttachmentPaths: string[];
}

export async function copyDuplicateTaskAttachments(
  options: CopyDuplicateTaskAttachmentsOptions
): Promise<CopyDuplicateTaskAttachmentsResult> {
  const copiedAttachmentPaths: string[] = [];
  const attachmentsByTaskId = new Map<string, string[]>();

  try {
    for (const plan of options.attachmentCopyPlans) {
      const copiedForTask: string[] = [];
      for (const attachmentPath of plan.attachmentPaths) {
        const copiedPath = await options.copyAttachment(plan.duplicateTaskId, attachmentPath);
        copiedAttachmentPaths.push(copiedPath);
        copiedForTask.push(copiedPath);
      }
      attachmentsByTaskId.set(plan.duplicateTaskId, copiedForTask);
    }
  } catch (error) {
    await cleanupCopiedDuplicateAttachments(copiedAttachmentPaths, options.cleanupAttachment);
    throw error;
  }

  return {
    copiedAttachmentPaths,
    tasks: applyCopiedAttachments(options.tasks, attachmentsByTaskId)
  };
}

export async function cleanupCopiedDuplicateAttachments(
  attachmentPaths: string[],
  cleanupAttachment: ((attachmentPath: string) => Promise<void>) | undefined
): Promise<void> {
  if (!cleanupAttachment) {
    return;
  }

  for (const attachmentPath of [...attachmentPaths].reverse()) {
    try {
      await cleanupAttachment(attachmentPath);
    } catch (error) {
      console.warn("[belki] Failed to clean up copied duplicate attachment.", error, {
        attachmentPath
      });
    }
  }
}

function applyCopiedAttachments(
  tasks: BelkiTask[],
  attachmentsByTaskId: Map<string, string[]>
): BelkiTask[] {
  return tasks.map((task) => {
    const copiedAttachments = attachmentsByTaskId.get(task.id);
    if (!copiedAttachments) {
      return task;
    }

    return {
      ...task,
      attachments: copiedAttachments
    };
  });
}
