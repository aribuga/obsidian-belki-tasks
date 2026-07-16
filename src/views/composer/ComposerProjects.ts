import { getProjectColor } from "../../colors";
import type { BelkiColorPair } from "../../colors";
import { normalizeTaskProject, uniqueRealProjects } from "../../projects";
import { createBelkiIcon } from "../../ui/components/BelkiIcon";

export interface ComposerProjectsPopoverOptions {
  preferredSide?: "above" | "below";
  useFixed?: boolean;
}

export interface ComposerProjectsOptions {
  footer: HTMLElement;
  projects: string[];
  projectColors: Record<string, string>;
  defaultProject: string;
  closePopovers: () => void;
  clearOutsideListener: () => void;
  watchPopover: (
    wrapper: HTMLElement,
    popover: HTMLElement,
    options?: ComposerProjectsPopoverOptions
  ) => void;
}

export interface ComposerProjectsController {
  close: () => void;
  isOpen: () => boolean;
  getSelectedProject: () => string | undefined;
  remove: () => void;
}

export function renderComposerProjects(
  options: ComposerProjectsOptions
): ComposerProjectsController {
  const projectArea = options.footer.createDiv({ cls: "belki-composer-project" });
  const projectPicker = projectArea.createEl("button", {
    cls: "belki-project-picker belki-location-picker",
    attr: {
      type: "button",
      "aria-haspopup": "listbox",
      "aria-expanded": "false"
    }
  });
  const projectDot = projectPicker.createSpan({ cls: "belki-project-dot belki-composer-project-dot" });
  const projectLabel = projectPicker.createSpan({ cls: "belki-project-trigger-label" });
  const projectMenu = createFragment().createDiv({
    cls: "belki-project-menu",
    attr: {
      role: "listbox"
    }
  });
  const projects = uniqueRealProjects([options.defaultProject, ...options.projects]);
  const defaultProject = normalizeTaskProject(options.defaultProject) || "";
  let selectedProjectValue = projects.includes(defaultProject)
    ? defaultProject
    : "";

  const customProjectWrap = projectArea.createDiv({ cls: "belki-custom-project-wrap is-hidden" });
  const customProjectInput = customProjectWrap.createEl("input", {
    cls: "belki-chip-input belki-custom-project",
    attr: {
      type: "text",
      placeholder: "Project name"
    }
  });
  const confirmProjectBtn = customProjectWrap.createEl("button", {
    cls: "belki-custom-project-confirm",
    attr: { type: "button", "aria-label": "Confirm project" }
  });
  createBelkiIcon(confirmProjectBtn, "completed");

  const cancelProjectBtn = customProjectWrap.createEl("button", {
    cls: "belki-custom-project-cancel",
    attr: { type: "button", "aria-label": "Cancel" }
  });
  createBelkiIcon(cancelProjectBtn, "close");

  let previousProjectValue = "";

  const renderProjectMenu = () => {
    projectMenu.empty();
    renderProjectOption(projectMenu, "Inbox", "");
    projectMenu.createDiv({ cls: "belki-project-section-label", text: "Projects" });

    for (const project of projects) {
      renderProjectOption(
        projectMenu,
        project,
        project,
        getProjectColor(project, options.projectColors)
      );
    }

    renderProjectOption(projectMenu, "New project...", "__new__");
  };

  const updateProjectDot = () => {
    const displayValue = selectedProjectValue === "__new__" ? previousProjectValue : selectedProjectValue;
    const project = normalizeTaskProject(displayValue) || "";
    projectLabel.setText(project || "Inbox");
    if (!project) {
      projectDot.setCssStyles({ backgroundColor: "var(--belki-faint)" });
      projectPicker.setCssStyles({
        backgroundColor: "var(--belki-hover)",
        borderColor: "var(--belki-border)"
      });
      return;
    }

    const color = getProjectColor(project, options.projectColors);
    projectDot.setCssStyles({ backgroundColor: color.regular });
    projectPicker.setCssStyles({
      backgroundColor: color.light,
      borderColor: color.light
    });
  };

  const confirmProject = () => {
    const name = customProjectInput.value.trim();
    if (!name) return;
    selectedProjectValue = name;
    updateProjectDot();
    renderProjectMenu();
    customProjectWrap.addClass("is-hidden");
  };

  const cancelProject = () => {
    selectedProjectValue = previousProjectValue;
    customProjectInput.value = "";
    customProjectWrap.addClass("is-hidden");
    updateProjectDot();
    renderProjectMenu();
  };

  const close = () => {
    projectMenu.remove();
    projectPicker.setAttr("aria-expanded", "false");
    projectPicker.focus({ preventScroll: true });
  };

  const openProjectMenu = () => {
    activeDocument.body.appendChild(projectMenu);
    projectPicker.setAttr("aria-expanded", "true");
    options.watchPopover(projectArea, projectMenu, { preferredSide: "above", useFixed: true });
  };

  const selectProject = (value: string) => {
    if (value === "__new__") {
      previousProjectValue = selectedProjectValue;
    }
    selectedProjectValue = value;
    if (value === "__new__") {
      customProjectWrap.removeClass("is-hidden");
      customProjectInput.value = "";
      close();
      options.clearOutsideListener();
      customProjectInput.focus();
    } else {
      customProjectWrap.addClass("is-hidden");
      close();
      options.clearOutsideListener();
    }
    updateProjectDot();
    renderProjectMenu();
  };

  function renderProjectOption(
    parent: HTMLElement,
    label: string,
    value: string,
    projectColor?: BelkiColorPair
  ): void {
    const option = parent.createEl("button", {
      cls: "belki-project-option",
      attr: {
        type: "button",
        role: "option",
        "aria-selected": String(selectedProjectValue === value)
      }
    });
    option.toggleClass("is-selected", selectedProjectValue === value);
    option.toggleClass("has-project", Boolean(projectColor));
    option.createSpan({
      cls: "belki-project-option-check",
      text: selectedProjectValue === value ? "\u2713" : ""
    });
    if (projectColor) {
      option
        .createSpan({ cls: "belki-project-dot" })
        .setCssStyles({ backgroundColor: projectColor.regular });
    }
    option.createSpan({ cls: "belki-project-option-label", text: label });
    option.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      selectProject(value);
    });
  }

  confirmProjectBtn.addEventListener("click", confirmProject);
  cancelProjectBtn.addEventListener("click", cancelProject);
  customProjectInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); confirmProject(); }
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancelProject(); }
  });
  customProjectInput.addEventListener("input", () => {
    updateProjectDot();
    renderProjectMenu();
  });

  projectPicker.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const shouldOpen = !projectMenu.isConnected;
    options.closePopovers();
    if (shouldOpen) {
      openProjectMenu();
    }
  });

  renderProjectMenu();
  updateProjectDot();

  return {
    close,
    isOpen: () => projectMenu.isConnected,
    getSelectedProject: () => normalizeTaskProject(selectedProjectValue),
    remove: () => {
      projectMenu.remove();
    }
  };
}
