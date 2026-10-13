import type { IdGenerator } from '../../app/dependencies';
import { FitnessError, messages } from '../domain/errors';
import type {
  FitnessDocumentV2,
  ProgressClass,
  SnapshotEntryV2,
} from '../domain/model';
import { foldName, normalizeName, normalizeNotes } from '../domain/validation';
import {
  fitnessDocumentV1Schema,
  parseFitnessDocumentV2,
  type FitnessDocumentV1,
} from './schemas';

function compare(left: SnapshotEntryV2, right: SnapshotEntryV2): number {
  return left.foldedName < right.foldedName ? -1 : 1;
}

function progress(current: number, previous?: number): ProgressClass {
  if (previous === undefined) return 'first';
  if (current > previous) return 'increased';
  if (current < previous) return 'decreased';
  return 'same';
}

export function migrateFitnessDocumentV1(
  raw: FitnessDocumentV1,
  ids: IdGenerator,
): FitnessDocumentV2 {
  const input = fitnessDocumentV1Schema.parse(raw);
  const supplied = input.routines.flatMap((routine) => [
    ...(routine.id ? [routine.id] : []),
    ...routine.sessions.flatMap((session) => [
      ...(session.id ? [session.id] : []),
      ...session.exercises.flatMap((exercise) =>
        exercise.id ? [exercise.id] : [],
      ),
    ]),
    ...routine.snapshots.flatMap((snapshot) =>
      snapshot.id ? [snapshot.id] : [],
    ),
  ]);
  if (new Set(supplied).size !== supplied.length) {
    throw new FitnessError('invalid-import', messages.invalidImport);
  }
  const used = new Set(supplied);
  const reserve = (provided?: string): string => {
    if (provided) return provided;
    for (let attempts = 0; attempts < 10_000; attempts += 1) {
      const generated = ids.next();
      if (generated.trim() && !used.has(generated)) {
        used.add(generated);
        return generated;
      }
    }
    throw new FitnessError(
      'invalid-import',
      'A unique identity could not be generated.',
    );
  };

  const document: FitnessDocumentV2 = {
    schemaVersion: 2,
    routines: input.routines.map((routine) => {
      const routineId = reserve(routine.id);
      const suppliedOrders = routine.sessions.flatMap((session) =>
        session.order === undefined ? [] : [session.order],
      );
      if (new Set(suppliedOrders).size !== suppliedOrders.length) {
        throw new FitnessError('invalid-import', messages.invalidImport);
      }
      let nextOrder = Math.max(0, ...suppliedOrders);
      const notes = normalizeNotes(routine.notes);
      const sessions = routine.sessions.map((session) => ({
        id: reserve(session.id),
        name: normalizeName(session.name),
        order: session.order ?? ++nextOrder,
        exercises: session.exercises.map((exercise) => ({
          id: reserve(exercise.id),
          name: normalizeName(exercise.name),
          sets: exercise.sets,
          repetitions: exercise.repetitions,
          weightKg: exercise.weightKg,
        })),
      }));
      let previous: readonly SnapshotEntryV2[] | undefined;
      const snapshots = routine.snapshots.map((snapshot) => {
        const grouped = new Map<
          string,
          Omit<SnapshotEntryV2, 'repetitionsProgress' | 'weightProgress'>
        >();
        for (const entry of snapshot.entries) {
          const entryName = normalizeName(entry.name);
          const foldedName = foldName(entryName);
          const found = grouped.get(foldedName);
          grouped.set(
            foldedName,
            found
              ? {
                  ...found,
                  sets: Math.max(found.sets, entry.sets),
                  repetitions: Math.max(found.repetitions, entry.repetitions),
                  weightKg: Math.max(found.weightKg, entry.weightKg),
                }
              : { ...entry, name: entryName, foldedName },
          );
        }
        const entries: SnapshotEntryV2[] = [...grouped.values()]
          .map((entry) => {
            const prior = previous?.find(
              (candidate) => candidate.foldedName === entry.foldedName,
            );
            return {
              ...entry,
              repetitionsProgress: progress(
                entry.repetitions,
                prior?.repetitions,
              ),
              weightProgress: progress(entry.weightKg, prior?.weightKg),
            };
          })
          .sort(compare);
        previous = entries;
        return {
          id: reserve(snapshot.id),
          capturedAt: snapshot.capturedAt,
          entries,
        };
      });
      return {
        id: routineId,
        name: normalizeName(routine.name),
        ...(notes ? { notes } : {}),
        sessions,
        snapshots: snapshots.slice(-2),
      };
    }),
  };
  return parseFitnessDocumentV2(document);
}
