import { Priority } from "./types";
import { t } from "./i18n";

export interface PriorityColor {
  name: string;
  color: string;
  light: string;
}

export const PRIORITY_COLORS: Record<Priority, PriorityColor> = {
  P1: { name: t("priority.priority1"), color: "#E03E3E", light: "#FBE4E3" },
  P2: { name: t("priority.priority2"), color: "#D9730D", light: "#FAEBDD" },
  P3: { name: t("priority.priority3"), color: "#0C6E99", light: "#DDEBF1" },
  P4: {
    name: t("priority.priority4"),
    color: "var(--belki-muted)",
    light: "transparent"
  },
  none: {
    name: t("priority.priority"),
    color: "var(--belki-muted)",
    light: "transparent"
  }
};

export function getPriorityColor(priority: Priority): PriorityColor {
  return PRIORITY_COLORS[priority] || PRIORITY_COLORS.none;
}

export function getPriorityLabel(priority: Priority): string {
  return getPriorityColor(priority).name;
}

export function isDefaultPriority(priority: Priority | undefined): boolean {
  return !priority || priority === "P4" || priority === "none";
}

export function hasVisiblePriority(priority: Priority | undefined): boolean {
  return !isDefaultPriority(priority);
}

export function getPriorityDropdownLabel(priority: Priority): string {
  if (priority === "none") return t("priority.priority4");
  return getPriorityColor(priority).name;
}

export function getPriorityDisplayLabel(priority: Priority | undefined): string {
  if (isDefaultPriority(priority)) return t("priority.priority");
  return priority || t("priority.priority");
}

export function getPriorityClass(priority: Priority): string {
  if (isDefaultPriority(priority)) return "";
  return `priority-${priority.toLowerCase()}`;
}
