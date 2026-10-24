import type { FitnessDependencies } from './dependencies';
import type { FitnessDocumentV2, RoutineV2 } from '../fitness/domain/model';
import { FitnessError, messages } from '../fitness/domain/errors';
import {
  createRoutine,
  addSession,
  renameSession,
  deleteSession,
  reorderSessions as reorderSessionsCommand,
  reorderExercises as reorderExercisesCommand,
  addExercise,
  editExercise,
  deleteExercise,
  captureSnapshot,
  type ExerciseInput,
} from '../fitness/domain/commands';
import { importFitnessDocument } from '../fitness/import/import-fitness-document';

export type ControllerStatus = 'loading' | 'ready' | 'unavailable';
export type EditorKind = 'routine' | 'session' | 'exercise' | null;

export class FitnessController {
  status: ControllerStatus = 'loading';
  document: FitnessDocumentV2 = { schemaVersion: 2, routines: [] };
  revision = 0;
  error = '';
  notice = '';
  selectedRoutineId: string | null = null;
  selectedSessionId: string | null = null;
  editor: EditorKind = null;
  editingExerciseId: string | null = null;
  reorderPending = false;
  private mutationChain: Promise<void> = Promise.resolve();
  private readonly listeners = new Set<() => void>();
  private loadCompletion?: Promise<void>;

