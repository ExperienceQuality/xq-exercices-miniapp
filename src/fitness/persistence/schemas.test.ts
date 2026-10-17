import { FitnessError } from '../domain/errors';
import type { FitnessDocumentV2 } from '../domain/model';
import {
  decodeFitnessImport,
  importFitnessDocument,
} from '../import/import-fitness-document';
import { migrateFitnessDocumentV1 } from './migrations';
import {
  fitnessDocumentV1Schema,
  inspectSchemaVersion,
  parseFitnessDocumentV2,
} from './schemas';

const generator = (...seed: string[]) => ({
  next: () => seed.shift() ?? 'fallback',
});
const baseV1 = () => ({
  schemaVersion: 1 as const,
  routines: [
    {
      id: undefined as string | undefined,
      name: ' Plan ',
      notes: ' ',
      sessions: [
        {
          id: undefined as string | undefined,
          name: 'B',
          order: 4,
          exercises: [
            {
              id: undefined as string | undefined,
              name: ' Press ',
              sets: 3,
              repetitions: 10,
              weightKg: 5,
            },
          ],
        },
        {
          id: undefined as string | undefined,
          name: 'A',
          exercises: [
            {
              id: undefined as string | undefined,
              name: 'press',
              sets: 5,
              repetitions: 8,
              weightKg: 7,
            },
          ],
        },
      ],
      snapshots: [
        {
          id: undefined as string | undefined,
          capturedAt: '2026-01-01T00:00:00.000Z',
          entries: [
            { name: 'Press', sets: 3, repetitions: 8, weightKg: 5 },
            { name: 'Zulu', sets: 1, repetitions: 1, weightKg: 0 },
            { name: 'Abs', sets: 1, repetitions: 1, weightKg: 0 },
          ],
        },
        {
          id: undefined as string | undefined,
          capturedAt: '2026-01-02T00:00:00.000Z',
          entries: [
            { name: ' press ', sets: 4, repetitions: 10, weightKg: 4 },
            { name: 'PRESS', sets: 5, repetitions: 9, weightKg: 7 },
            { name: 'Abs', sets: 1, repetitions: 1, weightKg: 0 },
          ],
        },
        {
          id: undefined as string | undefined,
          capturedAt: '2026-01-03T00:00:00.000Z',
          entries: [
            { name: 'Press', sets: 5, repetitions: 9, weightKg: 6 },
            { name: 'Abs', sets: 1, repetitions: 1, weightKg: 0 },
          ],
        },
      ],
    },
  ],
});

