import { test } from "node:test";
import * as assert from "node:assert/strict";
import {
  getBaseAddTaskComposerContext,
  resolveAddTaskComposerContext,
  shouldUseDesktopFloatingTaskComposer
} from "../src/views/composer/composerContext";

test("desktop add task uses the floating composer path", () => {
  assert.equal(shouldUseDesktopFloatingTaskComposer(false), true);
});

test("mobile add task keeps the existing non-floating path", () => {
  assert.equal(shouldUseDesktopFloatingTaskComposer(true), false);
});

test("today context defaults due date to today", () => {
  const context = getBaseAddTaskComposerContext({
    mode: "today",
    selectedProject: null,
    today: "2026-03-07",
    tomorrow: "2026-03-08"
  });

  assert.deepEqual(context, {
    defaultProject: "",
    defaultDue: "2026-03-07"
  });
});

test("upcoming context defaults due date to tomorrow", () => {
  const context = getBaseAddTaskComposerContext({
    mode: "upcoming",
    selectedProject: null,
    today: "2026-03-07",
    tomorrow: "2026-03-08"
  });

  assert.deepEqual(context, {
    defaultProject: "",
    defaultDue: "2026-03-08"
  });
});

test("upcoming date group can override the default due date", () => {
  const base = getBaseAddTaskComposerContext({
    mode: "upcoming",
    selectedProject: null,
    today: "2026-03-07",
    tomorrow: "2026-03-08"
  });
  const context = resolveAddTaskComposerContext(base, {
    defaultDue: "2026-03-18"
  });

  assert.deepEqual(context, {
    defaultProject: "",
    defaultDue: "2026-03-18"
  });
});

test("project context defaults project to the selected project", () => {
  const context = getBaseAddTaskComposerContext({
    mode: "projects",
    selectedProject: "Calendar Testing",
    today: "2026-03-07",
    tomorrow: "2026-03-08"
  });

  assert.deepEqual(context, {
    defaultProject: "Calendar Testing"
  });
});

test("second context does not retain stale due or project defaults", () => {
  const first = resolveAddTaskComposerContext(
    getBaseAddTaskComposerContext({
      mode: "today",
      selectedProject: null,
      today: "2026-03-07",
      tomorrow: "2026-03-08"
    }),
    { defaultProject: "Health" }
  );
  const second = getBaseAddTaskComposerContext({
    mode: "inbox",
    selectedProject: null,
    today: "2026-03-07",
    tomorrow: "2026-03-08"
  });

  assert.deepEqual(first, {
    defaultProject: "Health",
    defaultDue: "2026-03-07"
  });
  assert.deepEqual(second, {
    defaultProject: ""
  });
});
