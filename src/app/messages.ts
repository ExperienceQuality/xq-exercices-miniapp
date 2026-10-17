export const fitnessMessages = {
  loadUnavailable: 'Fitness data is unavailable.',
  persistenceFailed: 'Fitness data could not be saved.',
  unsupportedVersion: 'This Fitness data version is not supported.',
  importInvalid: 'The selected Fitness file is invalid.',
  importSucceeded: 'Fitness data imported.',
  missingRoutine: 'The routine no longer exists.',
  missingSession: 'The training session no longer exists.',
  missingExercise: 'The exercise no longer exists.',
} as const;

export type FitnessMessageKey = keyof typeof fitnessMessages;
