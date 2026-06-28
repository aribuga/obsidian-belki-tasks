import { RepeatRule } from "./types";
import { isIsoDate } from "./dateUtils";

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
  const parts = value.split("|");
  const freq = parts[0];
  switch (freq) {
    case "daily": return { frequency: "daily" };
    case "weekdays": return { frequency: "weekdays" };
    case "weekly": {
      const weekday = parseInt(parts[1]);
      return { frequency: "weekly", weekday: isNaN(weekday) ? 1 : weekday };
    }
    case "monthly": {
      const day = parseInt(parts[1]);
      return { frequency: "monthly", dayOfMonth: isNaN(day) ? 1 : day };
    }
    case "yearly": {
      const month = parseInt(parts[1]);
      const day = parseInt(parts[2]);
      return { frequency: "yearly", month: isNaN(month) ? 1 : month, dayOfMonth: isNaN(day) ? 1 : day };
    }
    default: return undefined;
  }
}

export function serializeRepeat(rule: RepeatRule): string {
  switch (rule.frequency) {
    case "daily": return "daily";
    case "weekdays": return "weekdays";
    case "weekly": return `weekly|${rule.weekday ?? 1}`;
    case "monthly": return `monthly|${rule.dayOfMonth ?? 1}`;
    case "yearly": return `yearly|${rule.month ?? 1}|${rule.dayOfMonth ?? 1}`;
  }
}

export function getRepeatLabel(rule: RepeatRule): string {
  switch (rule.frequency) {
    case "daily": return "Every day";
    case "weekdays": return "Every weekday";
    case "weekly": return `Every ${WEEKDAY_NAMES[rule.weekday ?? 1]}`;
    case "monthly": return `Monthly on the ${ordinal(rule.dayOfMonth ?? 1)}`;
    case "yearly": return `Yearly on ${MONTH_NAMES[rule.month ?? 1]} ${rule.dayOfMonth ?? 1}`;
  }
}

export interface RepeatPreset {
  label: string;
  rule: RepeatRule;
}

export function getRepeatPresets(due: string): RepeatPreset[] {
  if (!isIsoDate(due)) return [];
  const [, month, day] = due.split("-").map(Number);
  const date = new Date(parseInt(due.slice(0, 4)), month - 1, day);
  const weekday = date.getDay();
  return [
    { label: "Every day", rule: { frequency: "daily" } },
    { label: `Every ${WEEKDAY_NAMES[weekday]}`, rule: { frequency: "weekly", weekday } },
    { label: "Every weekday (Mon – Fri)", rule: { frequency: "weekdays" } },
    { label: `Monthly on the ${ordinal(day)}`, rule: { frequency: "monthly", dayOfMonth: day } },
    { label: `Yearly on ${MONTH_NAMES[month]} ${day}`, rule: { frequency: "yearly", month, dayOfMonth: day } },
  ];
}

export function repeatRulesEqual(a: RepeatRule | undefined, b: RepeatRule | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return serializeRepeat(a) === serializeRepeat(b);
}
