import { App, Modal, TFile } from "obsidian";

export class ImagePreviewModal extends Modal {
  private handleEscape = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    this.close();
  };

  constructor(
    app: App,
    private file: TFile,
    private label: string
  ) {
    super(app);
  }

  onOpen(): void {
    document.body.classList.add("belki-image-preview-open");
    this.containerEl.addClass("belki-image-lightbox-backdrop");
    this.modalEl.addClass("belki-image-lightbox-modal");
    this.modalEl.addEventListener("keydown", this.handleEscape, true);
    this.contentEl.empty();
    this.contentEl.addClass("belki-image-lightbox-content");

    this.modalEl.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    this.containerEl.addEventListener("click", (event) => {
      if (event.target === this.containerEl) {
        event.preventDefault();
        event.stopPropagation();
        this.close();
      }
    });

    const shell = this.contentEl.createDiv({ cls: "belki-image-lightbox-shell" });

    shell.createEl("img", {
      cls: "belki-image-lightbox-img",
      attr: {
        src: this.app.vault.getResourcePath(this.file),
        alt: this.label
      }
    });

    shell
      .createEl("button", {
        cls: "belki-image-lightbox-close",
        text: "×",
        attr: {
          type: "button",
          "aria-label": "Close image preview"
        }
      })
      .addEventListener("click", () => this.close());
  }

  onClose(): void {
    document.body.classList.remove("belki-image-preview-open");
    this.modalEl.removeEventListener("keydown", this.handleEscape, true);
  }
}
