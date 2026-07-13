import { formatDateLabel, todayIso } from "../../dateUtils";
import type { BelkiTask } from "../../types";
import { createBelkiIcon } from "../../ui/components/BelkiIcon";
import {
  buildCalendarTaskGroups,
  buildMonthGrid,
  getCalendarTasksForDate
} from "./calendarModel";
import {
  addCalendarMonths,
  calendarMonthFromDate,
  calendarMonthFromIsoDate,
  CALENDAR_WEEKDAY_LABELS,
  formatCalendarMonthLabel,
  selectedDateForCalendarMonth
} from "./calendarUtils";
import type { CalendarDay, CalendarMonth, CalendarTaskEntry } from "./calendarTypes";

interface RenderCalendarViewOptions {
  parent: HTMLElement;
  month: CalendarMonth;
  selectedDate: string;
  tasks: BelkiTask[];
  sortTasks: (tasks: BelkiTask[]) => BelkiTask[];
  onNavigate: (month: CalendarMonth, selectedDate: string) => void;
  onSelectDate: (date: string, month: CalendarMonth) => void;
  onOpenTask: (task: BelkiTask) => void;
}

const MAX_VISIBLE_CHIPS = 3;

export function renderCalendarView(options: RenderCalendarViewOptions): void {
  const taskGroups = buildCalendarTaskGroups(options.tasks);
  const today = todayIso();
  const days = buildMonthGrid({
    month: options.month,
    taskGroups,
    selectedDate: options.selectedDate,
    today
  });
  const selectedEntries = sortEntries(
    getCalendarTasksForDate(taskGroups, options.selectedDate),
    options.sortTasks
  );

  const calendar = options.parent.createDiv({ cls: "belki-calendar" });
  renderCalendarToolbar(calendar, options, today);
  renderCalendarGrid(calendar, days, options);
  renderSelectedDay(calendar, options.selectedDate, selectedEntries, options);
}

function renderCalendarToolbar(
  parent: HTMLElement,
  options: RenderCalendarViewOptions,
  today: string
): void {
  const toolbar = parent.createDiv({ cls: "belki-calendar-toolbar" });
  const previous = toolbar.createEl("button", {
    cls: "belki-calendar-nav-button",
    attr: { type: "button", "aria-label": "Previous month" }
  });
  createBelkiIcon(previous, "chevron-left");
  previous.addEventListener("click", () => {
    const month = addCalendarMonths(options.month, -1);
    options.onNavigate(month, selectedDateForCalendarMonth(month, options.selectedDate));
  });

  toolbar.createDiv({
    cls: "belki-calendar-month-label",
    text: formatCalendarMonthLabel(options.month)
  });

  const next = toolbar.createEl("button", {
    cls: "belki-calendar-nav-button",
    attr: { type: "button", "aria-label": "Next month" }
  });
  createBelkiIcon(next, "chevron-right");
  next.addEventListener("click", () => {
    const month = addCalendarMonths(options.month, 1);
    options.onNavigate(month, selectedDateForCalendarMonth(month, options.selectedDate));
  });

  toolbar
    .createEl("button", {
      cls: "belki-calendar-today-button",
      text: "Today",
      attr: { type: "button" }
    })
    .addEventListener("click", () => {
      options.onNavigate(calendarMonthFromDate(new Date()), today);
    });
}

function renderCalendarGrid(
  parent: HTMLElement,
  days: CalendarDay[],
  options: RenderCalendarViewOptions
): void {
  const grid = parent.createDiv({ cls: "belki-calendar-grid" });
  for (const label of CALENDAR_WEEKDAY_LABELS) {
    grid.createDiv({ cls: "belki-calendar-weekday", text: label });
  }

  for (const day of days) {
    renderCalendarDay(grid, day, options);
  }
}

function renderCalendarDay(
  parent: HTMLElement,
  day: CalendarDay,
  options: RenderCalendarViewOptions
): void {
  const classes = [
    "belki-calendar-day",
    day.isCurrentMonth ? undefined : "is-muted",
    day.isToday ? "is-today" : undefined,
    day.isSelected ? "is-selected" : undefined,
    day.isOverdue ? "is-overdue" : undefined,
    day.totalCount > 0 ? "has-tasks" : undefined
  ].filter(Boolean).join(" ");

  const dayEl = parent.createEl("div", {
    cls: classes,
    attr: {
      role: "button",
      tabindex: "0",
      "aria-label": `${formatDateLabel(day.date)}, ${day.totalCount} task${day.totalCount === 1 ? "" : "s"}`
    }
  });
  dayEl.addEventListener("click", () => selectDay(day, options));
  dayEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectDay(day, options);
    }
  });

  const header = dayEl.createDiv({ cls: "belki-calendar-day-header" });
  header.createSpan({ cls: "belki-calendar-day-number", text: String(day.dayNumber) });

  if (day.deadlineCount > 0) {
    const deadline = header.createSpan({
      cls: "belki-calendar-deadline-indicator",
      attr: {
        "aria-label": `${day.deadlineCount} deadline${day.deadlineCount === 1 ? "" : "s"}`
      }
    });
    createBelkiIcon(deadline, "deadline", { size: 12 });
    deadline.createSpan({ text: String(day.deadlineCount) });
  }

  if (day.totalCount > 0) {
    dayEl.createDiv({
      cls: "belki-calendar-mobile-count",
      text: String(day.totalCount)
    });
  }

  renderDayChips(dayEl, day, options);
}

