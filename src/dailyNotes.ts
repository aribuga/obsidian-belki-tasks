import { normalizePath } from "obsidian";
import { isIsoDate } from "./dateUtils";

export const DEFAULT_DAILY_NOTE_DATE_FORMAT = "YYYY-MM-DD";

export function normalizeDailyNoteDateFormat(value: string | undefined): string {
  const trimmed = (value || "").trim();
  return trimmed || DEFAULT_DAILY_NOTE_DATE_FORMAT;
}

export function dailyNoteDateFromPath(
  path: string | undefined,
  dateFormat: string
): string | null {
  if (!path) {
    return null;
  }

  const normalizedPath = stripMarkdownExtension(normalizePath(path));
  const normalizedFormat = stripMarkdownExtension(normalizePath(normalizeDailyNoteDateFormat(dateFormat)));
  const target = normalizedFormat.includes("/")
    ? normalizedPath
    : basenameWithoutExtension(normalizedPath);

  const fromFormat = dateFromFormattedPath(target, normalizedFormat);
  if (fromFormat) {
    return fromFormat;
  }

  const fallback = basenameWithoutExtension(normalizedPath).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!fallback) {
    return null;
  }

  return normalizeDateParts(fallback[1], fallback[2], fallback[3]);
}

function dateFromFormattedPath(target: string, format: string): string | null {
  const pattern = formatToRegex(format);
  const match = target.match(pattern);
  if (!match?.groups) {
    return null;
  }

  const year = match.groups.year || (match.groups.year2 ? `20${match.groups.year2}` : "");
  const month = match.groups.month;
  const day = match.groups.day;
  return normalizeDateParts(year, month, day);
}

function formatToRegex(format: string): RegExp {
  let pattern = "^";
  const groups = new Set<string>();
  const appendGroup = (name: string, groupPattern: string): void => {
    if (groups.has(name)) {
      pattern += groupPattern;
      return;
    }

    groups.add(name);
    pattern += `(?<${name}>${groupPattern})`;
  };

  for (let index = 0; index < format.length;) {
    const rest = format.slice(index);
    if (rest.startsWith("YYYY")) {
      appendGroup("year", "\\d{4}");
      index += 4;
    } else if (rest.startsWith("YY")) {
      appendGroup("year2", "\\d{2}");
      index += 2;
    } else if (rest.startsWith("MMMM")) {
      pattern += "[^/]+";
      index += 4;
    } else if (rest.startsWith("MMM")) {
      pattern += "[^/]+";
      index += 3;
    } else if (rest.startsWith("MM")) {
      appendGroup("month", "\\d{2}");
      index += 2;
    } else if (rest.startsWith("M")) {
      appendGroup("month", "\\d{1,2}");
      index += 1;
    } else if (rest.startsWith("DD")) {
      appendGroup("day", "\\d{2}");
      index += 2;
    } else if (rest.startsWith("D")) {
      appendGroup("day", "\\d{1,2}");
      index += 1;
    } else {
      pattern += escapeRegExp(format[index]);
      index += 1;
    }
  }

  pattern += "$";
  return new RegExp(pattern);
}

function normalizeDateParts(
  yearValue: string | undefined,
  monthValue: string | undefined,
  dayValue: string | undefined
): string | null {
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  const iso = [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0")
  ].join("-");
  return isIsoDate(iso) ? iso : null;
}

function basenameWithoutExtension(path: string): string {
  return stripMarkdownExtension(path.split("/").pop() || path);
}

function stripMarkdownExtension(value: string): string {
  return value.replace(/\.md$/i, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