describe('schemas and migration', () => {
  it('migrates v1 deterministically, collision-aware, retaining latest comparison', () => {
    const result = migrateFitnessDocumentV1(
      fitnessDocumentV1Schema.parse(baseV1()),
      generator('r', 's1', 'e1', 's2', 'e2', 'p1', 'p2', 'p3'),
    );
    expect(result.schemaVersion).toBe(2);
    expect(result.routines[0]).toMatchObject({
      id: 'r',
      name: 'Plan',
      sessions: [{ order: 4 }, { order: 5 }],
    });
    expect(result.routines[0]!).not.toHaveProperty('notes');
    expect(result.routines[0]!.snapshots).toHaveLength(2);
    expect(result.routines[0]!.snapshots[0]!.entries[1]).toMatchObject({
      sets: 5,
      repetitions: 10,
      weightKg: 7,
      repetitionsProgress: 'increased',
      weightProgress: 'increased',
    });
    expect(result.routines[0]!.snapshots[1]!.entries[0]).toMatchObject({
      name: 'Abs',
      repetitionsProgress: 'same',
      weightProgress: 'same',
    });
    expect(result.routines[0]!.snapshots[1]!.entries[1]).toMatchObject({
      name: 'Press',
      repetitionsProgress: 'decreased',
      weightProgress: 'decreased',
    });
  });

  it('preserves supplied IDs while avoiding generated collisions', () => {
    const raw = baseV1();
    raw.routines[0]!.id = 'taken';
    raw.routines[0]!.notes = ' real notes ';
    raw.routines[0]!.sessions[0]!.id = 'provided-session';
    raw.routines[0]!.sessions[0]!.exercises[0]!.id = 'provided-exercise';
    raw.routines[0]!.snapshots[0]!.id = 'provided-snapshot';
    const result = migrateFitnessDocumentV1(
      fitnessDocumentV1Schema.parse(raw),
      generator(
        'taken',
        'session',
        'exercise',
        'session2',
        'exercise2',
        'p1',
        'p2',
        'p3',
      ),
    );
    expect(result.routines[0]!.id).toBe('taken');
    expect(result.routines[0]!.sessions[0]!.id).toBe('provided-session');
    expect(result.routines[0]!.notes).toBe('real notes');
  });

  it('rejects duplicate supplied IDs, orders, and exhausted generation', () => {
    const duplicate = baseV1();
    duplicate.routines[0]!.id = 'same';
    duplicate.routines[0]!.sessions[0]!.id = 'same';
    expect(() =>
      migrateFitnessDocumentV1(
        fitnessDocumentV1Schema.parse(duplicate),
        generator(),
      ),
    ).toThrow(FitnessError);
    const orders = baseV1();
    orders.routines[0]!.sessions[1]!.order = 4;
    expect(() =>
      migrateFitnessDocumentV1(
        fitnessDocumentV1Schema.parse(orders),
        generator(),
      ),
    ).toThrow(FitnessError);
    expect(() =>
      migrateFitnessDocumentV1(
        fitnessDocumentV1Schema.parse({
          schemaVersion: 1,
          routines: [{ name: 'x', sessions: [], snapshots: [] }],
        }),
        { next: () => '' },
      ),
    ).toThrow('unique identity');
  });

  it('strictly validates canonical v2 invariants', () => {
    const migrated = migrateFitnessDocumentV1(
      fitnessDocumentV1Schema.parse(baseV1()),
      generator('r', 's1', 'e1', 's2', 'e2', 'p1', 'p2', 'p3'),
    );
    expect(parseFitnessDocumentV2(migrated)).toEqual(migrated);
    expect(() =>
      parseFitnessDocumentV2({ ...migrated, extra: true }),
    ).toThrow();
    expect(() =>
      parseFitnessDocumentV2({
        ...migrated,
        routines: [
          {
            ...migrated.routines[0],
            sessions: migrated.routines[0]!.sessions.map((s) => ({
              ...s,
              order: 1,
            })),
          },
        ],
      }),
    ).toThrow('Duplicate session order');
    const bad = structuredClone(migrated) as unknown as {
      routines: Array<{
        snapshots: Array<{ entries: Array<{ repetitionsProgress: string }> }>;
      }>;
    };
    bad.routines[0]!.snapshots[1]!.entries[0]!.repetitionsProgress =
      'decreased';
    expect(() => parseFitnessDocumentV2(bad)).toThrow('inconsistent');
  });

  it('rejects duplicate identities and malformed snapshot ordering/content', () => {
    const canonical: FitnessDocumentV2 = {
      schemaVersion: 2,
      routines: [
        {
          id: 'r',
          name: 'R',
          sessions: [],
          snapshots: [
            {
              id: 'p1',
              capturedAt: '2026-01-01T00:00:00.000Z',
              entries: [
                {
                  name: 'A',
                  foldedName: 'a',
                  sets: 1,
                  repetitions: 1,
                  weightKg: 1,
                  repetitionsProgress: 'first',
                  weightProgress: 'first',
                },
                {
                  name: 'B',
                  foldedName: 'b',
                  sets: 1,
                  repetitions: 1,
                  weightKg: 2,
                  repetitionsProgress: 'first',
                  weightProgress: 'first',
                },
                {
                  name: 'C',
                  foldedName: 'c',
                  sets: 1,
                  repetitions: 2,
                  weightKg: 2,
                  repetitionsProgress: 'first',
                  weightProgress: 'first',
                },
              ],
            },
            {
              id: 'p2',
              capturedAt: '2026-01-02T00:00:00.000Z',
              entries: [
                {
                  name: 'A',
                  foldedName: 'a',
                  sets: 1,
                  repetitions: 2,
                  weightKg: 0,
                  repetitionsProgress: 'increased',
                  weightProgress: 'decreased',
                },
                {
                  name: 'B',
                  foldedName: 'b',
                  sets: 1,
                  repetitions: 1,
                  weightKg: 2,
                  repetitionsProgress: 'same',
                  weightProgress: 'same',
                },
                {
                  name: 'C',
                  foldedName: 'c',
                  sets: 1,
                  repetitions: 1,
                  weightKg: 3,
                  repetitionsProgress: 'decreased',
                  weightProgress: 'increased',
                },
              ],
            },
          ],
        },
      ],
    };
    expect(parseFitnessDocumentV2(canonical)).toEqual(canonical);
    expect(() =>
      parseFitnessDocumentV2({
        ...canonical,
        routines: [
          ...canonical.routines,
          { ...canonical.routines[0]!, name: 'Other' },
        ],
      }),
    ).toThrow('Duplicate stable identity');
    const duplicateEntry = structuredClone(canonical) as unknown as {
      routines: Array<{
        snapshots: Array<{ entries: Array<Record<string, unknown>> }>;
      }>;
    };
    duplicateEntry.routines[0]!.snapshots[0]!.entries[1] = {
      ...duplicateEntry.routines[0]!.snapshots[0]!.entries[0]!,
    };
    expect(() => parseFitnessDocumentV2(duplicateEntry)).toThrow(
      'Duplicate snapshot entry',
    );
    const unsorted = structuredClone(canonical) as unknown as {
      routines: Array<{ snapshots: Array<{ entries: Array<unknown> }> }>;
    };
    unsorted.routines[0]!.snapshots[0]!.entries.reverse();
    expect(() => parseFitnessDocumentV2(unsorted)).toThrow('not sorted');
    const folded = structuredClone(canonical) as unknown as {
      routines: Array<{
        snapshots: Array<{ entries: Array<{ foldedName: string }> }>;
      }>;
    };
    folded.routines[0]!.snapshots[0]!.entries[0]!.foldedName = 'wrong';
    expect(() => parseFitnessDocumentV2(folded)).toThrow('not canonical');
  });

  it('inspects versions before parsing and rejects invalid discriminators', () => {
    expect(inspectSchemaVersion({ schemaVersion: 1 })).toBe(1);
    expect(inspectSchemaVersion({ schemaVersion: 2 })).toBe(2);
    expect(() => inspectSchemaVersion({ schemaVersion: 3 })).toThrow(
      'unsupported-version',
    );
    expect(() => inspectSchemaVersion({ schemaVersion: 1.5 })).toThrow(
      'invalid-version',
    );
    expect(() => inspectSchemaVersion(null)).toThrow('invalid-version');
  });
});

