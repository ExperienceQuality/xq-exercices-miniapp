import { FitnessError, messages } from './errors';
import type {
  ExerciseV2,
  FitnessDocumentV2,
  ProgressSnapshotV2,
  RoutineV2,
  TrainingSessionV2,
} from './model';
import { appendSnapshot } from './snapshots';

export type FitnessMutation =
  | { readonly kind: 'create-routine'; readonly routine: RoutineV2 }
  | {
      readonly kind: 'add-session';
      readonly routineId: string;
      readonly session: TrainingSessionV2;
    }
  | {
      readonly kind: 'rename-session';
      readonly routineId: string;
      readonly sessionId: string;
      readonly name: string;
    }
  | {
      readonly kind: 'delete-session';
      readonly routineId: string;
      readonly sessionId: string;
    }
  | {
      readonly kind: 'reorder-sessions';
      readonly routineId: string;
      readonly sessionIds: readonly string[];
    }
  | {
      readonly kind: 'add-exercise';
      readonly routineId: string;
      readonly sessionId: string;
      readonly exercise: ExerciseV2;
    }
  | {
      readonly kind: 'update-exercise';
      readonly routineId: string;
      readonly sessionId: string;
      readonly exercise: ExerciseV2;
    }
  | {
      readonly kind: 'delete-exercise';
      readonly routineId: string;
      readonly sessionId: string;
      readonly exerciseId: string;
    }
  | {
      readonly kind: 'reorder-exercises';
      readonly routineId: string;
      readonly sessionId: string;
      readonly exerciseIds: readonly string[];
    }
  | {
      readonly kind: 'capture-snapshot';
      readonly routineId: string;
      readonly snapshot: ProgressSnapshotV2;
    }
  | {
      readonly kind: 'replace-document';
      readonly document: FitnessDocumentV2;
    };

export function requireRoutine(
  document: FitnessDocumentV2,
  routineId: string,
): RoutineV2 {
  const routine = document.routines.find((item) => item.id === routineId);
  if (!routine)
    throw new FitnessError('missing-routine', messages.missingRoutine);
  return routine;
}

export function requireSession(
  routine: RoutineV2,
  sessionId: string,
): TrainingSessionV2 {
  const session = routine.sessions.find((item) => item.id === sessionId);
  if (!session)
    throw new FitnessError('missing-session', messages.missingSession);
  return session;
}

export function requireExercise(
  session: TrainingSessionV2,
  exerciseId: string,
): ExerciseV2 {
  const exercise = session.exercises.find((item) => item.id === exerciseId);
  if (!exercise)
    throw new FitnessError('missing-exercise', messages.missingExercise);
  return exercise;
}

function routineAt(document: FitnessDocumentV2, routineId: string): number {
  const index = document.routines.findIndex(
    (routine) => routine.id === routineId,
  );
  if (index < 0)
    throw new FitnessError('missing-routine', messages.missingRoutine);
  return index;
}

