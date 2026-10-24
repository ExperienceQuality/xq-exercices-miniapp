export type FitnessErrorCode =
  | 'validation'
  | 'missing-routine'
  | 'missing-session'
  | 'missing-exercise'
  | 'invalid-import'
  | 'unsupported-version'
  | 'storage-conflict'
  | 'storage-unavailable';

export class FitnessError extends Error {
  constructor(
    readonly code: FitnessErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'FitnessError';
  }
}

export const messages = {
  invalidName: 'A name is required.',
  invalidSets: 'Sets must be a positive whole number.',
  invalidRepetitions: 'Repetitions must be a positive whole number.',
  invalidWeight: 'Weight must be a finite number of zero or greater.',
  missingRoutine: 'The routine no longer exists.',
  missingSession: 'The training session no longer exists.',
  missingExercise: 'The exercise no longer exists.',
  invalidSessionOrder: 'Session order must include every session exactly once.',
  invalidExerciseOrder:
    'Exercise order must include every exercise exactly once.',
  invalidImport: 'The selected Fitness file is invalid.',
  unsupportedVersion: 'This Fitness data version is not supported.',
  conflict: 'Fitness data changed in another tab. Reload and try again.',
  storageUnavailable: 'Fitness data could not be saved.',
} as const;
