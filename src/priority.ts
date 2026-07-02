import { Priority } from "./types";

export interface PriorityColor {
  name: string;
  color: string;
  light: string;
}

export const PRIORITY_COLORS: Record<Priority, PriorityColor> = {
  P1: { name: "Priority 1", color: "#E03E3E", light: "#FBE4E3" },
  P2: { name: "Priority 2", color: "#D9730D", light: "#FAEBDD" },
  P3: { name: "Priority 3", color: "#0C6E99", light: "#DDEBF1" },
  P4: {
    name: "Priority 4",
    color: "var(--belki-muted)",
    light: "transparent"
  },
  none: {
    name: "Priority",
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
  if (priority === "none") return "Priority 4";
  return getPriorityColor(priority).name;
}

export function getPriorityDisplayLabel(priority: Priority | undefined): string {
  if (isDefaultPriority(priority)) return "Priority";
  return priority || "Priority";
}

export function getPriorityClass(priority: Priority): string {
  if (isDefaultPriority(priority)) return "";
  return `priority-${priority.toLowerCase()}`;
}
