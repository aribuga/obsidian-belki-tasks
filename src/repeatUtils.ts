import { RepeatEndsType, RepeatFrequency, RepeatMode, RepeatRule } from "./types";
import { isIsoDate, toIsoDate } from "./dateUtils";

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAY_SHORT_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

function normalizeWeekdayValue(value: unknown): number | undefined {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(numberValue) || numberValue < 0 || numberValue > 6) {
    return undefined;
  }

  return numberValue;
}

function sortWeekdaysForDisplay(a: number, b: number): number {
  return WEEKDAY_DISPLAY_ORDER.indexOf(a) - WEEKDAY_DISPLAY_ORDER.indexOf(b);
}

function normalizeWeekdays(values: unknown): number[] {
  if (!Array.isArray(values)) {
    const single = normalizeWeekdayValue(values);
    return single === undefined ? [] : [single];
  }

  return Array.from(
    new Set(
      values
        .map(normalizeWeekdayValue)
        .filter((value): value is number => value !== undefined)
    )
  ).sort(sortWeekdaysForDisplay);
}

export function getRepeatWeekdays(rule: RepeatRule): number[] {
  const weekdays = normalizeWeekdays(rule.weekdays);
  if (weekdays.length > 0) {
    return weekdays;
  }

  return normalizeWeekdays(rule.weekday);
}

export function normalizeRepeatRule(rule: RepeatRule): RepeatRule {
  const normalized: RepeatRule = { ...rule };
  normalized.interval = normalized.interval && normalized.interval > 0 ? normalized.interval : 1;
  normalized.ends = normalized.ends || "never";
  normalized.mode = normalized.mode || "scheduledDate";

  const weekdays = getRepeatWeekdays(normalized);

  if (normalized.frequency === "weekly" && normalized.mode === "scheduledDate" && weekdays.length > 0) {
    normalized.weekdays = weekdays;
    normalized.weekday = weekdays[0];
  } else {
    delete normalized.weekdays;
    if (normalized.frequency !== "weekly" || normalized.mode !== "scheduledDate") {
      delete normalized.weekday;
    }
  }

  return normalized;
}