  constructor(private readonly deps: FitnessDependencies) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const listener of this.listeners) listener();
  }

  load(): Promise<void> {
    this.loadCompletion = this.loadInternal();
    return this.loadCompletion;
  }

  private async loadInternal() {
    this.status = 'loading';
    this.error = '';
    this.notice = '';
    try {
      const loaded = await this.deps.repository.load();
      this.document = loaded.document as FitnessDocumentV2;
      this.revision = loaded.storageRevision;
      this.status = 'ready';
      this.notify();
    } catch (error) {
      this.status = 'unavailable';
      this.error = safeError(error);
      this.notify();
    }
  }

  private async waitForLoad() {
    await this.loadCompletion;
    if (this.status === 'unavailable') {
      throw new FitnessError('storage-unavailable', this.error);
    }
  }

  private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.mutationChain.then(operation, operation);
    this.mutationChain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  get routine(): RoutineV2 | undefined {
    return this.document.routines.find(
      (item) => item.id === this.selectedRoutineId,
    );
  }
  get session() {
    return this.routine?.sessions.find(
      (item) => item.id === this.selectedSessionId,
    );
  }

  selectRoutine(id: string) {
    this.selectedRoutineId = id;
    this.selectedSessionId =
      this.document.routines.find((r) => r.id === id)?.sessions[0]?.id ?? null;
    this.notify();
  }
  selectSession(id: string) {
    this.selectedSessionId = id;
    this.notify();
  }
  deselectSession() {
    this.selectedSessionId = null;
    this.notify();
  }
  backToList() {
    this.selectedRoutineId = null;
    this.selectedSessionId = null;
    this.editor = null;
    this.notify();
  }
  openEditor(
    kind: Exclude<EditorKind, null>,
    exerciseId: string | null = null,
  ) {
    this.editor = kind;
    this.editingExerciseId = exerciseId;
    this.error = '';
    this.notify();
  }
  closeEditor() {
    this.editor = null;
    this.editingExerciseId = null;
    this.error = '';
    this.notify();
  }

  private async commit(candidate: FitnessDocumentV2) {
    this.error = '';
    try {
      const result = await this.deps.repository.commit(
        this.revision,
        candidate,
      );
      this.document = candidate;
      this.revision = result.storageRevision;
      this.notify();
    } catch (error) {
      this.error = safeError(error);
      this.notify();
      throw error;
    }
  }

  async saveRoutine(name: string, notes: string) {
    return this.enqueueMutation(async () => {
      await this.waitForLoad();
      const candidate = createRoutine(
        this.document,
        { name, notes },
        this.deps.ids,
      );
      await this.commit(candidate);
      this.selectRoutine(candidate.routines.at(-1)!.id);
      this.closeEditor();
    });
  }
  async saveSession(name: string) {
    return this.enqueueMutation(async () => {
      await this.waitForLoad();
      if (!this.routine) throw missing('routine');
      const candidate = addSession(
        this.document,
        this.routine.id,
        name,
        this.deps.ids,
      );
      await this.commit(candidate);
      this.selectedSessionId =
        candidate.routines
          .find((r) => r.id === this.routine?.id)
          ?.sessions.at(-1)?.id ?? null;
      this.closeEditor();
    });
  }
  async renameSelectedSession(name: string) {
    return this.enqueueMutation(async () => {
      await this.waitForLoad();
      if (!this.routine || !this.session) throw missing('session');
      await this.commit(
        renameSession(this.document, this.routine.id, this.session.id, name),
      );
      this.closeEditor();
    });
  }
  async reorderSessions(
    routineId: string,
    sessionIds: readonly string[],
  ): Promise<void> {
    // Reorders are never queued behind each other: a second call while a
    // save is pending is suppressed even if the selected routine changed.
    if (this.reorderPending) return;
    this.reorderPending = true;
    this.notify();
    // Snapshot the caller's array: the candidate is built when the queue
    // reaches it, so it must not observe later caller-side edits.
    const queuedIds = [...sessionIds];
    try {
      await this.enqueueMutation(async () => {
        await this.waitForLoad();
        const candidate = reorderSessionsCommand(
          this.document,
          routineId,
          queuedIds,
        );
        if (candidate === this.document) return;
        await this.commit(candidate);
      });
    } catch (error) {
      // commit() already surfaced repository failures; validation, missing
      // routine, and other command-time errors need the same treatment.
      this.error = safeError(error);
      this.notify();
      throw error;
    } finally {
      this.reorderPending = false;
      this.notify();
    }
  }
  async reorderExercises(
    routineId: string,
    sessionId: string,
    exerciseIds: readonly string[],
  ): Promise<void> {
    // Shares the global reorder gate with reorderSessions: a second
    // reorder on either list while a save is pending is suppressed.
    if (this.reorderPending) return;
    this.reorderPending = true;
    this.notify();
    // Snapshot the caller's array: the candidate is built when the queue
    // reaches it, so it must not observe later caller-side edits.
    const queuedIds = [...exerciseIds];
    try {
      await this.enqueueMutation(async () => {
        await this.waitForLoad();
        const candidate = reorderExercisesCommand(
          this.document,
          routineId,
          sessionId,
          queuedIds,
        );
        if (candidate === this.document) return;
        await this.commit(candidate);
      });
    } catch (error) {
      // commit() already surfaced repository failures; validation, missing
      // parents, and other command-time errors need the same treatment.
      this.error = safeError(error);
      this.notify();
      throw error;
    } finally {
      this.reorderPending = false;
      this.notify();
    }
  }
  async removeSession() {
    return this.enqueueMutation(async () => {
      await this.waitForLoad();
      if (!this.routine || !this.session) throw missing('session');
      await this.commit(
        deleteSession(this.document, this.routine.id, this.session.id),
      );
      this.selectedSessionId = null;
      this.notify();
    });
  }
  async saveExercise(input: ExerciseInput) {
    return this.enqueueMutation(async () => {
      await this.waitForLoad();
      if (!this.routine || !this.session) throw missing('session');
      const candidate = this.editingExerciseId
        ? editExercise(
            this.document,
            this.routine.id,
            this.session.id,
            this.editingExerciseId,
            input,
          )
        : addExercise(
            this.document,
            this.routine.id,
            this.session.id,
            input,
            this.deps.ids,
          );
      await this.commit(candidate);
      this.closeEditor();
    });
  }
  async removeExercise(id: string) {
    return this.enqueueMutation(async () => {
      await this.waitForLoad();
      if (!this.routine || !this.session) throw missing('session');
      await this.commit(
        deleteExercise(this.document, this.routine.id, this.session.id, id),
      );
    });
  }
  async snapshot() {
    return this.enqueueMutation(async () => {
      await this.waitForLoad();
      if (!this.routine) throw missing('routine');
      await this.commit(
        captureSnapshot(
          this.document,
          this.routine.id,
          this.deps.ids,
          this.deps.clock,
        ),
      );
      this.notice = 'Progress snapshot captured.';
      this.notify();
    });
  }
  async importFile(file: File | undefined) {
    if (!file) return;
    return this.enqueueMutation(async () => {
      await this.waitForLoad();
      this.notice = '';
      try {
        const result = await importFitnessDocument(
          await this.deps.importFileReader.readText(file),
          this.deps.ids,
          this.revision,
          (revision, candidate) =>
            this.deps.repository.commit(revision, candidate),
        );
        this.document = result.document;
        this.revision = result.storageRevision;
        this.selectedRoutineId = null;
        this.selectedSessionId = null;
        this.error = '';
        this.notice = 'Fitness data imported.';
        this.notify();
      } catch (error) {
        this.notice = '';
        this.error = safeError(error);
        this.notify();
      }
    });
  }
}

function missing(type: 'routine' | 'session') {
  return new FitnessError(
    type === 'routine' ? 'missing-routine' : 'missing-session',
    type === 'routine' ? messages.missingRoutine : messages.missingSession,
  );
}
function safeError(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'Fitness data is unavailable.';
}
