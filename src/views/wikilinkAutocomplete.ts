import { App } from "obsidian";

export function attachWikilinkAutocomplete(textarea: HTMLTextAreaElement, app: App): void {
  let dropdown: HTMLDivElement | null = null;
  let activeIndex = 0;
  let currentMatches: string[] = [];
  let renderItems: (() => void) | null = null;

  const closeDropdown = () => {
    dropdown?.remove();
    dropdown = null;
    currentMatches = [];
    activeIndex = 0;
    renderItems = null;
  };

  const getWikilinkQuery = (): { query: string; bracketStart: number } | null => {
    const pos = textarea.selectionStart ?? 0;
    const textBefore = textarea.value.slice(0, pos);
    const match = /\[\[([^\]\n]*)$/.exec(textBefore);
    if (!match) return null;
    return { query: match[1], bracketStart: pos - match[0].length };
  };

  const insertWikilink = (noteName: string) => {
    const info = getWikilinkQuery();
    if (!info) return;
    const pos = textarea.selectionStart ?? 0;
    const text = textarea.value;
    const wikilink = `[[${noteName}]]`;
    textarea.value = text.slice(0, info.bracketStart) + wikilink + text.slice(pos);
    const newPos = info.bracketStart + wikilink.length;
    textarea.setSelectionRange(newPos, newPos);
    textarea.dispatchEvent(new Event("input"));
    closeDropdown();
    textarea.focus();
  };

  const showDropdown = (matches: string[]) => {
    closeDropdown();
    if (matches.length === 0) return;
    currentMatches = matches;
    activeIndex = 0;

    const rect = textarea.getBoundingClientRect();
    dropdown = document.createElement("div");
    dropdown.className = "belki-wikilink-dropdown";

    // Position below textarea; flip above if not enough space
    const spaceBelow = window.innerHeight - rect.bottom;
    const dropdownMaxHeight = 220;
    if (spaceBelow < dropdownMaxHeight && rect.top > spaceBelow) {
      dropdown.style.bottom = `${window.innerHeight - rect.top + 2}px`;
    } else {
      dropdown.style.top = `${rect.bottom + 2}px`;
    }
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.width = `${rect.width}px`;

    renderItems = () => {
      if (!dropdown) return;
      dropdown.innerHTML = "";
      matches.forEach((name, i) => {
        const item = document.createElement("div");
        item.className = "belki-wikilink-item" + (i === activeIndex ? " is-active" : "");
        const basename = name.includes("/") ? name.split("/").pop()! : name;
        const folder = name.includes("/") ? name.slice(0, name.lastIndexOf("/")) : "";

        const nameSpan = document.createElement("span");
        nameSpan.className = "belki-wikilink-item-name";
        nameSpan.textContent = basename;
        item.appendChild(nameSpan);

        if (folder) {
          const folderSpan = document.createElement("span");
          folderSpan.className = "belki-wikilink-item-folder";
          folderSpan.textContent = folder;
          item.appendChild(folderSpan);
        }

        item.addEventListener("mousedown", (e) => {
          e.preventDefault();
          insertWikilink(name);
        });
        dropdown!.appendChild(item);
        if (i === activeIndex) item.scrollIntoView({ block: "nearest" });
      });
    };

    renderItems();
    document.body.appendChild(dropdown);
  };

  textarea.addEventListener("input", () => {
    const info = getWikilinkQuery();
    if (!info) { closeDropdown(); return; }

    const { query } = info;
    const files = app.vault.getMarkdownFiles();
    const q = query.toLowerCase();
    const matches = files
      .filter(f => !q || f.basename.toLowerCase().includes(q))
      .sort((a, b) => {
        const aStart = a.basename.toLowerCase().startsWith(q);
        const bStart = b.basename.toLowerCase().startsWith(q);
        if (aStart !== bStart) return aStart ? -1 : 1;
        return a.basename.localeCompare(b.basename);
      })
      .slice(0, 10)
      .map(f => f.parent?.path && f.parent.path !== "/" && f.parent.path !== "."
        ? `${f.parent.path}/${f.basename}`
        : f.basename);

    showDropdown(matches);
  });

  textarea.addEventListener("keydown", (e) => {
    if (!dropdown || currentMatches.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, currentMatches.length - 1);
      renderItems?.();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      renderItems?.();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (currentMatches[activeIndex] !== undefined) insertWikilink(currentMatches[activeIndex]);
    } else if (e.key === "Escape") {
      e.stopPropagation();
      closeDropdown();
    }
  });

  textarea.addEventListener("blur", () => {
    setTimeout(() => closeDropdown(), 150);
  });
}
