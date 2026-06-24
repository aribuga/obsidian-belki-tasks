export const INBOX_VIEW_NAME = "Inbox";

export function cleanProjectName(value: string | undefined | null): string {
  return (value || "").trim().replace(/^>+\s*/, "");
}

export function isReservedInboxProject(value: string | undefined | null): boolean {
  return cleanProjectName(value).toLowerCase() === "inbox";
}

export function normalizeTaskProject(
  value: string | undefined | null
): string | undefined {
  const project = cleanProjectName(value);
  if (!project || isReservedInboxProject(project)) {
    return undefined;
  }

  return project;
}

export function projectDisplayName(value: string | undefined | null): string {
  return normalizeTaskProject(value) || INBOX_VIEW_NAME;
}

export function uniqueRealProjects(
  projects: Array<string | undefined | null>
): string[] {
  return [...new Set(projects.map(normalizeTaskProject).filter(Boolean) as string[])]
    .sort((a, b) => a.localeCompare(b));
}
