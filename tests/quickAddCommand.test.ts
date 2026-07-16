import { test } from "node:test";
import * as assert from "node:assert/strict";
import {
  QUICK_ADD_TASK_COMMAND_ID,
  QUICK_ADD_TASK_COMMAND_FULL_ID,
  QUICK_ADD_TASK_COMMAND_NAME,
  QUICK_ADD_TASK_HOTKEYS,
  formatHotkeyForPlatform,
  getQuickAddTaskHotkeyHint,
  resolveQuickAddTaskHotkeys,
  resolveQuickAddCommandTarget
} from "../src/quickAddCommand";

test("quick add command keeps the expected id, name, and default hotkey", () => {
  assert.equal(QUICK_ADD_TASK_COMMAND_ID, "quick-add-task");
  assert.equal(QUICK_ADD_TASK_COMMAND_FULL_ID, "belki:quick-add-task");
  assert.equal(QUICK_ADD_TASK_COMMAND_NAME, "Quick Add Task");
  assert.deepEqual(QUICK_ADD_TASK_HOTKEYS, [
    {
      modifiers: ["Mod", "Shift"],
      key: "A"
    }
  ]);
});

test("quick add hotkey formatter uses compact mac symbols", () => {
  assert.equal(
    formatHotkeyForPlatform({ modifiers: ["Mod", "Shift"], key: "A" }, true),
    "⌘⇧A"
  );
});

test("quick add hotkey formatter uses native desktop labels outside macOS", () => {
  assert.equal(
    formatHotkeyForPlatform({ modifiers: ["Mod", "Shift"], key: "A" }, false),
    "Ctrl ⇧ A"
  );
});

test("quick add hotkey hint resolves custom assigned hotkeys from the full command id", () => {
  const app = {
    hotkeyManager: {
      getHotkeys: (commandId: string) =>
        commandId === QUICK_ADD_TASK_COMMAND_FULL_ID
          ? [{ modifiers: ["Alt"], key: "k" }]
          : []
    }
  };

  assert.equal(getQuickAddTaskHotkeyHint(app, false), "Alt K");
});

test("quick add hotkey hint can fall back to the local command id", () => {
  const app = {
    hotkeyManager: {
      getHotkeys: (commandId: string) =>
        commandId === QUICK_ADD_TASK_COMMAND_ID
          ? [{ modifiers: ["Ctrl"], key: "j" }]
          : []
    }
  };

  assert.equal(getQuickAddTaskHotkeyHint(app, false), "Ctrl J");
});

test("quick add hotkey hint hides when the assigned hotkey list is empty", () => {
  const app = {
    hotkeyManager: {
      getHotkeys: () => []
    }
  };

  assert.equal(getQuickAddTaskHotkeyHint(app, false), undefined);
});

test("quick add hotkey resolver falls back to customKeys when getter is unavailable", () => {
  const app = {
    hotkeyManager: {
      customKeys: {
        [QUICK_ADD_TASK_COMMAND_FULL_ID]: [{ modifiers: ["Ctrl"], key: "Enter" }]
      }
    }
  };

  assert.deepEqual(resolveQuickAddTaskHotkeys(app), [
    { modifiers: ["Ctrl"], key: "Enter" }
  ]);
});

test("quick add hotkey hint falls back to the default hotkey without a hotkey manager", () => {
  assert.equal(getQuickAddTaskHotkeyHint({}, true), "⌘⇧A");
});

test("quick add command opens the contextual composer for the active task board view", () => {
  const taskBoardView = { kind: "belki" };

  assert.equal(
    resolveQuickAddCommandTarget({
      activeView: taskBoardView,
      isMobile: false,
      isTaskBoardView: (view) => view === taskBoardView
    }),
    "contextual-composer"
  );
});

test("quick add command opens the global modal for normal Obsidian views", () => {
  const taskBoardView = { kind: "belki" };
  const markdownView = { kind: "markdown" };

  assert.equal(
    resolveQuickAddCommandTarget({
      activeView: markdownView,
      isMobile: false,
      isTaskBoardView: (view) => view === taskBoardView
    }),
    "quick-add-modal"
  );
});

test("quick add command opens the global modal when no active leaf exists", () => {
  assert.equal(
    resolveQuickAddCommandTarget({
      activeView: null,
      isMobile: false,
      isTaskBoardView: () => true
    }),
    "quick-add-modal"
  );
});

test("inactive task board views do not affect the quick add command target", () => {
  const backgroundTaskBoardView = { kind: "belki" };
  const activeMarkdownView = { kind: "markdown" };

  assert.equal(
    resolveQuickAddCommandTarget({
      activeView: activeMarkdownView,
      isMobile: false,
      isTaskBoardView: (view) => view === backgroundTaskBoardView
    }),
    "quick-add-modal"
  );
});

test("quick add command keeps mobile on the global modal path", () => {
  const taskBoardView = { kind: "belki" };

  assert.equal(
    resolveQuickAddCommandTarget({
      activeView: taskBoardView,
      isMobile: true,
      isTaskBoardView: (view) => view === taskBoardView
    }),
    "quick-add-modal"
  );
});
