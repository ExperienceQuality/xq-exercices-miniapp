import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import {
  resolveFitnessDatabaseName,
  type StorageNamespace,
} from '../../app/dependencies';
import { FitnessError, messages } from '../domain/errors';
import { emptyFitnessDocument, type FitnessDocumentV2 } from '../domain/model';
import { applyMutation, type FitnessMutation } from '../domain/mutations';
import type {
  FitnessRepository,
  LoadedFitnessState,
} from './fitness-repository';
import { inspectSchemaVersion, parseFitnessDocumentV2 } from './schemas';

export interface StoredFitnessRecord {
  readonly storageRevision: number;
  readonly document: FitnessDocumentV2;
}

interface FitnessDatabase extends DBSchema {
  records: {
    key: 'primary' | 'recovery';
    value: unknown;
  };
}

function parseRecord(value: unknown): StoredFitnessRecord {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('storageRevision' in value) ||
    !Number.isSafeInteger(
      (value as { storageRevision: unknown }).storageRevision,
    ) ||
    (value as { storageRevision: number }).storageRevision < 0 ||
    !('document' in value)
  ) {
    throw new Error('invalid-record');
  }
  return {
    storageRevision: (value as { storageRevision: number }).storageRevision,
    document: parseFitnessDocumentV2((value as { document: unknown }).document),
  };
}

function isFutureDocument(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || !('document' in value))
    return false;
  try {
    inspectSchemaVersion((value as { document: unknown }).document);
    return false;
  } catch (error) {
    return error instanceof Error && error.message === 'unsupported-version';
  }
}

export class IndexedDbFitnessRepository implements FitnessRepository {
  private database?: Promise<IDBPDatabase<FitnessDatabase>>;

  constructor(private readonly databaseName: string) {}

  private db(): Promise<IDBPDatabase<FitnessDatabase>> {
    this.database ??= openDB<FitnessDatabase>(this.databaseName, 1, {
      upgrade(database) {
        database.createObjectStore('records');
      },
    });
    return this.database;
  }

  async load(): Promise<LoadedFitnessState> {
    try {
      const database = await this.db();
      const primaryRaw = await database.get('records', 'primary');
      if (isFutureDocument(primaryRaw)) {
        throw new FitnessError(
          'unsupported-version',
          messages.unsupportedVersion,
        );
      }
      if (primaryRaw === undefined) {
        const recoveryRaw = await database.get('records', 'recovery');
        if (recoveryRaw === undefined) {
          const initial = {
            storageRevision: 0,
            document: emptyFitnessDocument(),
          };
          const transaction = database.transaction('records', 'readwrite');
          await Promise.all([
            transaction.store.put(structuredClone(initial), 'primary'),
            transaction.store.put(structuredClone(initial), 'recovery'),
            transaction.done,
          ]);
          return { ...initial, recovered: false };
        }
      }
      try {
        const primary = parseRecord(primaryRaw);
        return { ...primary, recovered: false };
      } catch (primaryError) {
        const recoveryRaw = await database.get('records', 'recovery');
        if (isFutureDocument(recoveryRaw)) throw primaryError;
        const recovery = parseRecord(recoveryRaw);
        const transaction = database.transaction('records', 'readwrite');
        await transaction.store.put(structuredClone(recovery), 'primary');
        await transaction.done;
        return { ...recovery, recovered: true };
      }
    } catch (error) {
      if (error instanceof FitnessError) throw error;
      throw new FitnessError(
        'storage-unavailable',
        'Fitness data could not be loaded.',
        {
          cause: error,
        },
      );
    }
  }

  async apply(
    expectedRevision: number,
    mutation: FitnessMutation,
  ): Promise<{ readonly storageRevision: number }> {
    try {
      const database = await this.db();
      const transaction = database.transaction('records', 'readwrite');
      const primary = parseRecord(await transaction.store.get('primary'));
      if (primary.storageRevision !== expectedRevision) {
        transaction.abort();
        await transaction.done.catch(() => undefined);
        throw new FitnessError('storage-conflict', messages.conflict);
      }
      const document = parseFitnessDocumentV2(
        applyMutation(primary.document, mutation),
      );
      const storageRevision = expectedRevision + 1;
      await transaction.store.put(structuredClone(primary), 'recovery');
      await transaction.store.put(
        { storageRevision, document: structuredClone(document) },
        'primary',
      );
      await transaction.done;
      return { storageRevision };
    } catch (error) {
      if (error instanceof FitnessError) throw error;
      throw new FitnessError(
        'storage-unavailable',
        messages.storageUnavailable,
        {
          cause: error,
        },
      );
    }
  }
}

export function createIndexedDbFitnessRepository(
  namespace: StorageNamespace,
): IndexedDbFitnessRepository {
  return new IndexedDbFitnessRepository(resolveFitnessDatabaseName(namespace));
}
