import { getLabelColor } from "../../colors";
import { displayLabel } from "../../labels";
import { BelkiTask } from "../../types";
import { createBelkiIcon } from "../../ui/components/BelkiIcon";
import { renderLabelActionsMenu } from "../labels/labelActions";

export interface FilterDefinition {
  id: string;
  name: string;
  icon: string;
  tasks: BelkiTask[];
  count: number;
}

interface RenderFiltersAndLabelsViewOptions {
  parent: HTMLElement;
  activeFilter: string | null;
  activeLabel: string | null;
  filterDefinitions: FilterDefinition[];
  activeFilterTasks: BelkiTask[];
  labels: string[];
  labelColors: Record<string, string>;
  labelActionsOpen: string | null;
  hasLabelMenu: boolean;
  sortTasks: (tasks: BelkiTask[]) => BelkiTask[];
  createSection: (parent: HTMLElement, title: string, count: number) => HTMLElement;
  renderTaskList: (parent: HTMLElement, tasks: BelkiTask[]) => void;
  onBackToFilters: () => void;
  onSelectFilter: (filterId: string) => void;
  onSelectLabel: (label: string) => void;
  onCreateLabel: () => void;
  onOpenLabelActions: (button: HTMLElement, label: string, taskCount: number) => void;
  onCloseLabelActions: () => void;
  onRenameLabel: (label: string) => void;
  onDeleteLabel: (label: string, taskCount: number) => void;
}

export function renderFiltersAndLabelsView(options: RenderFiltersAndLabelsViewOptions): void {
  if (options.activeFilter) {
    const definition = options.filterDefinitions.find(
      (filter) => filter.id === options.activeFilter
    );
    const tasks = definition ? options.sortTasks(definition.tasks) : [];
    const section = options.createSection(
      options.parent,
      definition?.name || "Filter",
      tasks.length
    );
    renderBackToFilters(section, options.onBackToFilters);
    options.renderTaskList(section, tasks);
    return;
  }

  if (options.activeLabel) {
    const label = options.activeLabel;
    const tasks = options.sortTasks(
      options.activeFilterTasks.filter((task) => task.labels.includes(label))
    );
    const section = options.createSection(options.parent, displayLabel(label), tasks.length);
    renderBackToFilters(section, options.onBackToFilters);
    options.renderTaskList(section, tasks);
    return;
  }

  const filtersSection = options.parent.createDiv({ cls: "belki-filter-section" });
  filtersSection.createEl("h2", { text: "My Filters" });
  const filterList = filtersSection.createDiv({ cls: "belki-filter-list" });
  for (const filter of options.filterDefinitions) {
    renderFilterRow(filterList, filter.name, filter.count, filter.icon, () => {
      options.onSelectFilter(filter.id);
    });
  }

  const labelsSection = options.parent.createDiv({ cls: "belki-filter-section" });
  const labelsHeader = labelsSection.createDiv({ cls: "belki-labels-header" });
  labelsHeader.createEl("h2", { text: "Labels" });
  const labelAddButton = labelsHeader.createEl("button", {
    cls: "belki-label-add",
    attr: { type: "button", "aria-label": "Create label" }
  });
  createBelkiIcon(labelAddButton, "add");
  labelAddButton.addEventListener("click", () => {
    options.onCreateLabel();
  });

  const labelList = labelsSection.createDiv({ cls: "belki-filter-list" });
  if (options.labels.length === 0) {
    labelList.createDiv({ cls: "belki-empty belki-empty-small", text: "No labels yet." });
    return;
  }

  for (const label of options.labels) {
    const count = options.activeFilterTasks.filter((task) => task.labels.includes(label)).length;
    renderLabelRow(labelList, label, count, options);
  }
}

function renderBackToFilters(parent: HTMLElement, onClick: () => void): void {
  parent
    .createEl("button", { cls: "belki-back-button", text: "Back to Filters & Labels" })
    .addEventListener("click", onClick);
}

function renderFilterRow(
  parent: HTMLElement,
  name: string,
  count: number,
  icon: string,
  onClick: () => void,
  color?: string
): void {
  const row = parent.createEl("button", { cls: "belki-filter-row", attr: { type: "button" } });
  row.toggleClass("belki-label-row", Boolean(color));
  const dot = row.createSpan({ cls: "belki-filter-dot" });
  if (color) {
    dot.addClass("belki-label-dot");
    dot.setCssStyles({ backgroundColor: color });
  } else if (icon) {
    createBelkiIcon(dot, icon);
  }
  row.createSpan({ cls: "belki-filter-name", text: name });
  row.createSpan({ cls: "belki-row-count", text: String(count) });
  row.addEventListener("click", onClick);
}

function renderLabelRow(
  parent: HTMLElement,
  label: string,
  count: number,
  options: RenderFiltersAndLabelsViewOptions
): void {
  const color = getLabelColor(label, options.labelColors).regular;
  const row = parent.createDiv({ cls: "belki-filter-row belki-label-row belki-filter-row-with-actions" });
  const main = row.createEl("button", {
    cls: "belki-filter-row-main",
    attr: { type: "button" }
  });
  const dot = main.createSpan({ cls: "belki-filter-dot belki-label-dot" });
  dot.setCssStyles({ backgroundColor: color });
  main.createSpan({ cls: "belki-filter-name", text: displayLabel(label) });
  main.createSpan({ cls: "belki-row-count", text: String(count) });
  main.addEventListener("click", () => {
    options.onSelectLabel(label);
  });

  renderLabelActionsButton(row, label, count, options);
}

function renderLabelActionsButton(
  parent: HTMLElement,
  label: string,
  taskCount: number,
  options: RenderFiltersAndLabelsViewOptions
): void {
  renderLabelActionsMenu({
    parent,
    label,
    isOpen: options.labelActionsOpen === label && !options.hasLabelMenu,
    onToggle: (button) => {
      if (options.labelActionsOpen === label) {
        options.onCloseLabelActions();
        return;
      }

      options.onOpenLabelActions(button, label, taskCount);
    },
    onOpen: (button) => options.onOpenLabelActions(button, label, taskCount),
    onRename: () => options.onRenameLabel(label),
    onDelete: () => options.onDeleteLabel(label, taskCount)
  });
}
