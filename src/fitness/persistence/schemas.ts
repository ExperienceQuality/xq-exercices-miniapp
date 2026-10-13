import { z } from 'zod';
import type { FitnessDocumentV2, ProgressClass } from '../domain/model';

const id = z.string().trim().min(1);
const name = z
  .string()
  .refine((value) => value === value.trim() && value.length > 0);
const positiveInteger = z.number().int().safe().positive();
const weight = z.number().finite().nonnegative();
const progress = z.enum(['first', 'increased', 'decreased', 'same']);

export const snapshotEntryV2Schema = z
  .object({
    name,
    foldedName: name,
    sets: positiveInteger,
    repetitions: positiveInteger,
    weightKg: weight,
    repetitionsProgress: progress,
    weightProgress: progress,
  })
  .strict()
  .refine((entry) => entry.foldedName === entry.name.trim().toLowerCase(), {
    message: 'Snapshot folded name is not canonical.',
  });

const snapshotV2Schema = z
  .object({
    id,
    capturedAt: z.iso.datetime({ offset: true }),
    entries: z.array(snapshotEntryV2Schema),
  })
  .strict()
  .superRefine((snapshot, context) => {
    const folded = snapshot.entries.map((entry) => entry.foldedName);
    if (new Set(folded).size !== folded.length) {
      context.addIssue({
        code: 'custom',
        message: 'Duplicate snapshot entry.',
      });
    }
    const sorted = [...snapshot.entries].sort(compareEntries);
    if (sorted.some((entry, index) => entry !== snapshot.entries[index])) {
      context.addIssue({
        code: 'custom',
        message: 'Snapshot entries are not sorted.',
      });
    }
  });

const exerciseV2Schema = z
  .object({
    id,
    name,
    sets: positiveInteger,
    repetitions: positiveInteger,
    weightKg: weight,
  })
  .strict();
const sessionV2Schema = z
  .object({
    id,
    name,
    order: positiveInteger,
    exercises: z.array(exerciseV2Schema),
  })
  .strict();
const routineV2Schema = z
  .object({
    id,
    name,
    notes: z
      .string()
      .refine((value) => value === value.trim() && value.length > 0)
      .optional(),
    sessions: z.array(sessionV2Schema),
    snapshots: z.array(snapshotV2Schema).max(2),
  })
  .strict()
  .superRefine((routine, context) => {
    const orders = routine.sessions.map((session) => session.order);
    if (new Set(orders).size !== orders.length) {
      context.addIssue({ code: 'custom', message: 'Duplicate session order.' });
    }
    validateSnapshotProgress(routine.snapshots, context);
  });

export const fitnessDocumentV2Schema = z
  .object({ schemaVersion: z.literal(2), routines: z.array(routineV2Schema) })
  .strict()
  .superRefine((document, context) => {
    const ids: string[] = [];
    for (const routine of document.routines) {
      ids.push(routine.id, ...routine.snapshots.map((snapshot) => snapshot.id));
      for (const session of routine.sessions) {
        ids.push(
          session.id,
          ...session.exercises.map((exercise) => exercise.id),
        );
      }
    }
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: 'custom',
        message: 'Duplicate stable identity.',
      });
    }
  });

const legacySnapshotEntrySchema = z
  .object({
    name: z.string(),
    sets: positiveInteger,
    repetitions: positiveInteger,
    weightKg: weight,
  })
  .strict();
const legacySnapshotSchema = z
  .object({
    id: id.optional(),
    capturedAt: z.iso.datetime({ offset: true }),
    entries: z.array(legacySnapshotEntrySchema),
  })
  .strict();
const legacyExerciseSchema = z
  .object({
    id: id.optional(),
    name: z.string(),
    sets: positiveInteger,
    repetitions: positiveInteger,
    weightKg: weight,
  })
  .strict();
const legacySessionSchema = z
  .object({
    id: id.optional(),
    name: z.string(),
    order: positiveInteger.optional(),
    exercises: z.array(legacyExerciseSchema),
  })
  .strict();
const legacyRoutineSchema = z
  .object({
    id: id.optional(),
    name: z.string(),
    notes: z.string().nullable().optional(),
    sessions: z.array(legacySessionSchema),
    snapshots: z.array(legacySnapshotSchema),
  })
  .strict();
export const fitnessDocumentV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    routines: z.array(legacyRoutineSchema),
  })
  .strict();

export type FitnessDocumentV1 = z.infer<typeof fitnessDocumentV1Schema>;

function compareText(left: string, right: string): number {
  return left < right ? -1 : 1;
}

function compareEntries(
  left: z.infer<typeof snapshotEntryV2Schema>,
  right: z.infer<typeof snapshotEntryV2Schema>,
): number {
  return compareText(left.foldedName, right.foldedName);
}

function classify(current: number, previous?: number): ProgressClass {
  return previous === undefined
    ? 'first'
    : current > previous
      ? 'increased'
      : current < previous
        ? 'decreased'
        : 'same';
}

function validateSnapshotProgress(
  snapshots: readonly z.infer<typeof snapshotV2Schema>[],
  context: z.RefinementCtx,
): void {
  snapshots.forEach((snapshot, index) => {
    const previous = snapshots[index - 1];
    if (!previous) return;
    snapshot.entries.forEach((entry) => {
      const prior = previous?.entries.find(
        (candidate) => candidate.foldedName === entry.foldedName,
      );
      if (
        entry.repetitionsProgress !==
          classify(entry.repetitions, prior?.repetitions) ||
        entry.weightProgress !== classify(entry.weightKg, prior?.weightKg)
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Snapshot progress is inconsistent.',
        });
      }
    });
  });
}

export function parseFitnessDocumentV2(value: unknown): FitnessDocumentV2 {
  return fitnessDocumentV2Schema.parse(value) as FitnessDocumentV2;
}

export function inspectSchemaVersion(value: unknown): 1 | 2 {
  if (typeof value === 'object' && value !== null && 'schemaVersion' in value) {
    const version = (value as { schemaVersion?: unknown }).schemaVersion;
    if (
      Number.isInteger(version) &&
      typeof version === 'number' &&
      version > 2
    ) {
      throw new Error('unsupported-version');
    }
    if (version === 1 || version === 2) return version;
  }
  throw new Error('invalid-version');
}