function ordinal(n: number): string {
  const v = n % 100;
  const s = ["th", "st", "nd", "rd"];
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function parseRepeat(value: string | undefined): RepeatRule | undefined {
  if (!value) return undefined;

  // New JSON format
  if (value.startsWith("{")) {
    try {
      const obj = JSON.parse(value) as Record<string, unknown>;
      return normalizeRepeatRule({
        frequency: obj.f as RepeatFrequency,
        interval: (obj.i as number) ?? 1,
        mode: obj.m === "c" ? "completedDate" : "scheduledDate",
        weekday: obj.w as number | undefined,
        weekdays: normalizeWeekdays(obj.ws),
        dayOfMonth: obj.dom as number | undefined,
        month: obj.mo as number | undefined,
        ends: obj.e === "d" ? "onDate" : obj.e === "o" ? "afterOccurrences" : "never",
        endsDate: obj.ed as string | undefined,
        endsCount: obj.ec as number | undefined,
      });
    } catch {
      return undefined;
    }
  }

  // Legacy pipe format (backward compat from issue #11)
  const parts = value.split("|");
  const freq = parts[0] as RepeatFrequency;
  const defaults = { interval: 1, mode: "scheduledDate" as RepeatMode, ends: "never" as RepeatEndsType };
  switch (freq) {
    case "daily": return { frequency: "daily", ...defaults };
    case "weekdays": return { frequency: "weekdays", ...defaults };
    case "weekly": {
      const weekday = normalizeWeekdayValue(parts[1]) ?? 1;
      return { frequency: "weekly", ...defaults, weekday, weekdays: [weekday] };
    }
    case "monthly": return { frequency: "monthly", ...defaults, dayOfMonth: parseInt(parts[1]) || 1 };
    case "yearly": return { frequency: "yearly", ...defaults, month: parseInt(parts[1]) || 1, dayOfMonth: parseInt(parts[2]) || 1 };
    default: return undefined;
  }
}

export function serializeRepeat(rule: RepeatRule): string {
  const normalized = normalizeRepeatRule(rule);
  const obj: Record<string, unknown> = {
    f: normalized.frequency,
    i: normalized.interval,
    m: normalized.mode === "completedDate" ? "c" : "s",
    e: normalized.ends === "onDate" ? "d" : normalized.ends === "afterOccurrences" ? "o" : "n",
  };
  const weekdays = getRepeatWeekdays(normalized);
  if (normalized.frequency === "weekly" && normalized.mode === "scheduledDate" && weekdays.length > 0) {
    obj.ws = weekdays;
    obj.w = weekdays[0];
  }
  if (normalized.dayOfMonth !== undefined) obj.dom = normalized.dayOfMonth;
  if (normalized.month !== undefined) obj.mo = normalized.month;
  if (normalized.endsDate) obj.ed = normalized.endsDate;
  if (normalized.endsCount !== undefined) obj.ec = normalized.endsCount;
  return JSON.stringify(obj);
}

export function getRepeatLabel(rule: RepeatRule): string {
  const normalized = normalizeRepeatRule(rule);
  const i = normalized.interval ?? 1;
  switch (normalized.frequency) {
    case "daily":
      return i === 1 ? "Every day" : `Every ${i} days`;
    case "weekdays":
      return "Every weekday";
    case "weekly": {
      const weekdays = getRepeatWeekdays(normalized);
      if (weekdays.length === 1) {
        const day = WEEKDAY_NAMES[weekdays[0]];
        return i === 1 ? `Every week on ${day}` : `Every ${i} weeks on ${day}`;
      }
      if (weekdays.length > 1) {
        const days = weekdays.map((weekday) => WEEKDAY_SHORT_NAMES[weekday]).join(", ");
        return i === 1 ? `Every week on ${days}` : `Every ${i} weeks on ${days}`;
      }
      return i === 1 ? "Every week" : `Every ${i} weeks`;
    }
    case "monthly": {
      const ord = ordinal(normalized.dayOfMonth ?? 1);
      return i === 1 ? `Monthly on the ${ord}` : `Every ${i} months on the ${ord}`;
    }
    case "yearly": {
      const mo = MONTH_NAMES[normalized.month ?? 1];
      const d = normalized.dayOfMonth ?? 1;
      return i === 1 ? `Yearly on ${mo} ${d}` : `Every ${i} years on ${mo} ${d}`;
    }
  }
}

export function getRepeatChipLabel(rule: RepeatRule): string {
  const normalized = normalizeRepeatRule(rule);
  const i = normalized.interval ?? 1;

  switch (normalized.frequency) {
    case "daily":
      return i === 1 ? "Daily" : `${i}d`;
    case "weekdays":
      return "Weekdays";
    case "weekly": {
      const weekdays = getRepeatWeekdays(normalized);
      if (weekdays.length === 1) {
        const day = WEEKDAY_SHORT_NAMES[weekdays[0]];
        return i === 1 ? `Weekly ${day}` : `${i}w · ${day}`;
      }
      if (weekdays.length > 1) {
        if (weekdays.length > 3) {
          return i === 1 ? `Weekly · ${weekdays.length} days` : `${i}w · ${weekdays.length} days`;
        }
        const days = weekdays.map((weekday) => WEEKDAY_SHORT_NAMES[weekday]).join(", ");
        return i === 1 ? `Weekly · ${days}` : `${i}w · ${days}`;
      }
      return i === 1 ? "Weekly" : `${i}w`;
    }
    case "monthly": {
      const ord = ordinal(normalized.dayOfMonth ?? 1);
      return i === 1 ? `Monthly · ${ord}` : `${i}mo · ${ord}`;
    }
    case "yearly": {
      const month = MONTH_NAMES[normalized.month ?? 1];
      const shortMonth = month.slice(0, 3);
      const day = normalized.dayOfMonth ?? 1;
      return i === 1 ? `Yearly · ${shortMonth} ${day}` : `${i}y · ${shortMonth} ${day}`;
    }
  }
}

export interface RepeatPreset {
  label: string;
  rule: RepeatRule;
}

const PRESET_DEFAULTS = { interval: 1, mode: "scheduledDate" as RepeatMode, ends: "never" as RepeatEndsType };

export function getRepeatPresets(due: string): RepeatPreset[] {
  if (!isIsoDate(due)) return [];
  const [, month, day] = due.split("-").map(Number);
  const date = new Date(parseInt(due.slice(0, 4)), month - 1, day);
  const weekday = date.getDay();
  return [
    { label: "Every day", rule: { frequency: "daily", ...PRESET_DEFAULTS } },
    { label: `Every ${WEEKDAY_NAMES[weekday]}`, rule: { frequency: "weekly", ...PRESET_DEFAULTS, weekday, weekdays: [weekday] } },
    { label: "Every weekday (Mon – Fri)", rule: { frequency: "weekdays", ...PRESET_DEFAULTS } },
    { label: `Monthly on the ${ordinal(day)}`, rule: { frequency: "monthly", ...PRESET_DEFAULTS, dayOfMonth: day } },
    { label: `Yearly on ${MONTH_NAMES[month]} ${day}`, rule: { frequency: "yearly", ...PRESET_DEFAULTS, month, dayOfMonth: day } },
  ];
}

export function nextOccurrence(rule: RepeatRule, fromDate: string): string {
  const normalized = normalizeRepeatRule(rule);
  const [year, month, day] = fromDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const interval = normalized.interval ?? 1;

  switch (normalized.frequency) {
    case "daily":
      date.setDate(date.getDate() + interval);
      break;
    case "weekly":
      if (normalized.mode === "scheduledDate") {
        const weekdays = getRepeatWeekdays(normalized);
        if (weekdays.length > 0) {
          date.setDate(date.getDate() + nextWeeklyWeekdayDelta(date.getDay(), weekdays, interval));
          break;
        }
      }
      date.setDate(date.getDate() + 7 * interval);
      break;
    case "weekdays":
      date.setDate(date.getDate() + 1);
      while (date.getDay() === 0 || date.getDay() === 6) {
        date.setDate(date.getDate() + 1);
      }
      break;
    case "monthly": {
      const targetDay = date.getDate();
      date.setDate(1);
      date.setMonth(date.getMonth() + interval);
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      date.setDate(Math.min(targetDay, lastDay));
      break;
    }
    case "yearly": {
      const targetMonth = date.getMonth();
      const targetDay2 = date.getDate();
      date.setFullYear(date.getFullYear() + interval);
      const lastDay2 = new Date(date.getFullYear(), targetMonth + 1, 0).getDate();
      date.setMonth(targetMonth);
      date.setDate(Math.min(targetDay2, lastDay2));
      break;
    }
  }

  return toIsoDate(date);
}

function weekdayDisplayIndex(weekday: number): number {
  return WEEKDAY_DISPLAY_ORDER.indexOf(weekday);
}

function nextWeeklyWeekdayDelta(currentWeekday: number, weekdays: number[], interval: number): number {
  const currentDisplayIndex = weekdayDisplayIndex(currentWeekday);
  const laterThisWeek = weekdays
    .filter((weekday) => weekdayDisplayIndex(weekday) > currentDisplayIndex)
    .map((weekday) => (weekday - currentWeekday + 7) % 7)
    .filter((delta) => delta > 0)
    .sort((a, b) => a - b);

  if (laterThisWeek.length > 0) {
    return laterThisWeek[0];
  }

  const nextCycleDeltas = weekdays
    .map((weekday) => {
      const delta = (weekday - currentWeekday + 7) % 7;
      return delta === 0 ? interval * 7 : (interval - 1) * 7 + delta;
    })
    .sort((a, b) => a - b);

  return nextCycleDeltas[0] || interval * 7;
}

export function isRepeatEnded(rule: RepeatRule, occurrenceCount: number, nextDate: string): boolean {
  if (rule.ends === "never") return false;
  if (rule.ends === "onDate" && rule.endsDate) {
    return nextDate > rule.endsDate;
  }
  if (rule.ends === "afterOccurrences" && rule.endsCount !== undefined) {
    return occurrenceCount >= rule.endsCount;
  }
  return false;
}

export function repeatRulesEqual(a: RepeatRule | undefined, b: RepeatRule | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return serializeRepeat(a) === serializeRepeat(b);
}