describe('import', () => {
  it('decodes v1 and v2 and commits before returning publication data', async () => {
    const migrated = decodeFitnessImport(
      JSON.stringify(baseV1()),
      generator('r', 's1', 'e1', 's2', 'e2', 'p1', 'p2', 'p3'),
    );
    expect(decodeFitnessImport(JSON.stringify(migrated), generator())).toEqual(
      migrated,
    );
    const commit = vi.fn().mockResolvedValue({ storageRevision: 3 });
    await expect(
      importFitnessDocument(JSON.stringify(migrated), generator(), 2, commit),
    ).resolves.toEqual({ document: migrated, storageRevision: 3 });
    expect(commit).toHaveBeenCalledWith(2, migrated);
  });

  it.each([
    ['{', 'invalid-import'],
    [JSON.stringify({ schemaVersion: 3 }), 'unsupported-version'],
    [
      JSON.stringify({ schemaVersion: 2, routines: [], unknown: true }),
      'invalid-import',
    ],
  ])('rejects invalid input safely', (text, code) => {
    try {
      decodeFitnessImport(text, generator());
      throw new Error('expected failure');
    } catch (error) {
      expect((error as FitnessError).code).toBe(code);
    }
  });

  it('preserves typed migration failures', () => {
    const duplicate = baseV1();
    duplicate.routines[0]!.id = 'duplicate';
    duplicate.routines[0]!.sessions[0]!.id = 'duplicate';
    expect(() =>
      decodeFitnessImport(JSON.stringify(duplicate), generator()),
    ).toThrow(FitnessError);
  });

  it('does not publish when persistence rejects', async () => {
    const valid: FitnessDocumentV2 = { schemaVersion: 2, routines: [] };
    await expect(
      importFitnessDocument(
        JSON.stringify(valid),
        generator(),
        0,
        vi.fn().mockRejectedValue(new Error('quota')),
      ),
    ).rejects.toThrow('quota');
  });
});
