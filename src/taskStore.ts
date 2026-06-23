import { App, normalizePath, TFile } from "obsidian";
import { todayIso } from "./dateUtils";
import { parseTaskDocument } from "./parser";
import { serializeTaskDocument } from "./serializer";
import { BelkiSettings, normalizeDataFolderPath } from "./settings";
import { BelkiTask, CreateTaskInput, ParsedTaskDocument, TaskPatch } from "./types";
import { dedupeLabels } from "./labels";
import { DEMO_MAIN_CONTENT, buildDemoSeedData } from "./demoData";

type Listener = () => void;

const MONTHLY_FILE_PATTERN = /^\d{4}-\d{2}\.md$/;

export class TaskStore {
  private documents = new Map<string, ParsedTaskDocument>();
  private tasks: BelkiTask[] = [];
  private listeners = new Set<Listener>();

  constructor(private app: App, private settings: BelkiSettings) {}

  get filePath(): string {
    return normalizePath(this.settings.tasksFilePath);
  }

  get rootDir(): string {
    return normalizeDataFolderPath(this.settings.dataFolderPath);
  }

  get mainFilePath(): string {
    return normalizePath(`${this.rootDir}/main.md`);
  }

  get dataDir(): string {
    return normalizePath(`${this.rootDir}/Data`);
  }

  get attachmentsDir(): string {
    return normalizePath(`${this.rootDir}/Attachments`);
  }

  isTaskStorageFile(path: string): boolean {
    const normalizedPath = normalizePath(path);
    return (
      normalizedPath === this.filePath ||
      (normalizedPath.startsWith(`${this.dataDir}/`) &&
        MONTHLY_FILE_PATTERN.test(normalizedPath.split("/").pop() || ""))
    );
  }

  getTasks(): BelkiTask[] {
    return this.tasks.map((task) => cloneTask(task));
  }

