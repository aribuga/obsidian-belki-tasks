import type { Hotkey } from "obsidian";

export const QUICK_ADD_TASK_COMMAND_ID = "quick-add-task";
export const QUICK_ADD_TASK_COMMAND_NAME = "Quick Add Task";
export const QUICK_ADD_TASK_HOTKEYS: Hotkey[] = [
  {
    modifiers: ["Mod", "Shift"],
    key: "A"
  }
];

export type QuickAddCommandTarget = "contextual-composer" | "quick-add-modal";

interface ResolveQuickAddCommandTargetOptions<TView> {
  activeView: TView | null | undefined;
  isMobile: boolean;
  isTaskBoardView: (view: TView) => boolean;
}

export function resolveQuickAddCommandTarget<TView>(
  options: ResolveQuickAddCommandTargetOptions<TView>
): QuickAddCommandTarget {
  if (
    !options.isMobile &&
    options.activeView &&
    options.isTaskBoardView(options.activeView)
  ) {
    return "contextual-composer";
  }

  return "quick-add-modal";
}
