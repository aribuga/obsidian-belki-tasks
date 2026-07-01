import { BelkiTask, ParsedTaskDocument } from "./types";
import { dedupeLabels } from "./labels";
import { normalizeTaskProject } from "./projects";
import { serializeRepeat } from "./repeatUtils";

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

export function serializeTasks(tasks: BelkiTask[]): string {
  return [...tasks]
    .sort((a, b) => a.order - b.order)
    .map(serializeTask)
    .join("\n\n");
}

export function serializeTaskDocument(
  document: ParsedTaskDocument,
  tasks: BelkiTask[]
): string {
  const orderedTasks = [...tasks].sort((a, b) => a.order - b.order);
  const tasksById = new Map(orderedTasks.map((task) => [task.id, task]));
  const serializedTaskIds = new Set<string>();
  const outputLines: string[] = [];

  for (const block of document.blocks) {
    if (block.type === "raw") {
      outputLines.push(...block.lines);
      continue;
    }

    const task = tasksById.get(block.taskId);
    if (!task) {
      continue;
    }

    outputLines.push(...serializeTaskLines(task));
    serializedTaskIds.add(task.id);
  }

  for (const task of orderedTasks) {
    if (serializedTaskIds.has(task.id)) {
      continue;
    }

    if (outputLines.length > 0 && outputLines[outputLines.length - 1] !== "") {
      outputLines.push("");
    }
    outputLines.push(...serializeTaskLines(task));
  }

  return outputLines.join("\n");
}

function serializeTask(task: BelkiTask): string {
  return serializeTaskLines(task).join("\n");
}

function serializeTaskLines(task: BelkiTask): string[] {
  const lines = [`- [${task.completed ? "x" : " "}] ${singleLine(task.title)}`];

  lines.push(`  id:: ${singleLine(task.id)}`);

  if (task.completed && task.completedDate) {
    lines.push(`  completed:: ${singleLine(task.completedDate)}`);
  }

  if (task.created) {
    lines.push(`  created:: ${singleLine(task.created)}`);
  }

  if (task.due) {
    lines.push(`  due:: ${singleLine(task.due)}`);
  }

  if (task.deadline) {
    lines.push(`  deadline:: ${singleLine(task.deadline)}`);
  }

  if (task.repeat) {
    lines.push(`  repeat:: ${serializeRepeat(task.repeat)}`);
  }

  if (task.completedOccurrences && task.completedOccurrences.length > 0) {
    lines.push(`  completedOccurrences:: ${task.completedOccurrences.join(", ")}`);
  }

  if (task.parentId) {
    lines.push(`  parentId:: ${singleLine(task.parentId)}`);
  }

  const project = normalizeTaskProject(task.project);
  if (project) {
    lines.push(`  project:: ${singleLine(project)}`);
  }
  lines.push(`  priority:: ${singleLine(task.priority || "none")}`);

  const descriptionLines = serializeDescriptionLines(task.description);
  if (descriptionLines.length > 0) {
    lines.push(...descriptionLines);
  }

  const labels = dedupeLabels(task.labels);
  if (labels.length > 0) {
    lines.push(`  labels:: ${labels.map(singleLine).join(", ")}`);
  }

  if (task.attachments.length > 0) {
    const attachments = task.attachments
      .map(singleLine)
      .filter(Boolean)
      .map((path) => `[[${path}]]`);
    if (attachments.length > 0) {
      lines.push(`  attachments:: ${attachments.join("; ")}`);
    }
  }

  for (const property of task.extraProperties) {
    if (KNOWN_PROPERTIES.has(property.name.toLowerCase())) {
      continue;
    }

    lines.push(`  ${singleLine(property.name)}:: ${singleLine(property.value)}`);
  }

  return lines;
}

function singleLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function serializeDescriptionLines(description: string | undefined): string[] {
  const value = description?.trim();
  if (!value) {
    return [];
  }

  if (!value.includes("\n")) {
    return [`  description:: ${singleLine(value)}`];
  }

  return [
    "  description:: |",
    ...value.split(/\r?\n/).map((line) => (line ? `    ${line}` : ""))
  ];
}