  getProjects(): string[] {
    const projects = new Set<string>();
    for (const task of this.tasks) {
      projects.add(task.project || "Inbox");
    }

    return [...projects].sort((a, b) => a.localeCompare(b));
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  async load(): Promise<void> {
    await this.ensureTaskStructure();

    const nextDocuments = new Map<string, ParsedTaskDocument>();
    const nextTasks: BelkiTask[] = [];
    let order = 0;

    const files = this.getDataFiles();
    const legacyFile = this.getLegacyTaskFile();
    if (legacyFile && !files.some((file) => file.path === legacyFile.path)) {
      files.push(legacyFile);
    }

    for (const file of files.sort((a, b) => a.path.localeCompare(b.path))) {
      const content = await this.app.vault.read(file);
      const document = parseTaskDocument(content);
      nextDocuments.set(file.path, document);

      for (const task of document.tasks) {
        nextTasks.push({
          ...task,
          created: task.created || todayIso(),
          attachments: [...task.attachments],
          labels: dedupeLabels(task.labels),
          sourcePath: file.path,
          order
        });
        order += 1;
      }
    }

    this.documents = nextDocuments;
    this.tasks = nextTasks;
    this.notify();
  }

  async reloadFromDisk(): Promise<void> {
    await this.load();
  }

  async createTask(input: CreateTaskInput): Promise<void> {
    const title = input.title.trim();
    if (!title) {
      return;
    }

    const created = todayIso();
    const id = createId();
    const sourcePath = this.monthlyPathForDate(created);
    await this.ensureSourceDocument(sourcePath);
    const attachments = normalizeAttachments(input.attachments || []);
    for (const file of input.pendingAttachments || []) {
      const path = await this.copyAttachmentFile(id, file);
      attachments.push(path);
    }

    this.tasks.push({
      id,
      title,
      completed: false,
      created,
      due: normalizeOptional(input.due),
      deadline: normalizeOptional(input.deadline),
      project: normalizeProject(input.project || this.settings.defaultProject),
      priority: input.priority || "none",
      description: normalizeOptional(input.description),
      labels: normalizeLabels(input.labels || []),
      attachments: normalizeAttachments(attachments),
      extraProperties: [],
      order: this.nextOrder(),
      sourcePath
    });

    await this.saveSources([sourcePath]);
  }

  async updateTask(id: string, patch: TaskPatch): Promise<void> {
    const task = this.tasks.find((candidate) => candidate.id === id);
    if (!task) {
      return;
    }

    const sourcePath = task.sourcePath || this.monthlyPathForDate(task.created || todayIso());
    this.tasks = this.tasks.map((candidate) => {
      if (candidate.id !== id) {
        return candidate;
      }

      return {
        ...candidate,
        ...patch,
        created: "created" in patch ? normalizeOptional(patch.created) : candidate.created,
        due: "due" in patch ? normalizeOptional(patch.due) : candidate.due,
        deadline:
          "deadline" in patch ? normalizeOptional(patch.deadline) : candidate.deadline,
        project:
          "project" in patch ? normalizeProject(patch.project) : candidate.project,
        description:
          "description" in patch
            ? normalizeOptional(patch.description)
            : candidate.description,
        labels:
          "labels" in patch ? normalizeLabels(patch.labels || []) : candidate.labels,
        attachments:
          "attachments" in patch
            ? normalizeAttachments(patch.attachments || [])
            : candidate.attachments,
        sourcePath
      };
    });

    await this.saveSources([sourcePath]);
  }

  async toggleComplete(id: string): Promise<void> {
    const task = this.tasks.find((candidate) => candidate.id === id);
    if (!task) {
      return;
    }

    await this.updateTask(id, {
      completed: !task.completed,
      completedDate: task.completed ? undefined : todayIso()
    });
  }

  async deleteTask(id: string): Promise<void> {
    const task = this.tasks.find((candidate) => candidate.id === id);
    if (!task) {
      return;
    }

    const sourcePath = task.sourcePath || this.monthlyPathForDate(task.created || todayIso());
    this.tasks = this.tasks
      .filter((candidate) => candidate.id !== id)
      .map((candidate, index) => ({ ...candidate, order: index }));

    await this.saveSources([sourcePath]);
  }

  async rescheduleOverdueToToday(): Promise<void> {
    const today = todayIso();
    const changedSources = new Set<string>();

    this.tasks = this.tasks.map((task) => {
      if (!task.completed && task.due && task.due < today) {
        changedSources.add(task.sourcePath || this.monthlyPathForDate(task.created || today));
        return { ...task, due: today };
      }

      return task;
    });

    await this.saveSources([...changedSources]);
  }

  async normalizeLabels(): Promise<void> {
    const changedSources = new Set<string>();

    this.tasks = this.tasks.map((task) => {
      changedSources.add(task.sourcePath || this.monthlyPathForDate(task.created || todayIso()));
      return {
        ...task,
        labels: dedupeLabels(task.labels)
      };
    });

    await this.saveSources([...changedSources]);
  }

  async addAttachmentFromFile(taskId: string, file: File): Promise<string | undefined> {
    const task = this.tasks.find((candidate) => candidate.id === taskId);
    if (!task) {
      return undefined;
    }

    const targetPath = await this.copyAttachmentFile(task.id, file);

    await this.updateTask(task.id, {
      attachments: [...task.attachments, targetPath]
    });

    return targetPath;
  }

  private async copyAttachmentFile(taskId: string, file: File): Promise<string> {
    const folderPath = normalizePath(`${this.attachmentsDir}/${taskId}`);
    await this.ensureFolder(folderPath);
    const targetPath = await this.nextAttachmentPath(folderPath, file.name);
    const data = await file.arrayBuffer();
    await this.app.vault.createBinary(targetPath, data);
    return targetPath;
  }

  async migrateOldTaskFile(): Promise<number> {
    const legacyFile = this.getLegacyTaskFile();
    if (!legacyFile) {
      return 0;
    }

    const content = await this.app.vault.read(legacyFile);
    const legacyDocument = parseTaskDocument(content);
    if (legacyDocument.tasks.length === 0) {
      return 0;
    }

    const existingDataIds = new Set(
      this.tasks
        .filter((task) => task.sourcePath !== legacyFile.path)
        .map((task) => task.id)
    );
    const changedSources = new Set<string>();
    let migratedCount = 0;

    for (const task of legacyDocument.tasks) {
      if (existingDataIds.has(task.id)) {
        continue;
      }

      const created = task.created || todayIso();
      const sourcePath = this.monthlyPathForDate(created);
      await this.ensureSourceDocument(sourcePath);
      this.tasks.push({
        ...task,
        created,
        labels: dedupeLabels(task.labels),
        attachments: normalizeAttachments(task.attachments),
        sourcePath,
        order: this.nextOrder()
      });
      changedSources.add(sourcePath);
      migratedCount += 1;
    }

    await this.writeSources([...changedSources]);
    const backupPath = await this.nextBackupPath(legacyFile.path);
    await this.app.vault.rename(legacyFile, backupPath);
    await this.load();

    return migratedCount;
  }

  async resetAndSeedDemoData(): Promise<number> {
    await this.ensureTaskStructure();
    await this.clearDemoWritableData();
    await this.ensureFolder(this.dataDir);
    await this.ensureFolder(this.attachmentsDir);
    await this.replaceFile(this.mainFilePath, DEMO_MAIN_CONTENT);

    const sourcePath = this.monthlyPathForDate(todayIso());
    const seedData = buildDemoSeedData(sourcePath, this.attachmentsDir);

    for (const attachment of seedData.attachments) {
      await this.replaceFile(attachment.path, attachment.content);
    }

    const content = serializeTaskDocument({ blocks: [], tasks: [] }, seedData.tasks);
    await this.replaceFile(sourcePath, content);
    await this.load();

    return seedData.tasks.length;
  }

  private async saveSources(sourcePaths: string[]): Promise<void> {
    await this.writeSources(sourcePaths);
    await this.load();
  }

  private async writeSources(sourcePaths: string[]): Promise<void> {
    for (const sourcePath of dedupeStrings(sourcePaths.filter(Boolean))) {
      await this.ensureSourceDocument(sourcePath);
      const document = this.documents.get(sourcePath) || { blocks: [], tasks: [] };
      const tasks = this.tasks
        .filter((task) => task.sourcePath === sourcePath)
        .map((task) => normalizeTaskForSave(task, sourcePath));
      const content = serializeTaskDocument(document, tasks);
      const file = await this.ensureFile(sourcePath, "");
      await this.app.vault.modify(file, content);
      this.documents.set(sourcePath, parseTaskDocument(content));
    }
  }

  private async ensureTaskStructure(): Promise<void> {
    await this.ensureFolder(this.dataDir);
    await this.ensureFolder(this.attachmentsDir);
    await this.ensureFile(
      this.mainFilePath,
      [
        "# belki",
        "",
        `belki task data is stored in \`${this.dataDir}/*.md\`.`,
        `Attachments are stored in \`${this.attachmentsDir}/<task-id>/\`.`
      ].join("\n")
    );
  }

  private async clearDemoWritableData(): Promise<void> {
    for (const file of this.getDataFiles()) {
      await this.app.fileManager.trashFile(file);
    }

    const attachmentsRoot = this.app.vault.getAbstractFileByPath(this.attachmentsDir);
    if (attachmentsRoot) {
      await this.app.fileManager.trashFile(attachmentsRoot);
    }

    this.documents.clear();
    this.tasks = [];
  }

  private getDataFiles(): TFile[] {
    return this.app.vault
      .getFiles()
      .filter((file) => {
        const path = normalizePath(file.path);
        return path.startsWith(`${this.dataDir}/`) && MONTHLY_FILE_PATTERN.test(file.name);
      })
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  private getLegacyTaskFile(): TFile | null {
    const path = this.filePath;
    if (path.startsWith(`${this.dataDir}/`)) {
      return null;
    }

    const existing = this.app.vault.getAbstractFileByPath(path);
    return existing instanceof TFile ? existing : null;
  }

  private async ensureSourceDocument(sourcePath: string): Promise<void> {
    if (this.documents.has(sourcePath)) {
      return;
    }

    const file = await this.ensureFile(sourcePath, "");
    const content = await this.app.vault.read(file);
    this.documents.set(sourcePath, parseTaskDocument(content));
  }

  private async ensureFile(path: string, content: string): Promise<TFile> {
    const normalizedPath = normalizePath(path);
    const existing = this.app.vault.getAbstractFileByPath(normalizedPath);
    if (existing instanceof TFile) {
      return existing;
    }

    await this.ensureParentFolders(normalizedPath);
    return this.app.vault.create(normalizedPath, content);
  }

  private async replaceFile(path: string, content: string): Promise<TFile> {
    const file = await this.ensureFile(path, "");
    await this.app.vault.modify(file, content);
    return file;
  }

  private async ensureParentFolders(path: string): Promise<void> {
    const parts = normalizePath(path).split("/");
    parts.pop();

    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      await this.ensureFolder(current);
    }
  }

  private async ensureFolder(path: string): Promise<void> {
    const normalizedPath = normalizePath(path);
    if (this.app.vault.getAbstractFileByPath(normalizedPath)) {
      return;
    }

    await this.ensureParentFolders(normalizedPath);
    await this.app.vault.createFolder(normalizedPath);
  }

  private async nextAttachmentPath(folderPath: string, filename: string): Promise<string> {
    const safeName = sanitizeFilename(filename);
    const extensionStart = safeName.lastIndexOf(".");
    const base =
      extensionStart > 0 ? safeName.slice(0, extensionStart) : safeName;
    const extension = extensionStart > 0 ? safeName.slice(extensionStart) : "";

    let candidate = normalizePath(`${folderPath}/${safeName}`);
    let index = 2;
    while (this.app.vault.getAbstractFileByPath(candidate)) {
      candidate = normalizePath(`${folderPath}/${base}-${index}${extension}`);
      index += 1;
    }

    return candidate;
  }

  private async nextBackupPath(path: string): Promise<string> {
    const normalizedPath = normalizePath(path);
    const extensionStart = normalizedPath.lastIndexOf(".md");
    const base =
      extensionStart > -1 ? normalizedPath.slice(0, extensionStart) : normalizedPath;

    let candidate = `${base}.migrated-backup.md`;
    let index = 2;
    while (this.app.vault.getAbstractFileByPath(candidate)) {
      candidate = `${base}.migrated-backup-${index}.md`;
      index += 1;
    }

    return candidate;
  }

  private nextOrder(): number {
    if (this.tasks.length === 0) {
      return 0;
    }

    return Math.max(...this.tasks.map((task) => task.order)) + 1;
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private monthlyPathForDate(value: string): string {
    const month = /^\d{4}-\d{2}/.test(value) ? value.slice(0, 7) : todayIso().slice(0, 7);
    return normalizePath(`${this.dataDir}/${month}.md`);
  }
}

function normalizeTaskForSave(task: BelkiTask, sourcePath: string): BelkiTask {
  return {
    ...task,
    created: normalizeOptional(task.created) || todayIso(),
    project: normalizeProject(task.project),
    labels: dedupeLabels(task.labels),
    attachments: normalizeAttachments(task.attachments),
    sourcePath
  };
}

function normalizeProject(value: string | undefined): string {
  const project = value?.trim().replace(/^>+\s*/, "");
  return project || "Inbox";
}

function normalizeOptional(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function normalizeLabels(labels: string[]): string[] {
  return dedupeLabels(labels);
}

function normalizeAttachments(attachments: string[]): string[] {
  return dedupeStrings(attachments.map((attachment) => attachment.trim()).filter(Boolean));
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function sanitizeFilename(filename: string): string {
  const clean = filename.replace(/[\\/:*?"<>|]/g, "-").trim();
  return clean || "attachment";
}

function createId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `task-${timestamp}-${random}`;
}

function cloneTask(task: BelkiTask): BelkiTask {
  return {
    ...task,
    labels: [...task.labels],
    attachments: [...task.attachments],
    extraProperties: task.extraProperties.map((property) => ({ ...property }))
  };
}
