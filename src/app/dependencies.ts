import type { FitnessMutation } from '../fitness/domain/mutations';

export type StorageNamespace =
  | { kind: 'production' }
  | { kind: 'automated-test'; runId: string }
  | { kind: 'ui-test'; runId: string };

export interface FitnessDocumentV2 {
  readonly schemaVersion: 2;
  readonly routines: readonly unknown[];
}

export interface LoadedFitnessState {
  readonly document: FitnessDocumentV2;
  readonly storageRevision: number;
  readonly recovered: boolean;
}

export interface FitnessRepository {
  load(): Promise<LoadedFitnessState>;
  apply(
    expectedRevision: number,
    mutation: FitnessMutation,
  ): Promise<{ readonly storageRevision: number }>;
}

export interface IdGenerator {
  next(): string;
}

export interface Clock {
  nowIso(): string;
}

export interface ImportFileReader {
  readText(file: File): Promise<string>;
}

export interface FitnessDependencies {
  readonly repository: FitnessRepository;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly importFileReader: ImportFileReader;
}

const DATABASE_PREFIX = 'xq-fitness';
const RUN_ID_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,62}[A-Za-z0-9])?$/;

export function resolveFitnessDatabaseName(
  namespace: StorageNamespace,
): string {
  if (namespace.kind === 'production') {
    return DATABASE_PREFIX;
  }

  if (!RUN_ID_PATTERN.test(namespace.runId)) {
    throw new Error('Test storage run ID is invalid.');
  }

  return `${DATABASE_PREFIX}-${namespace.kind}-${namespace.runId}`;
}

export function createProductionNamespace(): Extract<
  StorageNamespace,
  { kind: 'production' }
> {
  return { kind: 'production' };
}

export function createAutomatedTestNamespace(
  runId: string,
): Extract<StorageNamespace, { kind: 'automated-test' }> {
  const namespace = { kind: 'automated-test' as const, runId };
  resolveFitnessDatabaseName(namespace);
  return namespace;
}

export function createUiTestNamespace(
  runId: string,
): Extract<StorageNamespace, { kind: 'ui-test' }> {
  const namespace = { kind: 'ui-test' as const, runId };
  resolveFitnessDatabaseName(namespace);
  return namespace;
}
