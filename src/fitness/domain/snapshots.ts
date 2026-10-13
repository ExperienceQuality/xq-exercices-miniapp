import type { IdGenerator, Clock } from '../../app/dependencies';
import { FitnessError, messages } from './errors';
import type { ProgressClass, RoutineV2, SnapshotEntryV2 } from './model';
import { foldName, normalizeName } from './validation';

function classify(current: number, previous?: number): ProgressClass {
  if (previous === undefined) return 'first';
  if (current > previous) return 'increased';
  if (current < previous) return 'decreased';
  return 'same';
}

export function aggregateExercises(routine: RoutineV2): SnapshotEntryV2[] {
  const aggregate = new Map<
    string,
    Omit<SnapshotEntryV2, 'repetitionsProgress' | 'weightProgress'>
  >();
  const sessions = [...routine.sessions].sort(
    (left, right) => left.order - right.order,
  );
  for (const session of sessions) {
    for (const exercise of session.exercises) {
      const name = normalizeName(exercise.name);
      const foldedName = foldName(name);
      const found = aggregate.get(foldedName);
      aggregate.set(
        foldedName,
        found
          ? {
              ...found,
              sets: Math.max(found.sets, exercise.sets),
              repetitions: Math.max(found.repetitions, exercise.repetitions),
              weightKg: Math.max(found.weightKg, exercise.weightKg),
            }
          : {
              name,
              foldedName,
              sets: exercise.sets,
              repetitions: exercise.repetitions,
              weightKg: exercise.weightKg,
            },
      );
    }
  }
  const previous = routine.snapshots.at(-1);
  const compare = (left: string, right: string): number =>
    left < right ? -1 : 1;
  return [...aggregate.values()]
    .sort((left, right) => compare(left.foldedName, right.foldedName))
    .map((entry) => {
      const prior = previous?.entries.find(
        (candidate) => candidate.foldedName === entry.foldedName,
      );
      return {
        ...entry,
        repetitionsProgress: classify(entry.repetitions, prior?.repetitions),
        weightProgress: classify(entry.weightKg, prior?.weightKg),
      };
    });
}

export function captureRoutineSnapshot(
  routine: RoutineV2,
  ids: IdGenerator,
  clock: Clock,
): RoutineV2 {
  if (!routine)
    throw new FitnessError('missing-routine', messages.missingRoutine);
  const snapshot = {
    id: ids.next(),
    capturedAt: clock.nowIso(),
    entries: aggregateExercises(routine),
  };
  return { ...routine, snapshots: [...routine.snapshots, snapshot].slice(-2) };
}
