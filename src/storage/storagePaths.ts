import { normalizePath } from "obsidian";
import { todayIso } from "../dateUtils";

export const MONTHLY_FILE_PATTERN = /^\d{4}-\d{2}\.md$/;

export function mainFilePathForRoot(rootDir: string): string {
  return normalizePath(`${rootDir}/main.md`);
}

export function dataDirForRoot(rootDir: string): string {
  return normalizePath(`${rootDir}/Data`);
}

export function attachmentsDirForRoot(rootDir: string): string {
  return normalizePath(`${rootDir}/Attachments`);
}

export function taskAttachmentFolderPath(
  attachmentsDir: string,
  taskId: string
): string {
  return normalizePath(`${attachmentsDir}/${taskId}`);
}

export function isMonthlyDataFileName(fileName: string): boolean {
  return MONTHLY_FILE_PATTERN.test(fileName);
}

export function isMonthlyDataFilePath(dataDir: string, path: string): boolean {
  const normalizedPath = normalizePath(path);
  const normalizedDataDir = normalizePath(dataDir);
  return (
    normalizedPath.startsWith(`${normalizedDataDir}/`) &&
    isMonthlyDataFileName(normalizedPath.split("/").pop() || "")
  );
}

export function monthlyDataFilePath(dataDir: string, value: string): string {
  const month = /^\d{4}-\d{2}/.test(value) ? value.slice(0, 7) : todayIso().slice(0, 7);
  return normalizePath(`${dataDir}/${month}.md`);
}

export function legacyBackupPathCandidate(path: string, index: number): string {
  const normalizedPath = normalizePath(path);
  const extensionStart = normalizedPath.lastIndexOf(".md");
  const base =
    extensionStart > -1 ? normalizedPath.slice(0, extensionStart) : normalizedPath;
  return index <= 1
    ? `${base}.migrated-backup.md`
    : `${base}.migrated-backup-${index}.md`;
}