function renderDayChips(
  parent: HTMLElement,
  day: CalendarDay,
  options: RenderCalendarViewOptions
): void {
  if (day.dueTasks.length === 0) {
    return;
  }

  const chips = parent.createDiv({ cls: "belki-calendar-task-chips" });
  const sortedTasks = options.sortTasks(day.dueTasks);
  for (const task of sortedTasks.slice(0, MAX_VISIBLE_CHIPS)) {
    const chip = chips.createEl("button", {
      cls: "belki-calendar-task-chip",
      text: task.title,
      attr: { type: "button" }
    });
    chip.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      options.onOpenTask(task);
    });
  }

  if (sortedTasks.length > MAX_VISIBLE_CHIPS) {
    chips.createDiv({
      cls: "belki-calendar-more",
      text: `+${sortedTasks.length - MAX_VISIBLE_CHIPS} more`
    });
  }
}

function renderSelectedDay(
  parent: HTMLElement,
  selectedDate: string,
  entries: CalendarTaskEntry[],
  options: RenderCalendarViewOptions
): void {
  const panel = parent.createDiv({ cls: "belki-calendar-selected" });
  const header = panel.createDiv({ cls: "belki-calendar-selected-header" });
  header.createEl("h2", { text: formatDateLabel(selectedDate) });
  header.createSpan({
    cls: "belki-calendar-selected-count",
    text: `${entries.length} task${entries.length === 1 ? "" : "s"}`
  });

  if (entries.length === 0) {
    panel.createDiv({
      cls: "belki-calendar-empty",
      text: "No dated tasks for this day."
    });
    return;
  }

  const list = panel.createDiv({ cls: "belki-calendar-selected-list" });
  for (const entry of entries) {
    const row = list.createEl("button", {
      cls: `belki-calendar-selected-task is-${entry.role}`,
      attr: { type: "button" }
    });
    row.addEventListener("click", () => options.onOpenTask(entry.task));
    row.createSpan({
      cls: "belki-calendar-selected-role",
      text: entry.role === "due" ? "Due" : "Deadline"
    });
    const content = row.createDiv({ cls: "belki-calendar-selected-content" });
    content.createDiv({ cls: "belki-calendar-selected-title", text: entry.task.title });
    content.createDiv({
      cls: "belki-calendar-selected-meta",
      text: entry.role === "deadline" && entry.task.due
        ? `Due ${formatDateLabel(entry.task.due)}`
        : entry.task.deadline && entry.task.deadline !== selectedDate
          ? `Deadline ${formatDateLabel(entry.task.deadline)}`
          : ""
    });
  }
}

function selectDay(day: CalendarDay, options: RenderCalendarViewOptions): void {
  const month = day.isCurrentMonth
    ? options.month
    : calendarMonthFromIsoDate(day.date) || options.month;
  options.onSelectDate(day.date, month);
}

function sortEntries(
  entries: CalendarTaskEntry[],
  sortTasks: (tasks: BelkiTask[]) => BelkiTask[]
): CalendarTaskEntry[] {
  return [
    ...sortEntriesByRole(entries, "due", sortTasks),
    ...sortEntriesByRole(entries, "deadline", sortTasks)
  ];
}

function sortEntriesByRole(
  entries: CalendarTaskEntry[],
  role: CalendarTaskEntry["role"],
  sortTasks: (tasks: BelkiTask[]) => BelkiTask[]
): CalendarTaskEntry[] {
  const roleEntries = entries.filter((entry) => entry.role === role);
  const entriesByTaskId = new Map(roleEntries.map((entry) => [entry.task.id, entry]));
  return sortTasks(roleEntries.map((entry) => entry.task))
    .map((task) => entriesByTaskId.get(task.id))
    .filter((entry): entry is CalendarTaskEntry => Boolean(entry));
}
