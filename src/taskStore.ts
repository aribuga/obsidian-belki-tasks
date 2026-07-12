import { App, normalizePath, Notice, TAbstractFile, TFile, TFolder } from "obsidian";
import { formatDueDateChip, todayIso } from "./dateUtils";
import { parseTaskDocument } from "./parser";
import { serializeTaskDocument } from "./serializer";
import { isRepeatEnded, nextOccurrence } from "./repeatUtils";
import { BelkiSettings, normalizeDataFolderPath } from "./settings";
import { BelkiTask, CreateTaskInput, ParsedTaskDocument, TaskPatch } from "./types";
import { dedupeLabels, normalizeLabelName } from "./labels";
import { DEMO_MAIN_CONTENT, buildDemoSeedData } from "./demoData";
import { normalizeTaskProject } from "./projects";
import {
  attachmentPathCandidate,
  numberedAttachmentPathCandidate,
  retryAttachmentFilename,
  splitAttachmentFilename
} from "./storage/attachmentPaths";
import {
  attachmentsDirForRoot,
  dataDirForRoot,
  isMonthlyDataFileName,
  isMonthlyDataFilePath,
  legacyBackupPathCandidate,
  mainFilePathForRoot,
  monthlyDataFilePath,
  taskAttachmentFolderPath
} from "./storage/storagePaths";

type Listener = () => void;

export class TaskStore {
  private documents = new Map<string, ParsedTaskDocument>();
  private tasks: BelkiTask[] = [];
  private listeners = new Set<Listener>();
  private warnedStorageIssues = new Set<string>();
  private writingPaths = new Set<string>();

  constructor(private app: App, private settings: BelkiSettings) {}

  get filePath(): string {
    return normalizePath(this.settings.tasksFilePath);
  }

  get rootDir(): string {
    return normalizeDataFolderPath(this.settings.dataFolderPath);
  }

  get mainFilePath(): string {
    return mainFilePathForRoot(this.rootDir);
  }

  get dataDir(): string {
    return dataDirForRoot(this.rootDir);
  }

  get attachmentsDir(): string {
    return attachmentsDirForRoot(this.rootDir);
  }

  isCurrentlyWriting(path: string): boolean {
    return this.writingPaths.has(normalizePath(path));
  }

  isTaskStorageFile(path: string): boolean {
    const normalizedPath = normalizePath(path);
    return (
      normalizedPath === this.filePath ||
      isMonthlyDataFilePath(this.dataDir, normalizedPath)
    );
  }

  getTasks(): BelkiTask[] {
    return this.tasks.map((task) => cloneTask(task));
  }

