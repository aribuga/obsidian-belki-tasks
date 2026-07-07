import { displayLabel } from "../../labels";
import { createBelkiIcon } from "../../ui/components/BelkiIcon";

interface LabelActionsMenuOptions {
  parent: HTMLElement;
  label: string;
  isOpen: boolean;
  onToggle: (button: HTMLElement) => void;
  onOpen: (button: HTMLElement) => void;
  onRename: () => void;
  onDelete: () => void;
}

export function renderLabelActionsMenu(options: LabelActionsMenuOptions): void {
  const button = options.parent.createEl("button", {
    cls: "belki-label-actions-button",
    attr: { type: "button", "aria-label": `Actions for ${displayLabel(options.label)}` }
  });
  createBelkiIcon(button, "more");

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    options.onToggle(button);
  });

  if (options.isOpen) options.onOpen(button);
}

interface OpenLabelActionsMenuOptions {
  button: HTMLElement;
  label: string;
  onMenuCreated: (menu: HTMLElement) => void;
  onRename: () => void;
  onDelete: () => void;
}

export function openLabelActionsMenu(options: OpenLabelActionsMenuOptions): void {
  const ownerDocument = options.button.ownerDocument;
  const ownerWindow = ownerDocument.defaultView || window;

  const menu = ownerDocument.body.createDiv({ cls: "belki-project-menu belki-label-menu" });
  options.onMenuCreated(menu);
  menu.setCssStyles({ visibility: "hidden" });

  const renameItem = menu.createEl("button", {
    cls: "belki-project-option belki-label-option",
    text: "Rename label",
    attr: { type: "button" }
  });
  renameItem.addEventListener("click", (event) => {
    event.stopPropagation();
    options.onRename();
  });

  const deleteItem = menu.createEl("button", {
    cls: "belki-project-option belki-label-option is-destructive",
    text: "Delete label",
    attr: { type: "button" }
  });
  deleteItem.addEventListener("click", (event) => {
    event.stopPropagation();
    options.onDelete();
  });

  ownerWindow.requestAnimationFrame(() => {
    if (!menu.isConnected) return;
    const btnRect = options.button.getBoundingClientRect();
    const margin = 8;
    const menuW = menu.offsetWidth || 180;
    const menuH = menu.offsetHeight || 90;

    let left = btnRect.left;
    if (left + menuW > ownerWindow.innerWidth - margin) {
      left = btnRect.right - menuW;
    }
    left = Math.min(
      Math.max(margin, left),
      Math.max(margin, ownerWindow.innerWidth - menuW - margin)
    );

    const fitsBelow = btnRect.bottom + menuH + margin <= ownerWindow.innerHeight;
    const fitsAbove = btnRect.top - menuH - margin >= 0;
    if (!fitsBelow && fitsAbove) {
      menu.setCssStyles({
        left: `${left}px`,
        bottom: `${ownerWindow.innerHeight - btnRect.top + 4}px`,
        visibility: ""
      });
    } else {
      menu.setCssStyles({
        left: `${left}px`,
        top: `${btnRect.bottom + 4}px`,
        visibility: ""
      });
    }
  });
}
