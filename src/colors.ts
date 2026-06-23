import { normalizeLabelName } from "./labels";

export const BELKI_COLOR_PALETTE = [
  { name: "yellow", regular: "#DFAB00", light: "#FBF3DA" },
  { name: "red", regular: "#E03E3E", light: "#FBE4E3" },
  { name: "purple", regular: "#6940A5", light: "#EAE5F2" },
  { name: "pink", regular: "#AD1A72", light: "#F4DFEB" },
  { name: "orange", regular: "#D9730D", light: "#FAEBDD" },
  { name: "green", regular: "#0E7B6C", light: "#DDEDEA" },
  { name: "gray", regular: "#878B82", light: "#EBECED" },
  { name: "brown", regular: "#64473A", light: "#E9E5DF" },
  { name: "blue", regular: "#0C6E99", light: "#DDEBF1" }
] as const;

export interface BelkiColorPair {
  regular: string;
  light: string;
}

export function colorForName(value: string, override?: string): BelkiColorPair {
  if (override) {
    return {
      regular: override,
      light: lightColorForOverride(override)
    };
  }

  const color = BELKI_COLOR_PALETTE[hashString(value) % BELKI_COLOR_PALETTE.length];
  return {
    regular: color.regular,
    light: color.light
  };
}

export function getProjectColor(
  projectName: string,
  projectColors: Record<string, string>
): BelkiColorPair {
  return colorForName(projectName, projectColors[projectName]);
}

export function getLabelColor(
  labelName: string,
  labelColors: Record<string, string>
): BelkiColorPair {
  const normalized = normalizeLabelName(labelName);
  const direct = labelColors[normalized];
  if (direct) {
    return colorForName(normalized, direct);
  }

  const existing = Object.entries(labelColors).find(
    ([key]) => normalizeLabelName(key) === normalized
  );
  return colorForName(normalized, existing?.[1]);
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = value.charCodeAt(index) + ((hash << 5) - hash);
  }

  return Math.abs(hash);
}

function lightColorForOverride(value: string): string {
  const matchingPaletteColor = BELKI_COLOR_PALETTE.find(
    (color) => color.regular.toLowerCase() === value.toLowerCase()
  );
  if (matchingPaletteColor) {
    return matchingPaletteColor.light;
  }

  const rgb = hexToRgb(value);
  if (!rgb) {
    return value;
  }

  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.14)`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = hex.trim().match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!match) {
    return null;
  }

  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16)
  };
}
