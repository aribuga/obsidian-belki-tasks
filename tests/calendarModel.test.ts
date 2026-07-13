import { test } from "node:test";
import * as assert from "node:assert/strict";
import type { BelkiTask } from "../src/types";
import {
  buildCalendarTaskGroups,
  buildMonthGrid,
  getCalendarTasksForDate,
  hasCalendarDate
} from "../src/views/calendar/calendarModel";
import {
  addCalendarMonths,
  selectedDateForCalendarMonth
} from "../src/views/calendar/calendarUtils";

test("buildMonthGrid creates a 42-day month grid with leading and trailing days", () => {
  const groups = buildCalendarTaskGroups([]);
  const days = buildMonthGrid({
    month: { year: 2026, month: 4 },
    taskGroups: groups,
    today: "2026-05-15"
  });

  assert.equal(days.length, 42);
  assert.equal(days[0].date, "2026-04-27");
  assert.equal(days[0].isCurrentMonth, false);
  assert.equal(days[4].date, "2026-05-01");
  assert.equal(days[4].isCurrentMonth, true);
  assert.equal(days[41].date, "2026-06-07");
  assert.equal(days[41].isCurrentMonth, false);
});

test("buildMonthGrid marks today and selected dates", () => {
  const groups = buildCalendarTaskGroups([]);
  const days = buildMonthGrid({
    month: { year: 2026, month: 6 },
    taskGroups: groups,
    today: "2026-07-13",
    selectedDate: "2026-07-20"
  });

  assert.equal(days.find((day) => day.date === "2026-07-13")?.isToday, true);
  assert.equal(days.find((day) => day.date === "2026-07-20")?.isSelected, true);
});

test("buildCalendarTaskGroups groups tasks by due date and deadline indicators", () => {
  const dueOnly = createTask("due-only", { due: "2026-07-15" });
  const dueAndDeadline = createTask("due-and-deadline", {
    due: "2026-07-15",
    deadline: "2026-07-20",
    order: 1
  });
  const deadlineOnly = createTask("deadline-only", {
    deadline: "2026-07-20",
    order: 2
  });

  const groups = buildCalendarTaskGroups([dueOnly, dueAndDeadline, deadlineOnly]);

  assert.deepEqual(
    groups.dueTasksByDate.get("2026-07-15")?.map((task) => task.id),
    ["due-only", "due-and-deadline"]
  );
  assert.deepEqual(
    groups.deadlineTasksByDate.get("2026-07-20")?.map((task) => task.id),
    ["due-and-deadline", "deadline-only"]
  );
});

test("buildMonthGrid exposes deadline counts separately from due chips", () => {
  const groups = buildCalendarTaskGroups([
    createTask("task", { due: "2026-07-15", deadline: "2026-07-20" })
  ]);
  const days = buildMonthGrid({
    month: { year: 2026, month: 6 },
    taskGroups: groups,
    today: "2026-07-01"
  });

  const dueDay = days.find((day) => day.date === "2026-07-15");
  const deadlineDay = days.find((day) => day.date === "2026-07-20");
  assert.equal(dueDay?.dueTasks.length, 1);
  assert.equal(dueDay?.deadlineCount, 0);
  assert.equal(deadlineDay?.dueTasks.length, 0);
  assert.equal(deadlineDay?.deadlineCount, 1);
});

test("tasks without a valid date are skipped", () => {
  const noDate = createTask("no-date");
  const invalidDate = createTask("invalid-date", { due: "2026-02-31" });
  const groups = buildCalendarTaskGroups([noDate, invalidDate]);

  assert.equal(hasCalendarDate(noDate), false);
  assert.equal(hasCalendarDate(invalidDate), false);
  assert.equal(groups.dueTasksByDate.size, 0);
  assert.equal(groups.deadlineTasksByDate.size, 0);
});

test("getCalendarTasksForDate returns due entries before deadline entries", () => {
  const due = createTask("due", { due: "2026-07-13" });
  const deadline = createTask("deadline", { deadline: "2026-07-13", order: 1 });
  const groups = buildCalendarTaskGroups([deadline, due]);

  assert.deepEqual(
    getCalendarTasksForDate(groups, "2026-07-13").map((entry) => `${entry.role}:${entry.task.id}`),
    ["due:due", "deadline:deadline"]
  );
});

test("buildMonthGrid marks overdue days with open due tasks", () => {
  const groups = buildCalendarTaskGroups([
    createTask("open", { due: "2026-07-01" }),
    createTask("done", { due: "2026-07-02", completed: true })
  ]);
  const days = buildMonthGrid({
    month: { year: 2026, month: 6 },
    taskGroups: groups,
    today: "2026-07-13"
  });

  assert.equal(days.find((day) => day.date === "2026-07-01")?.isOverdue, true);
  assert.equal(days.find((day) => day.date === "2026-07-02")?.isOverdue, false);
});

test("addCalendarMonths handles December to January and January to December", () => {
  assert.deepEqual(addCalendarMonths({ year: 2026, month: 11 }, 1), {
    year: 2027,
    month: 0
  });
  assert.deepEqual(addCalendarMonths({ year: 2026, month: 0 }, -1), {
    year: 2025,
    month: 11
  });
});

test("selectedDateForCalendarMonth clamps long months to shorter months", () => {
  assert.equal(
    selectedDateForCalendarMonth({ year: 2026, month: 1 }, "2026-01-31"),
    "2026-02-28"
  );
});

function createTask(id: string, overrides: Partial<BelkiTask> = {}): BelkiTask {
  return {
    id,
    title: id,
    completed: false,
    priority: "none",
    labels: [],
    attachments: [],
    extraProperties: [],
    order: 0,
    ...overrides
  };
}
