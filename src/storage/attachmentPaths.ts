import { normalizePath } from "obsidian";

interface AttachmentFilenameParts {
  safeName: string;
  base: string;
  extension: string;
}

export function sanitizeAttachmentFilename(filename: string): string {
  const clean = filename.replace(/[\\/:*?"<>|]/g, "-").trim();
  return clean || "attachment";
}

export function splitAttachmentFilename(filename: string): AttachmentFilenameParts {
  const safeName = sanitizeAttachmentFilename(filename);
  const extensionStart = safeName.lastIndexOf(".");
  const base =
    extensionStart > 0 ? safeName.slice(0, extensionStart) : safeName;
  const extension = extensionStart > 0 ? safeName.slice(extensionStart) : "";
  return { safeName, base, extension };
}

export function attachmentPathCandidate(
  folderPath: string,
  filename: string
): string {
  return normalizePath(`${folderPath}/${sanitizeAttachmentFilename(filename)}`);
}

export function numberedAttachmentPathCandidate(
  folderPath: string,
  base: string,
  index: number,
  extension: string
): string {
  return normalizePath(`${folderPath}/${base}-${index}${extension}`);
}

export function retryAttachmentFilename(
  parts: Pick<AttachmentFilenameParts, "base" | "extension">,
  attempt: number,
  timestamp: number
): string {
  return `${parts.base}-${timestamp}-${attempt}${parts.extension}`;
}
