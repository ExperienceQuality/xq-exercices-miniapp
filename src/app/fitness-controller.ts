import type { FitnessDependencies } from './dependencies';
import type { FitnessDocumentV2, RoutineV2 } from '../fitness/domain/model';
import { FitnessError, messages } from '../fitness/domain/errors';
import {
  createRoutine,
  addSession,
  renameSession,
  deleteSession,
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
  private busy = false;

  constructor(private readonly deps: FitnessDependencies) {}

  async load() {
    this.status = 'loading';
    this.error = '';
    this.notice = '';
    try {
      const loaded = await this.deps.repository.load();
      this.document = loaded.document as FitnessDocumentV2;
      this.revision = loaded.storageRevision;
      this.status = 'ready';
    } catch (error) {
      this.status = 'unavailable';
      this.error = safeError(error);
    }
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
  }
  selectSession(id: string) {
    this.selectedSessionId = id;
  }
  backToList() {
    this.selectedRoutineId = null;
    this.selectedSessionId = null;
    this.editor = null;
  }
  openEditor(
    kind: Exclude<EditorKind, null>,
    exerciseId: string | null = null,
  ) {
    this.editor = kind;
    this.editingExerciseId = exerciseId;
    this.error = '';
  }
  closeEditor() {
    this.editor = null;
    this.editingExerciseId = null;
    this.error = '';
  }

  private async commit(candidate: FitnessDocumentV2) {
    if (this.busy) return;
    this.busy = true;
    this.error = '';
    try {
      const result = await this.deps.repository.commit(
        this.revision,
        candidate,
      );
      this.document = candidate;
      this.revision = result.storageRevision;
    } catch (error) {
      this.error = safeError(error);
      throw error;
    } finally {
      this.busy = false;
    }
  }

  async saveRoutine(name: string, notes: string) {
    const candidate = createRoutine(
      this.document,
      { name, notes },
      this.deps.ids,
    );
    await this.commit(candidate);
    this.selectRoutine(candidate.routines.at(-1)!.id);
    this.closeEditor();
  }
  async saveSession(name: string) {
    if (!this.routine) throw missing('routine');
    const candidate = addSession(
      this.document,
      this.routine.id,
      name,
      this.deps.ids,
    );
    await this.commit(candidate);
    this.selectedSessionId =
      candidate.routines.find((r) => r.id === this.routine?.id)?.sessions.at(-1)
        ?.id ?? null;
    this.closeEditor();
  }
  async renameSelectedSession(name: string) {
    if (!this.routine || !this.session) throw missing('session');
    await this.commit(
      renameSession(this.document, this.routine.id, this.session.id, name),
    );
    this.closeEditor();
  }
  async removeSession() {
    if (!this.routine || !this.session) throw missing('session');
    await this.commit(
      deleteSession(this.document, this.routine.id, this.session.id),
    );
    this.selectedSessionId = null;
  }
  async saveExercise(input: ExerciseInput) {
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
  }
  async removeExercise(id: string) {
    if (!this.routine || !this.session) throw missing('session');
    await this.commit(
      deleteExercise(this.document, this.routine.id, this.session.id, id),
    );
  }
  async snapshot() {
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
  }
  async importFile(file: File | undefined) {
    if (!file) return;
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
      this.notice = 'Fitness data imported.';
    } catch (error) {
      this.error = safeError(error);
    }
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
