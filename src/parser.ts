import { BelkiTask, ParsedTaskDocument, Priority, PRIORITIES, TaskProperty } from "./types";
import { dedupeLabels } from "./labels";
import { normalizeTaskProject } from "./projects";
import { parseRepeat } from "./repeatUtils";

const TASK_LINE_PATTERN = /^- \[( |x|X)\] (.*)$/;
const PROPERTY_PATTERN = /^\s{2,}([A-Za-z][A-Za-z0-9_-]*)::\s*(.*)$/;
const KNOWN_PROPERTIES = new Set([
  "id",
  "completed",
  "created",
  "due",
  "deadline",
  "project",
  "priority",
  "description",
  "labels",
  "tags",
  "attachments",
  "repeat",
  "completedoccurrences",
  "parentid"
]);

export function parseTasks(markdown: string): BelkiTask[] {
  return parseTaskDocument(markdown).tasks;
}

export function parseTaskDocument(markdown: string, sourcePath?: string): ParsedTaskDocument {
  const lines = markdown === "" ? [] : markdown.split(/\r?\n/);
  const blocks: ParsedTaskDocument["blocks"] = [];
  const tasks: BelkiTask[] = [];
  let rawLines: string[] = [];

  const flushRawLines = () => {
    if (rawLines.length === 0) {
      return;
    }

    blocks.push({ type: "raw", lines: rawLines });
    rawLines = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(TASK_LINE_PATTERN);
    if (!match) {
      rawLines.push(lines[index]);
      continue;
    }

    flushRawLines();

    const propertyLines: string[] = [];
    let cursor = index + 1;
    let inDescriptionBlock = false;
    while (cursor < lines.length) {
      if (TASK_LINE_PATTERN.test(lines[cursor])) {
        break;
      }

      const propertyMatch = lines[cursor].match(PROPERTY_PATTERN);
      if (propertyMatch) {
        propertyLines.push(lines[cursor]);
        inDescriptionBlock =
          propertyMatch[1].toLowerCase() === "description" &&
          (propertyMatch[2].trim() === "" || propertyMatch[2].trim() === "|");
        cursor += 1;
        continue;
      }

      if (inDescriptionBlock && (lines[cursor].startsWith("    ") || lines[cursor].trim() === "")) {
        propertyLines.push(lines[cursor]);
        cursor += 1;
        continue;
      }

      break;
    }

    while (propertyLines.length > 0 && propertyLines[propertyLines.length - 1].trim() === "") {
      propertyLines.pop();
    }

    const { properties, extraProperties } = parseProperties(propertyLines);
    const completed = match[1].toLowerCase() === "x";
    const order = tasks.length;
    const id = properties.id || fallbackId(order, sourcePath);

    tasks.push({
      id,
      title: cleanValue(match[2]) || "Untitled task",
      completed,
      completedDate: completed ? properties.completed : undefined,
      created: properties.created || undefined,
      due: properties.due || undefined,
      deadline: properties.deadline || undefined,
      project: normalizeTaskProject(properties.project),
      priority: parsePriority(properties.priority),
      description: properties.description || undefined,
      labels: parseLabels(properties.labels || properties.tags),
      attachments: parseAttachments(properties.attachments),
      repeat: parseRepeat(properties.repeat),
      completedOccurrences: parseCompletedOccurrences(properties["completedoccurrences"]),
      parentId: properties["parentid"] || undefined,
      extraProperties,
      order
    });
    blocks.push({ type: "task", taskId: id });

    index = cursor - 1;
  }

  flushRawLines();

  return { blocks, tasks };
}

function parseProperties(lines: string[]): {
  properties: Record<string, string>;
  extraProperties: TaskProperty[];
} {
  const properties: Record<string, string> = {};
  const extraProperties: TaskProperty[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(PROPERTY_PATTERN);
    if (!match) {
      continue;
    }

    const name = match[1];
    const normalizedName = name.toLowerCase();
    const value = cleanValue(match[2]);

    if (normalizedName === "description" && (value === "" || value === "|")) {
      const descriptionLines: string[] = [];
      let cursor = index + 1;
      while (cursor < lines.length && !PROPERTY_PATTERN.test(lines[cursor])) {
        const descriptionLine = lines[cursor];
        descriptionLines.push(
          descriptionLine.startsWith("    ")
            ? descriptionLine.slice(4)
            : descriptionLine.trim() === ""
              ? ""
              : descriptionLine
        );
        cursor += 1;
      }

      properties.description = trimMultiline(descriptionLines.join("\n"));
      index = cursor - 1;
      continue;
    }

    if (KNOWN_PROPERTIES.has(normalizedName)) {
      properties[normalizedName] = value;
    } else {
      extraProperties.push({ name, value });
    }
  }

  return { properties, extraProperties };
}

function parsePriority(value: string | undefined): Priority {
  if (value && PRIORITIES.includes(value as Priority)) {
    return value as Priority;
  }

  return "none";
}

function parseLabels(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return dedupeLabels(value
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean));
}

function parseAttachments(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(";")
    .map((attachment) => attachment.trim())
    .map((attachment) => {
      const wikiLink = attachment.match(/^\[\[([^\]]+)\]\]$/);
      return wikiLink ? wikiLink[1].trim() : attachment;
    })
    .filter(Boolean);
}

function parseCompletedOccurrences(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const dates = value.split(",").map((s) => s.trim()).filter(Boolean);
  return dates.length > 0 ? dates : undefined;
}

function cleanValue(value: string): string {
  return value.trim();
}

function trimMultiline(value: string): string {
  return value.replace(/^\s*\n/, "").replace(/\n\s*$/, "");
}

function fallbackId(order: number, sourcePath?: string): string {
  return sourcePath
    ? `task-imported-${sourcePath}-${order + 1}`
    : `task-imported-${order + 1}`;
}
