import type { IdGenerator } from '../../app/dependencies';
import { FitnessError, messages } from '../domain/errors';
import type { FitnessDocumentV2 } from '../domain/model';
import { migrateFitnessDocumentV1 } from '../persistence/migrations';
import {
  fitnessDocumentV1Schema,
  inspectSchemaVersion,
  parseFitnessDocumentV2,
} from '../persistence/schemas';

export function decodeFitnessImport(
  text: string,
  ids: IdGenerator,
): FitnessDocumentV2 {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new FitnessError('invalid-import', messages.invalidImport, {
      cause: error,
    });
  }
  try {
    const version = inspectSchemaVersion(raw);
    return version === 1
      ? migrateFitnessDocumentV1(fitnessDocumentV1Schema.parse(raw), ids)
      : parseFitnessDocumentV2(raw);
  } catch (error) {
    if (error instanceof FitnessError) throw error;
    const unsupported =
      error instanceof Error && error.message === 'unsupported-version';
    throw new FitnessError(
      unsupported ? 'unsupported-version' : 'invalid-import',
      unsupported ? messages.unsupportedVersion : messages.invalidImport,
      { cause: error },
    );
  }
}

export async function importFitnessDocument(
  text: string,
  ids: IdGenerator,
  expectedRevision: number,
  commit: (
    expectedRevision: number,
    candidate: FitnessDocumentV2,
  ) => Promise<{ readonly storageRevision: number }>,
): Promise<{
  readonly document: FitnessDocumentV2;
  readonly storageRevision: number;
}> {
  const document = decodeFitnessImport(text, ids);
  const result = await commit(expectedRevision, document);
  return { document, storageRevision: result.storageRevision };
}
