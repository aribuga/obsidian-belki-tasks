import { test } from "node:test";
import * as assert from "node:assert/strict";
import {
  QUICK_ADD_TASK_COMMAND_ID,
  QUICK_ADD_TASK_COMMAND_NAME,
  QUICK_ADD_TASK_HOTKEYS,
  resolveQuickAddCommandTarget
} from "../src/quickAddCommand";

test("quick add command keeps the expected id, name, and default hotkey", () => {
  assert.equal(QUICK_ADD_TASK_COMMAND_ID, "quick-add-task");
  assert.equal(QUICK_ADD_TASK_COMMAND_NAME, "Quick Add Task");
  assert.deepEqual(QUICK_ADD_TASK_HOTKEYS, [
    {
      modifiers: ["Mod", "Shift"],
      key: "A"
    }
  ]);
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
