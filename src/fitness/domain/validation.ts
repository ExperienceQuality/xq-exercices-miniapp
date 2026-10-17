import { FitnessError, messages } from './errors';

export function normalizeName(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new FitnessError('validation', messages.invalidName);
  return normalized;
}

export function normalizeNotes(value?: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

export function foldName(value: string): string {
  return normalizeName(value).toLowerCase();
}

export function validateMetrics(
  sets: number,
  repetitions: number,
  weightKg: number,
): void {
  if (!Number.isSafeInteger(sets) || sets <= 0) {
    throw new FitnessError('validation', messages.invalidSets);
  }
  if (!Number.isSafeInteger(repetitions) || repetitions <= 0) {
    throw new FitnessError('validation', messages.invalidRepetitions);
  }
  if (!Number.isFinite(weightKg) || weightKg < 0) {
    throw new FitnessError('validation', messages.invalidWeight);
  }
}
