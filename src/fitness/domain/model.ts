export type ProgressClass = 'first' | 'increased' | 'decreased' | 'same';

export interface SnapshotEntryV2 {
  readonly name: string;
  readonly foldedName: string;
  readonly sets: number;
  readonly repetitions: number;
  readonly weightKg: number;
  readonly repetitionsProgress: ProgressClass;
  readonly weightProgress: ProgressClass;
}

export interface ProgressSnapshotV2 {
  readonly id: string;
  readonly capturedAt: string;
  readonly entries: readonly SnapshotEntryV2[];
}

export interface ExerciseV2 {
  readonly id: string;
  readonly name: string;
  readonly sets: number;
  readonly repetitions: number;
  readonly weightKg: number;
}

export interface TrainingSessionV2 {
  readonly id: string;
  readonly name: string;
  readonly order: number;
  readonly exercises: readonly ExerciseV2[];
}

export interface RoutineV2 {
  readonly id: string;
  readonly name: string;
  readonly notes?: string;
  readonly sessions: readonly TrainingSessionV2[];
  readonly snapshots: readonly ProgressSnapshotV2[];
}

export interface FitnessDocumentV2 {
  readonly schemaVersion: 2;
  readonly routines: readonly RoutineV2[];
}

export const emptyFitnessDocument = (): FitnessDocumentV2 => ({
  schemaVersion: 2,
  routines: [],
});
