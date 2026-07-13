export interface DesktopFloatingTaskComposerOptions {
  onClose: () => void;
  renderComposer: (parent: HTMLElement) => void;
}

export function renderDesktopFloatingTaskComposer(
  parent: HTMLElement,
  options: DesktopFloatingTaskComposerOptions
): () => void {
  const backdrop = parent.createDiv({ cls: "belki-floating-composer-backdrop" });
  const card = backdrop.createDiv({
    cls: "belki-floating-composer-card",
    attr: {
      role: "dialog",
      "aria-modal": "false",
      "aria-label": "Add task"
    }
  });
  const body = card.createDiv({ cls: "belki-floating-composer-body" });
  let isClosing = false;

  const close = () => {
    if (isClosing) {
      return;
    }

    isClosing = true;
    options.onClose();
  };

  backdrop.addEventListener("pointerdown", (event) => {
    if (event.target !== backdrop) {
      return;
    }

    event.preventDefault();
    close();
  });

  options.renderComposer(body);

  return () => {
    backdrop.remove();
  };
}
