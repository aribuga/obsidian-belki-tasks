import { createBelkiIcon } from "../../ui/components/BelkiIcon";

interface ProjectActionsMenuOptions {
  header: HTMLElement;
  isOpen: boolean;
  onToggle: () => void;
  onMenuCreated: (menu: HTMLElement) => void;
  onRename: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

export function renderProjectActionsMenu(options: ProjectActionsMenuOptions): void {
  const wrapper = options.header.createDiv({ cls: "belki-project-actions-wrap" });
  const button = wrapper.createEl("button", {
    cls: "belki-project-actions-button",
    attr: { type: "button", "aria-label": "Project actions" }
  });
  createBelkiIcon(button, "more");

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    options.onToggle();
  });

  if (!options.isOpen) return;

  // Appended to body so Obsidian panel transforms don't trap it.
  const menu = activeDocument.body.createDiv({ cls: "belki-project-menu" });
  options.onMenuCreated(menu);
  menu.setCssStyles({ visibility: "hidden" });

  const renameItem = menu.createEl("button", {
    cls: "belki-project-option",
    text: "Rename project",
    attr: { type: "button" }
  });
  renameItem.addEventListener("click", (event) => {
    event.stopPropagation();
    options.onRename();
  });

  const archiveItem = menu.createEl("button", {
    cls: "belki-project-option",
    text: "Archive project",
    attr: { type: "button" }
  });
  archiveItem.addEventListener("click", (event) => {
    event.stopPropagation();
    options.onArchive();
  });

  const deleteItem = menu.createEl("button", {
    cls: "belki-project-option is-destructive",
    text: "Delete project",
    attr: { type: "button" }
  });
  deleteItem.addEventListener("click", (event) => {
    event.stopPropagation();
    options.onDelete();
  });

  // Position after browser layout so getBoundingClientRect returns real values.
  window.requestAnimationFrame(() => {
    if (!menu.isConnected) return;
    const btnRect = button.getBoundingClientRect();
    const margin = 8;
    const menuW = menu.offsetWidth || 220;
    const menuH = menu.offsetHeight || 120;

    let left = btnRect.left;
    if (left + menuW > window.innerWidth - margin) {
      left = btnRect.right - menuW;
    }
    const fitsBelow = btnRect.bottom + menuH + margin <= window.innerHeight;
    const fitsAbove = btnRect.top - menuH - margin >= 0;
    if (!fitsBelow && fitsAbove) {
      menu.setCssStyles({
        left: `${Math.max(margin, left)}px`,
        bottom: `${window.innerHeight - btnRect.top + 4}px`,
        visibility: ""
      });
      menu.addClass("is-open-up");
    } else {
      menu.setCssStyles({
        left: `${Math.max(margin, left)}px`,
        top: `${btnRect.bottom + 4}px`,
        visibility: ""
      });
      menu.addClass("is-open-down");
    }
  });
}
