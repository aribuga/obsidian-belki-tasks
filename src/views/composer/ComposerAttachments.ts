import { createBelkiIcon } from "../../ui/components/BelkiIcon";

export interface ComposerAttachmentsOptions {
  chipRow: HTMLElement;
  form: HTMLElement;
}

export interface ComposerAttachmentsController {
  getPendingAttachments: () => File[];
}

export function renderComposerAttachments(
  options: ComposerAttachmentsOptions
): ComposerAttachmentsController {
  let pendingAttachments: File[] = [];

  const attachmentButton = createAttachmentButton(options.chipRow);
  const attachmentInput = options.chipRow.createEl("input", {
    cls: "is-hidden",
    attr: {
      type: "file",
      multiple: "true"
    }
  });
  const pendingAttachmentsEl = options.form.createDiv({
    cls: "belki-composer-attachments is-hidden"
  });

  const renderPendingAttachments = () => {
    pendingAttachmentsEl.empty();
    pendingAttachmentsEl.toggleClass("is-hidden", pendingAttachments.length === 0);

    for (const [index, file] of pendingAttachments.entries()) {
      const item = pendingAttachmentsEl.createDiv({ cls: "belki-composer-attachment" });
      createBelkiIcon(item, isImageFile(file) ? "attachment" : "file", {
        className: "belki-composer-attachment-icon"
      });
      item.createDiv({ cls: "belki-composer-attachment-name", text: file.name });
      const removeButton = item.createEl("button", {
        cls: "belki-composer-attachment-remove",
        attr: {
          type: "button",
          "aria-label": `Remove ${file.name}`
        }
      });
      createBelkiIcon(removeButton, "close");
      removeButton.addEventListener("click", () => {
        pendingAttachments = pendingAttachments.filter((_, candidateIndex) => candidateIndex !== index);
        renderPendingAttachments();
      });
    }
  };

  attachmentButton.addEventListener("click", () => {
    attachmentInput.click();
  });
  attachmentInput.addEventListener("change", () => {
    pendingAttachments = [
      ...pendingAttachments,
      ...Array.from(attachmentInput.files || [])
    ];
    attachmentInput.value = "";
    renderPendingAttachments();
  });

  return {
    getPendingAttachments: () => pendingAttachments
  };
}

function createAttachmentButton(parent: HTMLElement): HTMLButtonElement {
  const button = parent.createEl("button", {
    cls: "belki-chip-button",
    attr: {
      type: "button"
    }
  });

  createBelkiIcon(button, "paperclip", { className: "belki-chip-icon" });
  button.createSpan({ cls: "belki-chip-label", text: "Attachment" });

  return button;
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name);
}
