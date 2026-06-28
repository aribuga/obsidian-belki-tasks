import { App, Modal, setIcon } from "obsidian";
import { RepeatEndsType, RepeatFrequency, RepeatMode, RepeatRule } from "../types";
import { getRepeatLabel } from "../repeatUtils";

const FREQ_LABELS: Record<RepeatFrequency, string> = {
  daily: "Day",
  weekly: "Week",
  weekdays: "Weekday",
  monthly: "Month",
  yearly: "Year"
};

export class CustomRepeatModal extends Modal {
  private draft: RepeatRule;
  private onSave: (rule: RepeatRule) => void;

  constructor(app: App, current: RepeatRule | undefined, onSave: (rule: RepeatRule) => void) {
    super(app);
    this.onSave = onSave;
    this.draft = current
      ? { ...current }
      : { frequency: "weekly", interval: 1, mode: "scheduledDate", ends: "never" };
  }

  onOpen(): void {
    this.titleEl.setText("Custom repeat");
    this.modalEl.addClass("belki-custom-repeat-modal");
    this.render();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();

    // Based on
    this.renderSection(contentEl, "Based on");
    const modeWrap = contentEl.createDiv({ cls: "belki-repeat-radio-group" });
    this.renderRadio(modeWrap, "Scheduled date", this.draft.mode === "scheduledDate", () => {
      this.draft.mode = "scheduledDate";
      this.render();
    });
    this.renderRadio(modeWrap, "Completed date", this.draft.mode === "completedDate", () => {
      this.draft.mode = "completedDate";
      this.render();
    });

    // Every
    this.renderSection(contentEl, "Every");
    const everyRow = contentEl.createDiv({ cls: "belki-repeat-every-row" });
    const intervalInput = everyRow.createEl("input", {
      cls: "belki-repeat-interval-input",
      attr: { type: "number", min: "1", step: "1", value: String(this.draft.interval) }
    });
    intervalInput.addEventListener("input", () => {
      const v = parseInt(intervalInput.value);
      if (v >= 1 && Number.isInteger(v)) {
        this.draft.interval = v;
      }
    });
    intervalInput.addEventListener("blur", () => {
      const v = parseInt(intervalInput.value);
      this.draft.interval = (v >= 1 && Number.isInteger(v)) ? v : 1;
      intervalInput.value = String(this.draft.interval);
    });

    const freqSelect = everyRow.createEl("select", { cls: "belki-repeat-freq-select" });
    const freqs: RepeatFrequency[] = ["daily", "weekly", "weekdays", "monthly", "yearly"];
    for (const f of freqs) {
      freqSelect.createEl("option", { value: f, text: FREQ_LABELS[f] });
    }
    freqSelect.value = this.draft.frequency;
    freqSelect.addEventListener("change", () => {
      this.draft.frequency = freqSelect.value as RepeatFrequency;
      this.render();
    });

    // Ends
    this.renderSection(contentEl, "Ends");
    const endsWrap = contentEl.createDiv({ cls: "belki-repeat-radio-group" });

    this.renderRadio(endsWrap, "Never", this.draft.ends === "never", () => {
      this.draft.ends = "never";
      this.draft.endsDate = undefined;
      this.draft.endsCount = undefined;
      this.render();
    });

    const onDateRow = endsWrap.createDiv({ cls: "belki-repeat-ends-row" });
    this.renderRadio(onDateRow, "On date", this.draft.ends === "onDate", () => {
      this.draft.ends = "onDate";
      this.draft.endsCount = undefined;
      this.render();
    });
    if (this.draft.ends === "onDate") {
      const dateInput = onDateRow.createEl("input", {
        cls: "belki-repeat-ends-date",
        attr: { type: "date", value: this.draft.endsDate || "" }
      });
      dateInput.addEventListener("change", () => {
        this.draft.endsDate = dateInput.value || undefined;
      });
    }

    const afterRow = endsWrap.createDiv({ cls: "belki-repeat-ends-row" });
    this.renderRadio(afterRow, "After", this.draft.ends === "afterOccurrences", () => {
      this.draft.ends = "afterOccurrences";
      this.draft.endsDate = undefined;
      this.render();
    });
    if (this.draft.ends === "afterOccurrences") {
      const countInput = afterRow.createEl("input", {
        cls: "belki-repeat-ends-count",
        attr: { type: "number", min: "1", step: "1", value: String(this.draft.endsCount || 1) }
      });
      countInput.addEventListener("input", () => {
        const v = parseInt(countInput.value);
        if (v >= 1) this.draft.endsCount = v;
      });
      afterRow.createSpan({ cls: "belki-repeat-ends-label", text: "occurrences" });
    }

    // Preview
    const preview = contentEl.createDiv({ cls: "belki-repeat-preview" });
    const previewIcon = preview.createSpan({ cls: "belki-chip-icon" });
    setIcon(previewIcon, "repeat");
    preview.createSpan({ text: getRepeatLabel(this.draft) });

    // Actions
    const actions = contentEl.createDiv({ cls: "belki-repeat-modal-actions" });
    const cancelBtn = actions.createEl("button", { cls: "belki-button", text: "Cancel", attr: { type: "button" } });
    const saveBtn = actions.createEl("button", { cls: "belki-button belki-button-primary", text: "Save", attr: { type: "button" } });

    cancelBtn.addEventListener("click", () => this.close());
    saveBtn.addEventListener("click", () => {
      const v = parseInt(intervalInput.value);
      this.draft.interval = (v >= 1 && Number.isInteger(v)) ? v : 1;
      this.onSave({ ...this.draft });
      this.close();
    });
  }

  private renderSection(parent: HTMLElement, title: string): void {
    parent.createEl("h3", { cls: "belki-repeat-section-title", text: title });
  }

  private renderRadio(parent: HTMLElement, label: string, checked: boolean, onClick: () => void): HTMLElement {
    const row = parent.createDiv({ cls: `belki-repeat-radio-row${checked ? " is-checked" : ""}` });
    const dot = row.createDiv({ cls: "belki-repeat-radio-dot" });
    if (checked) dot.addClass("is-active");
    row.createSpan({ text: label });
    row.addEventListener("click", onClick);
    return row;
  }
}
