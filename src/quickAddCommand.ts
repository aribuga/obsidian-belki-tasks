import type { Hotkey, Modifier } from "obsidian";

export const QUICK_ADD_TASK_COMMAND_ID = "quick-add-task";
export const QUICK_ADD_TASK_COMMAND_FULL_ID = `belki:${QUICK_ADD_TASK_COMMAND_ID}`;
export const QUICK_ADD_TASK_COMMAND_NAME = "Quick Add Task";
export const QUICK_ADD_TASK_HOTKEYS: Hotkey[] = [
  {
    modifiers: ["Mod", "Shift"],
    key: "A"
  }
];

export type QuickAddCommandTarget = "contextual-composer" | "quick-add-modal";

type HotkeyManagerLike = {
  customKeys?: Record<string, Hotkey[] | null | undefined>;
  getDefaultHotkeys?: (commandId: string) => Hotkey[] | null | undefined;
  getHotkeys?: (commandId: string) => Hotkey[] | null | undefined;
};

const QUICK_ADD_TASK_COMMAND_LOOKUP_IDS = [
  QUICK_ADD_TASK_COMMAND_FULL_ID,
  QUICK_ADD_TASK_COMMAND_ID
];

const MAC_MODIFIER_LABELS: Record<Modifier, string> = {
  Mod: "\u2318",
  Ctrl: "\u2303",
  Meta: "\u2318",
  Shift: "\u21E7",
  Alt: "\u2325"
};

const DESKTOP_MODIFIER_LABELS: Record<Modifier, string> = {
  Mod: "Ctrl",
  Ctrl: "Ctrl",
  Meta: "Meta",
  Shift: "\u21E7",
  Alt: "Alt"
};

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

export function getQuickAddTaskHotkeyHint(
  app: unknown,
  isMacOS: boolean
): string | undefined {
  const [hotkey] = resolveQuickAddTaskHotkeys(app);
  return hotkey ? formatHotkeyForPlatform(hotkey, isMacOS) : undefined;
}

export function resolveQuickAddTaskHotkeys(app: unknown): Hotkey[] {
  const manager = getHotkeyManager(app);
  if (!manager) {
    return QUICK_ADD_TASK_HOTKEYS;
  }

  const assignedHotkeys = readHotkeysFromGetter(manager.getHotkeys);
  if (assignedHotkeys !== null) {
    return assignedHotkeys;
  }

  const customHotkeys = readHotkeysFromCustomKeys(manager.customKeys);
  if (customHotkeys !== null) {
    return customHotkeys;
  }

  const defaultHotkeys = readHotkeysFromGetter(manager.getDefaultHotkeys);
  if (defaultHotkeys !== null) {
    return defaultHotkeys;
  }

  return QUICK_ADD_TASK_HOTKEYS;
}

export function formatHotkeyForPlatform(
  hotkey: Hotkey,
  isMacOS: boolean
): string {
  const modifierLabels = (hotkey.modifiers ?? [])
    .map((modifier) => formatModifier(modifier, isMacOS))
    .filter((label) => label.length > 0);
  const keyLabel = formatHotkeyKey(hotkey.key);
  const parts = [...modifierLabels, keyLabel].filter((label) => label.length > 0);

  return isMacOS ? parts.join("") : parts.join(" ");
}

function readHotkeysFromGetter(
  getter: HotkeyManagerLike["getHotkeys"] | HotkeyManagerLike["getDefaultHotkeys"]
): Hotkey[] | null {
  if (typeof getter !== "function") {
    return null;
  }

  let sawHotkeyArray = false;
  for (const commandId of QUICK_ADD_TASK_COMMAND_LOOKUP_IDS) {
    try {
      const hotkeys = getter(commandId);
      if (Array.isArray(hotkeys)) {
        sawHotkeyArray = true;
        const normalizedHotkeys = normalizeHotkeys(hotkeys);
        if (normalizedHotkeys.length > 0) {
          return normalizedHotkeys;
        }
      }
    } catch {
      continue;
    }
  }

  return sawHotkeyArray ? [] : null;
}

function getHotkeyManager(source: unknown): HotkeyManagerLike | null {
  if (!source || typeof source !== "object") {
    return null;
  }

  const candidate = (source as { hotkeyManager?: unknown }).hotkeyManager;
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  return candidate;
}

function readHotkeysFromCustomKeys(
  customKeys: HotkeyManagerLike["customKeys"]
): Hotkey[] | null {
  if (!customKeys) {
    return null;
  }

  for (const commandId of QUICK_ADD_TASK_COMMAND_LOOKUP_IDS) {
    if (Object.prototype.hasOwnProperty.call(customKeys, commandId)) {
      return normalizeHotkeys(customKeys[commandId]);
    }
  }

  return null;
}

function normalizeHotkeys(hotkeys: Hotkey[] | null | undefined): Hotkey[] {
  if (!Array.isArray(hotkeys)) {
    return [];
  }

  return hotkeys.filter(
    (hotkey) =>
      Boolean(hotkey) &&
      typeof hotkey.key === "string" &&
      formatHotkeyKey(hotkey.key).length > 0
  );
}

function formatModifier(modifier: Modifier, isMacOS: boolean): string {
  return isMacOS ? MAC_MODIFIER_LABELS[modifier] : DESKTOP_MODIFIER_LABELS[modifier];
}

function formatHotkeyKey(key: string): string {
  if (key === " " || key.toLowerCase() === "space") {
    return "Space";
  }

  const trimmed = key.trim();
  if (!trimmed) {
    return "";
  }

  const lower = trimmed.toLowerCase();
  if (lower === "arrowup") {
    return "\u2191";
  }
  if (lower === "arrowdown") {
    return "\u2193";
  }
  if (lower === "arrowleft") {
    return "\u2190";
  }
  if (lower === "arrowright") {
    return "\u2192";
  }
  if (trimmed.length === 1) {
    return trimmed.toUpperCase();
  }

  return trimmed;
}
