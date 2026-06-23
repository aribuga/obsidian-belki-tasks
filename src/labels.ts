export function normalizeLabelName(label: string): string {
  return label
    .trim()
    .replace(/^#+\s*/, "")
    .toLocaleLowerCase("tr")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function displayLabel(label: string): string {
  const normalized = normalizeLabelName(label);
  return normalized ? `#${normalized}` : "#";
}

export function dedupeLabels(labels: string[]): string[] {
  const seen = new Set<string>();
  const normalizedLabels: string[] = [];

  for (const label of labels) {
    const normalized = normalizeLabelName(label);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    normalizedLabels.push(normalized);
  }

  return normalizedLabels;
}
