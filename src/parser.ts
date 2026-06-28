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
  "completedoccurrences"
]);

export function parseTasks(markdown: string): BelkiTask[] {
  return parseTaskDocument(markdown).tasks;
}

export function parseTaskDocument(markdown: string): ParsedTaskDocument {
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
    while (cursor < lines.length && PROPERTY_PATTERN.test(lines[cursor])) {
      propertyLines.push(lines[cursor]);
      cursor += 1;
    }

    const { properties, extraProperties } = parseProperties(propertyLines);
    const completed = match[1].toLowerCase() === "x";
    const order = tasks.length;
    const id = properties.id || fallbackId(order);

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

  for (const line of lines) {
    const match = line.match(PROPERTY_PATTERN);
    if (!match) {
      continue;
    }

    const name = match[1];
    const normalizedName = name.toLowerCase();
    const value = cleanValue(match[2]);

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

function fallbackId(order: number): string {
  return `task-imported-${order + 1}`;
}
