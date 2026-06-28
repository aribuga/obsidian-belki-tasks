/**
 * Parses #label and //project tokens from a raw title string.
 * Rules:
 *   - #label must be a standalone word (whitespace-delimited)
 *   - First char after # must be a letter (not digit → avoids #123)
 *   - //project must be a standalone word
 * Returns cleaned title (tokens removed) plus extracted labels/project.
 */
export function parseQuickAddTokens(raw: string): {
  title: string;
  labels: string[];
  project: string | null;
} {
  const labelRe = /^#([^\d\s#][^\s]*)$/;
  const projectRe = /^\/\/(\S+)$/;
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  const titleParts: string[] = [];
  const labels: string[] = [];
  let project: string | null = null;

  for (const part of parts) {
    const lm = part.match(labelRe);
    const pm = part.match(projectRe);
    if (lm) {
      labels.push(lm[1]);
    } else if (pm) {
      project = pm[1];
    } else {
      titleParts.push(part);
    }
  }

  return { title: titleParts.join(" "), labels, project };
}

// ─── Autocomplete ────────────────────────────────────────────────────────────

type TokenInfo = {
  type: "label" | "project";
  query: string;
  start: number;
  end: number;
};

function getActiveToken(input: HTMLInputElement): TokenInfo | null {
  const pos = input.selectionStart ?? 0;
  const text = input.value;
  let start = pos;
  while (start > 0 && !/\s/.test(text[start - 1])) start--;
  let end = pos;
  while (end < text.length && !/\s/.test(text[end])) end++;
  const word = text.slice(start, end);

  if (word === "#" || /^#[^\d\s#]/.test(word)) {
    return { type: "label", query: word.slice(1), start, end };
  }
  if (word === "//" || /^\/\//.test(word)) {
    return { type: "project", query: word.slice(2), start, end };
  }
  return null;
}

function completeToken(input: HTMLInputElement, token: TokenInfo, value: string): void {
  const prefix = token.type === "label" ? "#" : "//";
  const text = input.value;
  const completed = prefix + value;
  input.value = text.slice(0, token.start) + completed + text.slice(token.end);
  const newPos = token.start + completed.length;
  input.setSelectionRange(newPos, newPos);
  input.dispatchEvent(new Event("input"));
}

export function attachQuickAddAutocomplete(
  input: HTMLInputElement,
  getLabels: () => string[],
  getProjects: () => string[]
): void {
  let dropdown: HTMLDivElement | null = null;
  let activeIndex = 0;
  let currentMatches: string[] = [];
  let currentToken: TokenInfo | null = null;
  let renderItems: (() => void) | null = null;

  const closeDropdown = () => {
    dropdown?.remove();
    dropdown = null;
    currentMatches = [];
    currentToken = null;
    activeIndex = 0;
    renderItems = null;
  };

  const insertMatch = (value: string) => {
    if (!currentToken) return;
    completeToken(input, currentToken, value);
    closeDropdown();
    input.focus();
  };

  const showDropdown = (token: TokenInfo, matches: string[]) => {
    closeDropdown();
    if (matches.length === 0) return;
    currentToken = token;
    currentMatches = matches;
    activeIndex = 0;

    const rect = input.getBoundingClientRect();
    dropdown = document.createElement("div");
    dropdown.className = "belki-wikilink-dropdown";
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.top = `${rect.bottom + 2}px`;
    dropdown.style.width = `${Math.max(rect.width, 200)}px`;

    renderItems = () => {
      if (!dropdown) return;
      dropdown.innerHTML = "";
      matches.forEach((m, i) => {
        const item = document.createElement("div");
        item.className = "belki-wikilink-item" + (i === activeIndex ? " is-active" : "");
        const prefix = token.type === "label" ? "#" : "//";
        item.textContent = prefix + m;
        item.addEventListener("mousedown", (e) => {
          e.preventDefault();
          insertMatch(m);
        });
        dropdown!.appendChild(item);
        if (i === activeIndex) item.scrollIntoView({ block: "nearest" });
      });
    };
    renderItems();
    document.body.appendChild(dropdown);
  };

  input.addEventListener("input", () => {
    const token = getActiveToken(input);
    if (!token) { closeDropdown(); return; }

    const q = token.query.toLowerCase();
    let source: string[];
    if (token.type === "label") {
      source = getLabels();
    } else {
      source = getProjects();
    }

    const matches = source
      .filter(s => !q || s.toLowerCase().includes(q))
      .sort((a, b) => {
        const aStart = a.toLowerCase().startsWith(q);
        const bStart = b.toLowerCase().startsWith(q);
        if (aStart !== bStart) return aStart ? -1 : 1;
        return a.localeCompare(b);
      })
      .slice(0, 10);

    showDropdown(token, matches);
  });

  input.addEventListener("keydown", (e) => {
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
      if (currentMatches[activeIndex] !== undefined) insertMatch(currentMatches[activeIndex]);
    } else if (e.key === "Escape") {
      e.stopPropagation();
      closeDropdown();
    }
  });

  input.addEventListener("blur", () => {
    setTimeout(() => closeDropdown(), 150);
  });
}
