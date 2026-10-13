import type { Clock, IdGenerator } from '../../app/dependencies';
import { FitnessError, messages } from './errors';
import type { ExerciseV2, FitnessDocumentV2, RoutineV2 } from './model';
import { captureRoutineSnapshot } from './snapshots';
import { normalizeName, normalizeNotes, validateMetrics } from './validation';

export interface ExerciseInput {
  readonly name: string;
  readonly sets: number;
  readonly repetitions: number;
  readonly weightKg: number;
}

function routineAt(document: FitnessDocumentV2, routineId: string): number {
  const index = document.routines.findIndex(
    (routine) => routine.id === routineId,
  );
  if (index < 0)
    throw new FitnessError('missing-routine', messages.missingRoutine);
  return index;
}

function replaceRoutine(
  document: FitnessDocumentV2,
  index: number,
  routine: RoutineV2,
): FitnessDocumentV2 {
  return {
    ...document,
    routines: document.routines.map((current, position) =>
      position === index ? routine : current,
    ),
  };
}

function sessionAt(routine: RoutineV2, sessionId: string): number {
  const index = routine.sessions.findIndex(
    (session) => session.id === sessionId,
  );
  if (index < 0)
    throw new FitnessError('missing-session', messages.missingSession);
  return index;
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

export function createRoutine(
  document: FitnessDocumentV2,
  input: { readonly name: string; readonly notes?: string | null },
  ids: IdGenerator,
): FitnessDocumentV2 {
  const notes = normalizeNotes(input.notes);
  const routine: RoutineV2 = {
    id: ids.next(),
    name: normalizeName(input.name),
    ...(notes ? { notes } : {}),
    sessions: [],
    snapshots: [],
  };
  return { ...document, routines: [...document.routines, routine] };
}

export function addSession(
  document: FitnessDocumentV2,
  routineId: string,
  name: string,
  ids: IdGenerator,
): FitnessDocumentV2 {
  const index = routineAt(document, routineId);
  const routine = document.routines[index]!;
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
  return replaceRoutine(document, index, {
    ...routine,
    sessions: [
      ...routine.sessions,
      {
        id: ids.next(),
        name: normalizeName(name),
        order: maximum + 1,
        exercises: [],
      },
    ],
  });
}

export function renameSession(
  document: FitnessDocumentV2,
  routineId: string,
  sessionId: string,
  name: string,
): FitnessDocumentV2 {
  const routineIndex = routineAt(document, routineId);
  const routine = document.routines[routineIndex]!;
  const sessionIndex = sessionAt(routine, sessionId);
  return replaceRoutine(document, routineIndex, {
    ...routine,
    sessions: routine.sessions.map((session, index) =>
      index === sessionIndex
        ? { ...session, name: normalizeName(name) }
        : session,
    ),
  });
}

export function deleteSession(
  document: FitnessDocumentV2,
  routineId: string,
  sessionId: string,
): FitnessDocumentV2 {
  const routineIndex = routineAt(document, routineId);
  const routine = document.routines[routineIndex]!;
  const sessionIndex = sessionAt(routine, sessionId);
  return replaceRoutine(document, routineIndex, {
    ...routine,
    sessions: routine.sessions.filter((_, index) => index !== sessionIndex),
  });
}

export function addExercise(
  document: FitnessDocumentV2,
  routineId: string,
  sessionId: string,
  input: ExerciseInput,
  ids: IdGenerator,
): FitnessDocumentV2 {
  const routineIndex = routineAt(document, routineId);
  const routine = document.routines[routineIndex]!;
  const sessionIndex = sessionAt(routine, sessionId);
  return replaceRoutine(document, routineIndex, {
    ...routine,
    sessions: routine.sessions.map((session, index) =>
      index === sessionIndex
        ? {
            ...session,
            exercises: [...session.exercises, exercise(input, ids.next())],
          }
        : session,
    ),
  });
}

export function editExercise(
  document: FitnessDocumentV2,
  routineId: string,
  sessionId: string,
  exerciseId: string,
  input: ExerciseInput,
): FitnessDocumentV2 {
  const routineIndex = routineAt(document, routineId);
  const routine = document.routines[routineIndex]!;
  const sessionIndex = sessionAt(routine, sessionId);
  const session = routine.sessions[sessionIndex]!;
  const exerciseIndex = session.exercises.findIndex(
    (item) => item.id === exerciseId,
  );
  if (exerciseIndex < 0)
    throw new FitnessError('missing-exercise', messages.missingExercise);
  const replacement = exercise(input, exerciseId);
  return replaceRoutine(document, routineIndex, {
    ...routine,
    sessions: routine.sessions.map((item, index) =>
      index === sessionIndex
        ? {
            ...item,
            exercises: item.exercises.map((current, position) =>
              position === exerciseIndex ? replacement : current,
            ),
          }
        : item,
    ),
  });
}

export function deleteExercise(
  document: FitnessDocumentV2,
  routineId: string,
  sessionId: string,
  exerciseId: string,
): FitnessDocumentV2 {
  const routineIndex = routineAt(document, routineId);
  const routine = document.routines[routineIndex]!;
  const sessionIndex = sessionAt(routine, sessionId);
  const session = routine.sessions[sessionIndex]!;
  if (!session.exercises.some((item) => item.id === exerciseId)) {
    throw new FitnessError('missing-exercise', messages.missingExercise);
  }
  return replaceRoutine(document, routineIndex, {
    ...routine,
    sessions: routine.sessions.map((item, index) =>
      index === sessionIndex
        ? {
            ...item,
            exercises: item.exercises.filter(
              (current) => current.id !== exerciseId,
            ),
          }
        : item,
    ),
  });
}

export function captureSnapshot(
  document: FitnessDocumentV2,
  routineId: string,
  ids: IdGenerator,
  clock: Clock,
): FitnessDocumentV2 {
  const index = routineAt(document, routineId);
  return replaceRoutine(
    document,
    index,
    captureRoutineSnapshot(document.routines[index]!, ids, clock),
  );
}
