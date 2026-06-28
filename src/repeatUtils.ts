import { RepeatEndsType, RepeatFrequency, RepeatMode, RepeatRule } from "./types";
import { isIsoDate, toIsoDate } from "./dateUtils";

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

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
      return {
        frequency: obj.f as RepeatFrequency,
        interval: (obj.i as number) ?? 1,
        mode: (obj.m === "c" ? "completedDate" : "scheduledDate") as RepeatMode,
        weekday: obj.w as number | undefined,
        dayOfMonth: obj.dom as number | undefined,
        month: obj.mo as number | undefined,
        ends: (obj.e === "d" ? "onDate" : obj.e === "o" ? "afterOccurrences" : "never") as RepeatEndsType,
        endsDate: obj.ed as string | undefined,
        endsCount: obj.ec as number | undefined,
      };
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
    case "weekly": return { frequency: "weekly", ...defaults, weekday: parseInt(parts[1]) || 1 };
    case "monthly": return { frequency: "monthly", ...defaults, dayOfMonth: parseInt(parts[1]) || 1 };
    case "yearly": return { frequency: "yearly", ...defaults, month: parseInt(parts[1]) || 1, dayOfMonth: parseInt(parts[2]) || 1 };
    default: return undefined;
  }
}

export function serializeRepeat(rule: RepeatRule): string {
  const obj: Record<string, unknown> = {
    f: rule.frequency,
    i: rule.interval,
    m: rule.mode === "completedDate" ? "c" : "s",
    e: rule.ends === "onDate" ? "d" : rule.ends === "afterOccurrences" ? "o" : "n",
  };
  if (rule.weekday !== undefined) obj.w = rule.weekday;
  if (rule.dayOfMonth !== undefined) obj.dom = rule.dayOfMonth;
  if (rule.month !== undefined) obj.mo = rule.month;
  if (rule.endsDate) obj.ed = rule.endsDate;
  if (rule.endsCount !== undefined) obj.ec = rule.endsCount;
  return JSON.stringify(obj);
}

export function getRepeatLabel(rule: RepeatRule): string {
  const i = rule.interval ?? 1;
  switch (rule.frequency) {
    case "daily":
      return i === 1 ? "Every day" : `Every ${i} days`;
    case "weekdays":
      return "Every weekday";
    case "weekly": {
      if (rule.weekday !== undefined) {
        const day = WEEKDAY_NAMES[rule.weekday];
        return i === 1 ? `Every ${day}` : `Every ${i} weeks on ${day}`;
      }
      return i === 1 ? "Every week" : `Every ${i} weeks`;
    }
    case "monthly": {
      const ord = ordinal(rule.dayOfMonth ?? 1);
      return i === 1 ? `Monthly on the ${ord}` : `Every ${i} months on the ${ord}`;
    }
    case "yearly": {
      const mo = MONTH_NAMES[rule.month ?? 1];
      const d = rule.dayOfMonth ?? 1;
      return i === 1 ? `Yearly on ${mo} ${d}` : `Every ${i} years on ${mo} ${d}`;
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
    { label: `Every ${WEEKDAY_NAMES[weekday]}`, rule: { frequency: "weekly", ...PRESET_DEFAULTS, weekday } },
    { label: "Every weekday (Mon – Fri)", rule: { frequency: "weekdays", ...PRESET_DEFAULTS } },
    { label: `Monthly on the ${ordinal(day)}`, rule: { frequency: "monthly", ...PRESET_DEFAULTS, dayOfMonth: day } },
    { label: `Yearly on ${MONTH_NAMES[month]} ${day}`, rule: { frequency: "yearly", ...PRESET_DEFAULTS, month, dayOfMonth: day } },
  ];
}

export function nextOccurrence(rule: RepeatRule, fromDate: string): string {
  const [year, month, day] = fromDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const interval = rule.interval ?? 1;

  switch (rule.frequency) {
    case "daily":
      date.setDate(date.getDate() + interval);
      break;
    case "weekly":
      date.setDate(date.getDate() + 7 * interval);
      if (rule.weekday !== undefined && date.getDay() !== rule.weekday) {
        // Snap forward to correct weekday if due date drifted
        let diff = rule.weekday - date.getDay();
        if (diff < 0) diff += 7;
        date.setDate(date.getDate() + diff);
      }
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