function sessionAt(routine: RoutineV2, sessionId: string): number {
  const index = routine.sessions.findIndex(
    (session) => session.id === sessionId,
  );
  if (index < 0)
    throw new FitnessError('missing-session', messages.missingSession);
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

function updateSession(
  document: FitnessDocumentV2,
  routineId: string,
  sessionId: string,
  update: (session: TrainingSessionV2) => TrainingSessionV2,
): FitnessDocumentV2 {
  const routineIndex = routineAt(document, routineId);
  const routine = document.routines[routineIndex]!;
  const sessionIndex = sessionAt(routine, sessionId);
  const current = routine.sessions[sessionIndex]!;
  const updated = update(current);
  if (updated === current) return document;
  return replaceRoutine(document, routineIndex, {
    ...routine,
    sessions: routine.sessions.map((session, index) =>
      index === sessionIndex ? updated : session,
    ),
  });
}

function reorderSessionList(
  routine: RoutineV2,
  sessionIds: readonly string[],
): readonly TrainingSessionV2[] {
  if (sessionIds.length !== routine.sessions.length) {
    throw new FitnessError('validation', messages.invalidSessionOrder);
  }
  const seen = new Set<string>();
  const ranks = new Map<string, number>();
  for (const [position, sessionId] of sessionIds.entries()) {
    if (
      seen.has(sessionId) ||
      !routine.sessions.some((session) => session.id === sessionId)
    ) {
      throw new FitnessError('validation', messages.invalidSessionOrder);
    }
    seen.add(sessionId);
    ranks.set(sessionId, position + 1);
  }
  return routine.sessions.map((session) => ({
    ...session,
    order: ranks.get(session.id)!,
  }));
}

export function applyMutation(
  document: FitnessDocumentV2,
  mutation: FitnessMutation,
): FitnessDocumentV2 {
  switch (mutation.kind) {
    case 'replace-document':
      return mutation.document;
    case 'create-routine':
      return {
        ...document,
        routines: [...document.routines, mutation.routine],
      };
    case 'add-session': {
      const index = routineAt(document, mutation.routineId);
      const routine = document.routines[index]!;
      return replaceRoutine(document, index, {
        ...routine,
        sessions: [...routine.sessions, mutation.session],
      });
    }
    case 'rename-session':
      return updateSession(
        document,
        mutation.routineId,
        mutation.sessionId,
        (session) => ({ ...session, name: mutation.name }),
      );
    case 'delete-session': {
      const routineIndex = routineAt(document, mutation.routineId);
      const routine = document.routines[routineIndex]!;
      const sessionIndex = sessionAt(routine, mutation.sessionId);
      return replaceRoutine(document, routineIndex, {
        ...routine,
        sessions: routine.sessions.filter((_, index) => index !== sessionIndex),
      });
    }
    case 'reorder-sessions': {
      const routineIndex = routineAt(document, mutation.routineId);
      const routine = document.routines[routineIndex]!;
      const sessions = reorderSessionList(routine, mutation.sessionIds);
      const sorted = [...routine.sessions].sort(
        (left, right) => left.order - right.order,
      );
      if (
        sorted.every(
          (session, index) => session.id === mutation.sessionIds[index],
        )
      ) {
        return document;
      }
      return replaceRoutine(document, routineIndex, {
        ...routine,
        sessions,
      });
    }
    case 'add-exercise':
      return updateSession(
        document,
        mutation.routineId,
        mutation.sessionId,
        (session) => ({
          ...session,
          exercises: [...session.exercises, mutation.exercise],
        }),
      );
    case 'update-exercise':
      return updateSession(
        document,
        mutation.routineId,
        mutation.sessionId,
        (session) => {
          const index = session.exercises.findIndex(
            (item) => item.id === mutation.exercise.id,
          );
          if (index < 0)
            throw new FitnessError(
              'missing-exercise',
              messages.missingExercise,
            );
          return {
            ...session,
            exercises: session.exercises.map((current, position) =>
              position === index ? mutation.exercise : current,
            ),
          };
        },
      );
    case 'delete-exercise':
      return updateSession(
        document,
        mutation.routineId,
        mutation.sessionId,
        (session) => {
          if (
            !session.exercises.some((item) => item.id === mutation.exerciseId)
          ) {
            throw new FitnessError(
              'missing-exercise',
              messages.missingExercise,
            );
          }
          return {
            ...session,
            exercises: session.exercises.filter(
              (item) => item.id !== mutation.exerciseId,
            ),
          };
        },
      );
    case 'reorder-exercises':
      return updateSession(
        document,
        mutation.routineId,
        mutation.sessionId,
        (session) => {
          const exerciseIds = mutation.exerciseIds;
          if (exerciseIds.length !== session.exercises.length) {
            throw new FitnessError('validation', messages.invalidExerciseOrder);
          }
          const byId = new Map(
            session.exercises.map((item) => [item.id, item]),
          );
          const seen = new Set<string>();
          for (const exerciseId of exerciseIds) {
            if (seen.has(exerciseId) || !byId.has(exerciseId)) {
              throw new FitnessError(
                'validation',
                messages.invalidExerciseOrder,
              );
            }
            seen.add(exerciseId);
          }
          if (
            session.exercises.every(
              (item, index) => item.id === exerciseIds[index],
            )
          ) {
            return session;
          }
          return {
            ...session,
            exercises: exerciseIds.map((id) => byId.get(id)!),
          };
        },
      );
    case 'capture-snapshot': {
      const index = routineAt(document, mutation.routineId);
      return replaceRoutine(
        document,
        index,
        appendSnapshot(document.routines[index]!, mutation.snapshot),
      );
    }
  }
}
