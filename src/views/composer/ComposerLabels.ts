import { getLabelColor } from "../../colors";
import { dedupeLabels, displayLabel, normalizeLabelName } from "../../labels";
import { createBelkiIcon } from "../../ui/components/BelkiIcon";

export interface ComposerLabelsOptions {
  chipRow: HTMLElement;
  form: HTMLElement;
  labels: string[];
  labelColors: Record<string, string>;
  closePopovers: () => void;
  onEnsureLabel: (label: string) => void;
  watchPopover: (wrapper: HTMLElement, popover: HTMLElement) => void;
}

export interface ComposerLabelsController {
  close: () => void;
  isOpen: () => boolean;
  getSelectedLabels: () => string[];
}

export function renderComposerLabels(options: ComposerLabelsOptions): ComposerLabelsController {
  let selectedLabels: string[] = [];
  let activeLabelSuggestionIndex = -1;
  let labelSuggestionActions: Array<{
    element: HTMLButtonElement;
    action: () => void;
  }> = [];

  const labelsWrap = options.chipRow.createDiv({ cls: "belki-composer-labels-wrap" });
  const labelsButton = createLabelsButton(labelsWrap);
  const labelsPanel = labelsWrap.createDiv({ cls: "belki-composer-popover is-hidden" });
  const selectedLabelsEl = labelsPanel.createDiv({ cls: "belki-selected-labels" });
  const labelInput = labelsPanel.createEl("input", {
    cls: "belki-label-input",
    attr: {
      type: "text",
      placeholder: "#label"
    }
  });
  const labelSuggestions = labelsPanel.createDiv({
    cls: "belki-label-suggestions",
    attr: { role: "listbox" }
  });

  const labelChipsRow = options.form.createDiv({ cls: "belki-composer-label-chips is-hidden" });

  const updateActiveLabelSuggestion = () => {
    labelSuggestionActions.forEach((suggestion, index) => {
      const isActive = index === activeLabelSuggestionIndex;
      suggestion.element.toggleClass("is-active", isActive);
      suggestion.element.setAttr("aria-selected", String(isActive));
    });
  };

  const resetActiveLabelSuggestion = () => {
    activeLabelSuggestionIndex = -1;
    updateActiveLabelSuggestion();
  };

  const close = () => {
    resetActiveLabelSuggestion();
    labelsPanel.addClass("is-hidden");
  };

  const keepLabelInputVisible = () => {
    const ownerWindow = labelInput.ownerDocument.defaultView || window;
    const scrollIntoView = () => {
      labelInput.scrollIntoView({
        block: "center",
        inline: "nearest",
        behavior: "smooth"
      });
    };

    ownerWindow.setTimeout(scrollIntoView, 80);
    ownerWindow.setTimeout(scrollIntoView, 320);
    ownerWindow.setTimeout(scrollIntoView, 650);
  };

  const addLabel = (value: string) => {
    const label = normalizeLabelName(value);
    if (!label || selectedLabels.includes(label)) {
      labelInput.value = "";
      resetActiveLabelSuggestion();
      renderLabels();
      return;
    }

    selectedLabels = [...selectedLabels, label];
    options.onEnsureLabel(label);
    labelInput.value = "";
    resetActiveLabelSuggestion();
    renderLabels();
  };

  const renderLabels = () => {
    selectedLabelsEl.empty();
    labelChipsRow.empty();
    labelChipsRow.toggleClass("is-hidden", selectedLabels.length === 0);

    for (const label of selectedLabels) {
      const color = getLabelColor(label, options.labelColors);
      const removeLabel = () => {
        selectedLabels = selectedLabels.filter((candidate) => candidate !== label);
        renderLabels();
      };

      const chip = selectedLabelsEl.createEl("button", {
        cls: "belki-selected-label",
        text: displayLabel(label),
        attr: { type: "button" }
      });
      chip.setCssStyles({ backgroundColor: color.light, borderColor: color.light });
      chip.addEventListener("click", removeLabel);

      const externalChip = labelChipsRow.createEl("span", {
        cls: "belki-label-chip",
        attr: { "aria-label": `Remove label ${displayLabel(label)}` }
      });
      externalChip.setCssProps({ "--belki-label-chip-color": color.regular, "--belki-label-chip-bg": color.light });
      createBelkiIcon(externalChip, "tag", { className: "belki-chip-icon" });
      externalChip.createSpan({ cls: "belki-label-chip-name", text: displayLabel(label) });
      const removeBtn = externalChip.createEl("button", {
        cls: "belki-label-chip-remove",
        attr: { type: "button", "aria-label": `Remove ${displayLabel(label)}` }
      });
      createBelkiIcon(removeBtn, "close", { className: "belki-chip-icon" });
      removeBtn.addEventListener("click", removeLabel);
    }

    labelSuggestions.empty();
    labelSuggestionActions = [];
    activeLabelSuggestionIndex = -1;
    const query = normalizeLabelName(labelInput.value);
    if (!query) {
      labelSuggestions.createDiv({
        cls: "belki-label-empty",
        text: "Type a label name"
      });
      return;
    }

    const matches = dedupeLabels(options.labels)
      .filter((label) => label.includes(query) && !selectedLabels.includes(label))
      .slice(0, 8);

    const addLabelSuggestion = (text: string, action: () => void) => {
      const suggestion = labelSuggestions.createEl("button", {
        cls: "belki-label-suggestion",
        text,
        attr: {
          type: "button",
          role: "option",
          "aria-selected": "false"
        }
      });
      suggestion.addEventListener("click", action);
      labelSuggestionActions.push({ element: suggestion, action });
    };

    for (const label of matches) {
      addLabelSuggestion(displayLabel(label), () => addLabel(label));
    }

    if (!dedupeLabels(options.labels).includes(query) && !selectedLabels.includes(query)) {
      addLabelSuggestion(`Create label: ${displayLabel(query)}`, () => addLabel(query));
    }
  };

  labelsButton.addEventListener("click", () => {
    const shouldOpen = labelsPanel.hasClass("is-hidden");
    options.closePopovers();
    if (shouldOpen) {
      resetActiveLabelSuggestion();
      labelsPanel.removeClass("is-hidden");
      options.watchPopover(labelsWrap, labelsPanel);
      labelInput.focus();
      keepLabelInputVisible();
    }
  });

  labelInput.addEventListener("focus", () => {
    if (!labelInput.value) {
      labelInput.value = "#";
    }
    keepLabelInputVisible();
  });
  labelInput.addEventListener("input", () => {
    if (labelInput.value && !labelInput.value.startsWith("#")) {
      labelInput.value = `#${labelInput.value}`;
    }
    resetActiveLabelSuggestion();
    renderLabels();
  });
  labelInput.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (labelSuggestionActions.length === 0) {
        return;
      }

      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      activeLabelSuggestionIndex = activeLabelSuggestionIndex === -1
        ? (direction === 1 ? 0 : labelSuggestionActions.length - 1)
        : (activeLabelSuggestionIndex + direction + labelSuggestionActions.length) %
          labelSuggestionActions.length;
      updateActiveLabelSuggestion();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const activeSuggestion = labelSuggestionActions[activeLabelSuggestionIndex];
      if (activeSuggestion) {
        activeSuggestion.action();
        return;
      }

      addLabel(labelInput.value);
    }
    if (event.key === "Escape") {
      options.closePopovers();
    }
  });
  renderLabels();

  return {
    close,
    isOpen: () => !labelsPanel.hasClass("is-hidden"),
    getSelectedLabels: () => selectedLabels
  };
}

function createLabelsButton(parent: HTMLElement): HTMLButtonElement {
  const button = parent.createEl("button", {
    cls: "belki-chip-button",
    attr: {
      type: "button"
    }
  });

  createBelkiIcon(button, "tag", { className: "belki-chip-icon" });
  button.createSpan({ cls: "belki-chip-label", text: "Labels" });

  return button;
}