  getCompletedTasksForDate(date: string): BelkiTask[] {
    const seen = new Set<string>();
    const completed: BelkiTask[] = [];

    for (const task of this.tasks) {
      const completedOnDate =
        task.completedDate === date ||
        Boolean(task.completedOccurrences?.includes(date));
      if (!completedOnDate || seen.has(task.id)) {
        continue;
      }

      seen.add(task.id);
      completed.push(cloneTask(task));
    }

    return completed.sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  getProjects(): string[] {
    const projects = new Set<string>();
    for (const task of this.tasks) {
      const project = normalizeTaskProject(task.project);
      if (project) {
        projects.add(project);
      }
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
    console.debug("[belki] Loading task storage.", {
      rootDir: this.rootDir,
      dataDir: this.dataDir,
      attachmentsDir: this.attachmentsDir,
      mainFilePath: this.mainFilePath
    });
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
      const document = parseTaskDocument(content, file.path);
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
    const sourceReady = await this.ensureSourceDocument(sourcePath);
    if (!sourceReady) {
      new Notice("belki could not create the task data file. Check the console for details.");
      return;
    }
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
      project: normalizeTaskProject(input.project),
      priority: input.priority || "P4",
      description: normalizeOptional(input.description),
      labels: normalizeLabels(input.labels || []),
      attachments: normalizeAttachments(attachments),
      repeat: input.repeat,
      parentId: input.parentId,
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
          "project" in patch ? normalizeTaskProject(patch.project) : candidate.project,
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

    // Recurring task: advance due date instead of marking completed
    if (task.repeat && !task.completed) {
      const today = todayIso();
      const fromDate = task.repeat.mode === "completedDate" ? today : (task.due || today);
      const nextDue = nextOccurrence(task.repeat, fromDate);
      const occurrences = [...(task.completedOccurrences || []), today];

      if (isRepeatEnded(task.repeat, occurrences.length, nextDue)) {
        // Repeat is done — mark as normally completed
        await this.updateTask(id, {
          completedOccurrences: occurrences,
          repeat: undefined,
          completed: true,
          completedDate: today
        });
      } else {
        await this.updateTask(id, {
          completedOccurrences: occurrences,
          due: nextDue
        });
        new Notice(`Recurring task rescheduled to ${formatDueDateChip(nextDue)}`);
      }
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

  async reorderSubTask(
    taskId: string,
    targetTaskId: string,
    placement: "before" | "after"
  ): Promise<void> {
    if (taskId === targetTaskId) {
      return;
    }

    const dragged = this.tasks.find((candidate) => candidate.id === taskId);
    const target = this.tasks.find((candidate) => candidate.id === targetTaskId);
    if (!dragged || !target || !dragged.parentId || dragged.parentId !== target.parentId) {
      return;
    }

    const siblings = this.tasks
      .filter((candidate) => candidate.parentId === dragged.parentId)
      .sort((a, b) => a.order - b.order);
    const reorderedSiblings = siblings.filter((candidate) => candidate.id !== dragged.id);
    const targetIndex = reorderedSiblings.findIndex((candidate) => candidate.id === target.id);
    if (targetIndex === -1) {
      return;
    }

    reorderedSiblings.splice(
      placement === "after" ? targetIndex + 1 : targetIndex,
      0,
      dragged
    );

    const siblingIds = new Set(siblings.map((candidate) => candidate.id));
    const orderedTasks = [...this.tasks].sort((a, b) => a.order - b.order);
    const firstSiblingIndex = orderedTasks.findIndex((candidate) => siblingIds.has(candidate.id));
    const withoutSiblings = orderedTasks.filter((candidate) => !siblingIds.has(candidate.id));
    const insertIndex =
      firstSiblingIndex === -1
        ? withoutSiblings.length
        : Math.min(firstSiblingIndex, withoutSiblings.length);
    withoutSiblings.splice(insertIndex, 0, ...reorderedSiblings);

    const changedSources = new Set<string>();
    this.tasks = withoutSiblings.map((task, index) => {
      if (task.order !== index) {
        changedSources.add(task.sourcePath || this.monthlyPathForDate(task.created || todayIso()));
      }

      return { ...task, order: index };
    });

    for (const sourcePath of changedSources) {
      this.reorderDocumentBlocksForSource(sourcePath);
    }

    await this.saveSources([...changedSources]);
  }

  async renameProject(oldName: string, newName: string): Promise<void> {
    const changedSources = new Set<string>();
    this.tasks = this.tasks.map((task) => {
      if (normalizeTaskProject(task.project) !== oldName) return task;
      const sourcePath = task.sourcePath || this.monthlyPathForDate(task.created || todayIso());
      changedSources.add(sourcePath);
      return { ...task, project: newName, sourcePath };
    });
    await this.saveSources([...changedSources]);
  }

  async deleteProject(name: string): Promise<void> {
    const changedSources = new Set<string>();
    this.tasks = this.tasks.map((task) => {
      if (normalizeTaskProject(task.project) !== name) return task;
      const sourcePath = task.sourcePath || this.monthlyPathForDate(task.created || todayIso());
      changedSources.add(sourcePath);
      return { ...task, project: undefined, sourcePath };
    });
    await this.saveSources([...changedSources]);
  }

  async renameLabel(oldLabel: string, newLabel: string): Promise<void> {
    const oldNormalized = normalizeLabelName(oldLabel);
    const newNormalized = normalizeLabelName(newLabel);
    if (!oldNormalized || !newNormalized || oldNormalized === newNormalized) {
      return;
    }

    const changedSources = new Set<string>();
    this.tasks = this.tasks.map((task) => {
      if (!task.labels.some((label) => normalizeLabelName(label) === oldNormalized)) {
        return task;
      }

      const sourcePath = task.sourcePath || this.monthlyPathForDate(task.created || todayIso());
      changedSources.add(sourcePath);
      return {
        ...task,
        labels: dedupeLabels(
          task.labels.map((label) =>
            normalizeLabelName(label) === oldNormalized ? newNormalized : label
          )
        ),
        sourcePath
      };
    });

    await this.saveSources([...changedSources]);
  }

  async deleteLabel(label: string): Promise<void> {
    const normalized = normalizeLabelName(label);
    if (!normalized) {
      return;
    }

    const changedSources = new Set<string>();
    this.tasks = this.tasks.map((task) => {
      if (!task.labels.some((candidate) => normalizeLabelName(candidate) === normalized)) {
        return task;
      }

      const sourcePath = task.sourcePath || this.monthlyPathForDate(task.created || todayIso());
      changedSources.add(sourcePath);
      return {
        ...task,
        labels: task.labels.filter((candidate) => normalizeLabelName(candidate) !== normalized),
        sourcePath
      };
    });

    await this.saveSources([...changedSources]);
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
    const folderPath = taskAttachmentFolderPath(this.attachmentsDir, taskId);
    const folderReady = await this.ensureFolder(folderPath);
    if (!folderReady) {
      throw new Error(`belki cannot use attachment folder: ${folderPath}`);
    }
    const data = await file.arrayBuffer();
    return this.createUniqueBinaryFile(folderPath, file.name, data);
  }

  async migrateOldTaskFile(): Promise<number> {
    const legacyFile = this.getLegacyTaskFile();
    if (!legacyFile) {
      return 0;
    }

    const content = await this.app.vault.read(legacyFile);
    const legacyDocument = parseTaskDocument(content, legacyFile.path);
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
      const sourceReady = await this.ensureSourceDocument(sourcePath);
      if (!sourceReady) {
        continue;
      }
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
      if (!file) {
        continue;
      }
      this.writingPaths.add(normalizePath(sourcePath));
      try {
        await this.app.vault.modify(file, content);
      } finally {
        this.writingPaths.delete(normalizePath(sourcePath));
      }
      this.documents.set(sourcePath, parseTaskDocument(content, sourcePath));
    }
  }

  private reorderDocumentBlocksForSource(sourcePath: string): void {
    const document = this.documents.get(sourcePath);
    if (!document) {
      return;
    }

    const existingBlockIds = new Set(
      document.blocks
        .filter((block) => block.type === "task")
        .map((block) => block.taskId)
    );
    const orderedTaskIds = this.tasks
      .filter((task) => task.sourcePath === sourcePath && existingBlockIds.has(task.id))
      .sort((a, b) => a.order - b.order)
      .map((task) => task.id);

    let cursor = 0;
    this.documents.set(sourcePath, {
      ...document,
      blocks: document.blocks.map((block) => {
        if (block.type !== "task") {
          return block;
        }

        const taskId = orderedTaskIds[cursor];
        cursor += 1;
        return taskId ? { type: "task", taskId } : block;
      })
    });
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
        return path.startsWith(`${this.dataDir}/`) && isMonthlyDataFileName(file.name);
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

  private async ensureSourceDocument(sourcePath: string): Promise<boolean> {
    if (this.documents.has(sourcePath)) {
      return true;
    }

    const file = await this.ensureFile(sourcePath, "");
    if (!file) {
      this.documents.set(sourcePath, { blocks: [], tasks: [] });
      return false;
    }
    const content = await this.app.vault.read(file);
    this.documents.set(sourcePath, parseTaskDocument(content, sourcePath));
    return true;
  }

  private async ensureFile(path: string, content: string): Promise<TFile | null> {
    const normalizedPath = normalizePath(path);
    const existing = this.app.vault.getAbstractFileByPath(normalizedPath);
    if (existing instanceof TFile) {
      return existing;
    }
    if (existing) {
      this.warnWrongType(normalizedPath, "file", existing);
      return null;
    }

    const parentReady = await this.ensureParentFolders(normalizedPath);
    if (!parentReady) {
      return null;
    }

    try {
      return await this.app.vault.create(normalizedPath, content);
    } catch (error) {
      if (!isAlreadyExistsError(error)) {
        throw error;
      }

      const created = this.app.vault.getAbstractFileByPath(normalizedPath);
      if (created instanceof TFile) {
        return created;
      }
      if (created) {
        this.warnWrongType(normalizedPath, "file", created);
        return null;
      }

      console.warn("[belki] File already exists but is not available in the vault index yet.", error, {
        path: normalizedPath
      });
      return null;
    }
  }

  private async replaceFile(path: string, content: string): Promise<TFile> {
    const file = await this.ensureFile(path, "");
    if (!file) {
      throw new Error(`belki cannot write file because the path is unavailable: ${path}`);
    }
    await this.app.vault.modify(file, content);
    return file;
  }

  private async ensureParentFolders(path: string): Promise<boolean> {
    const parts = normalizePath(path).split("/");
    parts.pop();

    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      const ready = await this.ensureFolder(current);
      if (!ready) {
        return false;
      }
    }

    return true;
  }

  private async ensureFolder(path: string): Promise<boolean> {
    const normalizedPath = normalizePath(path);
    const existing = this.app.vault.getAbstractFileByPath(normalizedPath);
    if (existing instanceof TFolder) {
      return true;
    }
    if (existing) {
      this.warnWrongType(normalizedPath, "folder", existing);
      return false;
    }

    const parentReady = await this.ensureParentFolders(normalizedPath);
    if (!parentReady) {
      return false;
    }

    try {
      await this.app.vault.createFolder(normalizedPath);
      return true;
    } catch (error) {
      if (!isAlreadyExistsError(error)) {
        throw error;
      }

      const created = this.app.vault.getAbstractFileByPath(normalizedPath);
      if (created instanceof TFolder) {
        return true;
      }
      if (created) {
        this.warnWrongType(normalizedPath, "folder", created);
        return false;
      }

      console.warn("[belki] Folder already exists but is not available in the vault index yet.", error, {
        path: normalizedPath
      });
      return true;
    }
  }

  private async createUniqueBinaryFile(
    folderPath: string,
    filename: string,
    data: ArrayBuffer
  ): Promise<string> {
    const filenameParts = splitAttachmentFilename(filename);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const targetPath =
        attempt === 0
          ? await this.nextAttachmentPath(folderPath, filename)
          : await this.nextAttachmentPath(
            folderPath,
            retryAttachmentFilename(filenameParts, attempt, Date.now())
          );
      try {
        await this.app.vault.createBinary(targetPath, data);
        return targetPath;
      } catch (error) {
        if (isAlreadyExistsError(error)) {
          continue;
        }

        throw error;
      }
    }

    throw new Error(`belki could not create a unique attachment path for ${filename}`);
  }

  private warnWrongType(
    path: string,
    expectedType: "file" | "folder",
    existing: TAbstractFile
  ): void {
    const key = `${expectedType}:${path}`;
    if (this.warnedStorageIssues.has(key)) {
      return;
    }

    this.warnedStorageIssues.add(key);
    const actualType = existing instanceof TFolder ? "folder" : "file";
    const message = `belki expected a ${expectedType} at "${path}", but found a ${actualType}.`;
    new Notice(`${message} Please rename or move the conflicting vault item.`);
    console.warn("[belki] Storage path type mismatch.", {
      path,
      expectedType,
      actualType,
      existing
    });
  }

  private async nextAttachmentPath(folderPath: string, filename: string): Promise<string> {
    const { base, extension } = splitAttachmentFilename(filename);

    let candidate = attachmentPathCandidate(folderPath, filename);
    let index = 2;
    while (this.app.vault.getAbstractFileByPath(candidate)) {
      candidate = numberedAttachmentPathCandidate(folderPath, base, index, extension);
      index += 1;
    }

    return candidate;
  }

  private async nextBackupPath(path: string): Promise<string> {
    let candidate = legacyBackupPathCandidate(path, 1);
    let index = 2;
    while (this.app.vault.getAbstractFileByPath(candidate)) {
      candidate = legacyBackupPathCandidate(path, index);
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
    return monthlyDataFilePath(this.dataDir, value);
  }
}

function normalizeTaskForSave(task: BelkiTask, sourcePath: string): BelkiTask {
  return {
    ...task,
    created: normalizeOptional(task.created) || todayIso(),
    project: normalizeTaskProject(task.project),
    labels: dedupeLabels(task.labels),
    attachments: normalizeAttachments(task.attachments),
    sourcePath
  };
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

function isAlreadyExistsError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /already exists|EEXIST/i.test(message);
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
