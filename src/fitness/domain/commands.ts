import type { Clock, IdGenerator } from '../../app/dependencies';
import { FitnessError } from './errors';
import type {
  ExerciseV2,
  FitnessDocumentV2,
  RoutineV2,
  TrainingSessionV2,
} from './model';
import {
  applyMutation,
  requireExercise,
  requireRoutine,
  requireSession,
  type FitnessMutation,
} from './mutations';
import { buildSnapshot } from './snapshots';
import { normalizeName, normalizeNotes, validateMetrics } from './validation';

export interface ExerciseInput {
  readonly name: string;
  readonly sets: number;
  readonly repetitions: number;
  readonly weightKg: number;
}

export interface CommandResult {
  readonly document: FitnessDocumentV2;
  readonly mutation: FitnessMutation;
}

function exercise(input: ExerciseInput, id: string): ExerciseV2 {
  const name = normalizeName(input.name);
  validateMetrics(input.sets, input.repetitions, input.weightKg);
  return {
    id,
    name,
    sets: input.sets,
    repetitions: input.repetitions,
    weightKg: input.weightKg,
  };
}

function run(
  document: FitnessDocumentV2,
  mutation: FitnessMutation,
): CommandResult {
  return { document: applyMutation(document, mutation), mutation };
}

export function createRoutine(
  document: FitnessDocumentV2,
  input: { readonly name: string; readonly notes?: string | null },
  ids: IdGenerator,
): CommandResult {
  const notes = normalizeNotes(input.notes);
  const routine: RoutineV2 = {
    id: ids.next(),
    name: normalizeName(input.name),
    ...(notes ? { notes } : {}),
    sessions: [],
    snapshots: [],
  };
  return run(document, { kind: 'create-routine', routine });
}

export function addSession(
  document: FitnessDocumentV2,
  routineId: string,
  name: string,
  ids: IdGenerator,
): CommandResult {
  const routine = requireRoutine(document, routineId);
  const maximum = routine.sessions.reduce(
    (value, session) => Math.max(value, session.order),
    0,
  );
  if (maximum >= Number.MAX_SAFE_INTEGER) {
    throw new FitnessError(
      'validation',
      'Training session order is exhausted.',
    );
  }
  const session: TrainingSessionV2 = {
    id: ids.next(),
    name: normalizeName(name),
    order: maximum + 1,
    exercises: [],
  };
  return run(document, { kind: 'add-session', routineId, session });
}

export function renameSession(
  document: FitnessDocumentV2,
  routineId: string,
  sessionId: string,
  name: string,
): CommandResult {
  requireSession(requireRoutine(document, routineId), sessionId);
  return run(document, {
    kind: 'rename-session',
    routineId,
    sessionId,
    name: normalizeName(name),
  });
}

export function reorderSessions(
  document: FitnessDocumentV2,
  routineId: string,
  sessionIds: readonly string[],
): CommandResult {
  return run(document, { kind: 'reorder-sessions', routineId, sessionIds });
}

export function deleteSession(
  document: FitnessDocumentV2,
  routineId: string,
  sessionId: string,
): CommandResult {
  return run(document, { kind: 'delete-session', routineId, sessionId });
}

export function addExercise(
  document: FitnessDocumentV2,
  routineId: string,
  sessionId: string,
  input: ExerciseInput,
  ids: IdGenerator,
): CommandResult {
  requireSession(requireRoutine(document, routineId), sessionId);
  return run(document, {
    kind: 'add-exercise',
    routineId,
    sessionId,
    exercise: exercise(input, ids.next()),
  });
}

export function reorderExercises(
  document: FitnessDocumentV2,
  routineId: string,
  sessionId: string,
  exerciseIds: readonly string[],
): CommandResult {
  return run(document, {
    kind: 'reorder-exercises',
    routineId,
    sessionId,
    exerciseIds,
  });
}

export function editExercise(
  document: FitnessDocumentV2,
  routineId: string,
  sessionId: string,
  exerciseId: string,
  input: ExerciseInput,
): CommandResult {
  requireExercise(
    requireSession(requireRoutine(document, routineId), sessionId),
    exerciseId,
  );
  return run(document, {
    kind: 'update-exercise',
    routineId,
    sessionId,
    exercise: exercise(input, exerciseId),
  });
}

export function deleteExercise(
  document: FitnessDocumentV2,
  routineId: string,
  sessionId: string,
  exerciseId: string,
): CommandResult {
  return run(document, {
    kind: 'delete-exercise',
    routineId,
    sessionId,
    exerciseId,
  });
}

export function captureSnapshot(
  document: FitnessDocumentV2,
  routineId: string,
  ids: IdGenerator,
  clock: Clock,
): CommandResult {
  const routine = requireRoutine(document, routineId);
  return run(document, {
    kind: 'capture-snapshot',
    routineId,
    snapshot: buildSnapshot(routine, ids, clock),
  });
}
