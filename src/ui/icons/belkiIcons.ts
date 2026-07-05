export type BelkiIconName =
  | "activity"
  | "add"
  | "archive"
  | "attachment"
  | "back"
  | "calendar"
  | "close"
  | "collapse"
  | "completed"
  | "deadline"
  | "delete"
  | "download"
  | "dragHandle"
  | "edit"
  | "expand"
  | "file"
  | "filters"
  | "inbox"
  | "labels"
  | "more"
  | "overdue"
  | "priority"
  | "projects"
  | "randomize"
  | "recurring"
  | "search"
  | "settings"
  | "sorting"
  | "subtasks"
  | "today"
  | "upcoming";

export type BelkiIconInput = BelkiIconName | (string & {});

export const BELKI_ICON_MAP: Record<BelkiIconName, string> = {
  activity: "chart-no-axes-column",
  add: "plus",
  archive: "archive",
  attachment: "paperclip",
  back: "arrow-left",
  calendar: "calendar",
  close: "x",
  collapse: "chevron-right",
  completed: "circle-check",
  deadline: "calendar-days",
  delete: "trash-2",
  download: "download",
  dragHandle: "grip-vertical",
  edit: "pencil",
  expand: "chevron-down",
  file: "file",
  filters: "tag",
  inbox: "inbox",
  labels: "tag",
  more: "more-horizontal",
  overdue: "alarm-clock",
  priority: "flag",
  projects: "folder",
  randomize: "refresh-cw",
  recurring: "repeat",
  search: "search",
  settings: "settings",
  sorting: "arrow-up-down",
  subtasks: "list-checks",
  today: "calendar-check",
  upcoming: "calendar-clock"
};

export function resolveBelkiIcon(icon: BelkiIconInput): string {
  return BELKI_ICON_MAP[icon as BelkiIconName] || icon;
}
