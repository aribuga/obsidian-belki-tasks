import type { BoardViewMode } from "../../types";

export interface AddTaskComposerContext {
  defaultProject: string;
  defaultDue?: string;
}

export interface AddTaskComposerContextOptions {
  mode: BoardViewMode;
  selectedProject: string | null;
  today: string;
  tomorrow: string;
}

export interface AddTaskComposerContextOverride {
  defaultProject?: string | null;
  defaultDue?: string | null;
}

export function getBaseAddTaskComposerContext(
  options: AddTaskComposerContextOptions
): AddTaskComposerContext {
  const defaultProject =
    options.mode === "projects" ? options.selectedProject || "" : "";

  if (options.mode === "today") {
    return { defaultProject, defaultDue: options.today };
  }

  if (options.mode === "upcoming") {
    return { defaultProject, defaultDue: options.tomorrow };
  }

  return { defaultProject };
}

export function resolveAddTaskComposerContext(
  base: AddTaskComposerContext,
  override: AddTaskComposerContextOverride = {}
): AddTaskComposerContext {
  const defaultProject =
    override.defaultProject !== undefined
      ? override.defaultProject || ""
      : base.defaultProject;
  const defaultDue =
    override.defaultDue !== undefined ? override.defaultDue || undefined : base.defaultDue;

  return defaultDue ? { defaultProject, defaultDue } : { defaultProject };
}

export function shouldUseDesktopFloatingTaskComposer(isMobile: boolean): boolean {
  return !isMobile;
}
