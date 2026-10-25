import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import {
  createAutomatedTestNamespace,
  resolveFitnessDatabaseName,
} from '../../app/dependencies';
import type { FitnessDocumentV2, RoutineV2 } from '../domain/model';
import { createIndexedDbFitnessRepository } from './indexeddb-fitness-repository';

const routine = (name = 'A'): RoutineV2 => ({
  id: `r-${name}`,
  name,
  sessions: [],
  snapshots: [],
});

const state = (name = 'A'): FitnessDocumentV2 => ({
  schemaVersion: 2,
  routines: [routine(name)],
});

let sequence = 0;
function namespace() {
  sequence += 1;
  return createAutomatedTestNamespace(`repository-${sequence}`);
}

async function seed(
  name: string,
  primary: unknown,
  recovery: unknown,
): Promise<void> {
  const database = await openDB(name, 1, {
    upgrade(db) {
      db.createObjectStore('records');
    },
  });
  const tx = database.transaction('records', 'readwrite');
  await tx.store.put(primary, 'primary');
  await tx.store.put(recovery, 'recovery');
  await tx.done;
  database.close();
}

async function read(name: string, key: string): Promise<unknown> {
  const database = await openDB(name, 1);
  const value = await database.get('records', key);
  database.close();
  return value;
}

describe('IndexedDbFitnessRepository', () => {
  it('initializes independent primary and recovery records and reloads', async () => {
    const ns = namespace();
    const repository = createIndexedDbFitnessRepository(ns);
    await expect(repository.load()).resolves.toMatchObject({
      document: { schemaVersion: 2, routines: [] },
      storageRevision: 0,
      recovered: false,
    });
    const name = resolveFitnessDatabaseName(ns);
    expect(await read(name, 'primary')).toEqual(await read(name, 'recovery'));
    await expect(repository.load()).resolves.toMatchObject({
      recovered: false,
    });
  });

  it('applies atomically with prior primary as recovery and rejects stale revisions', async () => {
    const ns = namespace();
    const repository = createIndexedDbFitnessRepository(ns);
    await repository.load();
    await expect(
      repository.apply(0, { kind: 'replace-document', document: state() }),
    ).resolves.toEqual({
      storageRevision: 1,
    });
    expect(await repository.load()).toMatchObject({
      document: state(),
      storageRevision: 1,
    });
    const recovery = (await read(
      resolveFitnessDatabaseName(ns),
      'recovery',
    )) as { storageRevision: number };
    expect(recovery.storageRevision).toBe(0);
    await expect(
      repository.apply(0, {
        kind: 'replace-document',
        document: state('B'),
      }),
    ).rejects.toMatchObject({
      code: 'storage-conflict',
    });
    expect((await repository.load()).document).toEqual(state());
  });

  it('applies granular mutations against the stored document and reloads them', async () => {
    const ns = namespace();
    const repository = createIndexedDbFitnessRepository(ns);
    await repository.load();
    await repository.apply(0, {
      kind: 'create-routine',
      routine: routine('1'),
    });
    await repository.apply(1, {
      kind: 'add-session',
      routineId: 'r-1',
      session: { id: 's-1', name: 'One', order: 1, exercises: [] },
    });
    await repository.apply(2, {
      kind: 'add-session',
      routineId: 'r-1',
      session: { id: 's-2', name: 'Two', order: 2, exercises: [] },
    });
    await repository.apply(3, {
      kind: 'rename-session',
      routineId: 'r-1',
      sessionId: 's-2',
      name: 'Second',
    });
    await repository.apply(4, {
      kind: 'add-exercise',
      routineId: 'r-1',
      sessionId: 's-1',
      exercise: {
        id: 'e-1',
        name: 'Press',
        sets: 3,
        repetitions: 10,
        weightKg: 40,
      },
    });
    await repository.apply(5, {
      kind: 'add-exercise',
      routineId: 'r-1',
      sessionId: 's-1',
      exercise: {
        id: 'e-2',
        name: 'Row',
        sets: 3,
        repetitions: 12,
        weightKg: 35,
      },
    });
    await repository.apply(6, {
      kind: 'update-exercise',
      routineId: 'r-1',
      sessionId: 's-1',
      exercise: {
        id: 'e-2',
        name: 'Row',
        sets: 4,
        repetitions: 8,
        weightKg: 45,
      },
    });
    await repository.apply(7, {
      kind: 'reorder-exercises',
      routineId: 'r-1',
      sessionId: 's-1',
      exerciseIds: ['e-2', 'e-1'],
    });
    await repository.apply(8, {
      kind: 'capture-snapshot',
      routineId: 'r-1',
      snapshot: {
        id: 'snap-1',
        capturedAt: '2026-01-01T00:00:00.000Z',
        entries: [],
      },
    });
    await repository.apply(9, {
      kind: 'delete-session',
      routineId: 'r-1',
      sessionId: 's-2',
    });
    const loaded = await repository.load();
    expect(loaded.storageRevision).toBe(10);
    expect(loaded.document).toEqual({
      schemaVersion: 2,
      routines: [
        {
          ...routine('1'),
          sessions: [
            {
              id: 's-1',
              name: 'One',
              order: 1,
              exercises: [
                {
                  id: 'e-2',
                  name: 'Row',
                  sets: 4,
                  repetitions: 8,
                  weightKg: 45,
                },
                {
                  id: 'e-1',
                  name: 'Press',
                  sets: 3,
                  repetitions: 10,
                  weightKg: 40,
                },
              ],
            },
          ],
          snapshots: [
            {
              id: 'snap-1',
              capturedAt: '2026-01-01T00:00:00.000Z',
              entries: [],
            },
          ],
        },
      ],
    });
    // The prior primary is retained as recovery after a granular write.
    const recovery = (await read(
      resolveFitnessDatabaseName(ns),
      'recovery',
    )) as { storageRevision: number; document: FitnessDocumentV2 };
    expect(recovery.storageRevision).toBe(9);
    expect(
      recovery.document.routines[0]!.sessions.map((session) => session.id),
    ).toEqual(['s-1', 's-2']);
    // A missing target fails closed and leaves the revision unchanged.
    await expect(
      repository.apply(10, {
        kind: 'delete-exercise',
        routineId: 'r-1',
        sessionId: 's-1',
        exerciseId: 'missing',
      }),
    ).rejects.toMatchObject({ code: 'missing-exercise' });
    expect((await repository.load()).storageRevision).toBe(10);
  });

  it('replays reorder-sessions atomically and leaves storage unchanged on rejection', async () => {
    const ns = namespace();
    const name = resolveFitnessDatabaseName(ns);
    const repository = createIndexedDbFitnessRepository(ns);
    await repository.load();
    await repository.apply(0, {
      kind: 'create-routine',
      routine: routine('1'),
    });
    await repository.apply(1, {
      kind: 'add-session',
      routineId: 'r-1',
      session: { id: 's-1', name: 'One', order: 1, exercises: [] },
    });
    await repository.apply(2, {
      kind: 'add-session',
      routineId: 'r-1',
      session: { id: 's-2', name: 'Two', order: 2, exercises: [] },
    });
    // FIT-069: a committed reorder permutes order values in one transaction.
    await expect(
      repository.apply(3, {
        kind: 'reorder-sessions',
        routineId: 'r-1',
        sessionIds: ['s-2', 's-1'],
      }),
    ).resolves.toEqual({ storageRevision: 4 });
    const loaded = await repository.load();
    const sessions = [...loaded.document.routines[0]!.sessions].sort(
      (left, right) => left.order - right.order,
    );
    expect(sessions.map((session) => session.id)).toEqual(['s-2', 's-1']);
    // A malformed permutation replay rejects without advancing the revision.
    const primaryBefore = await read(name, 'primary');
    const recoveryBefore = await read(name, 'recovery');
    await expect(
      repository.apply(4, {
        kind: 'reorder-sessions',
        routineId: 'r-1',
        sessionIds: ['s-1', 'foreign'],
      }),
    ).rejects.toMatchObject({ code: 'validation' });
    expect(await read(name, 'primary')).toEqual(primaryBefore);
    expect(await read(name, 'recovery')).toEqual(recoveryBefore);
    // A conflict on the same mutation writes nothing.
    await expect(
      repository.apply(3, {
        kind: 'reorder-sessions',
        routineId: 'r-1',
        sessionIds: ['s-1', 's-2'],
      }),
    ).rejects.toMatchObject({ code: 'storage-conflict' });
    const afterConflict = await repository.load();
    expect(afterConflict.storageRevision).toBe(4);
    expect(
      [...afterConflict.document.routines[0]!.sessions]
        .sort((left, right) => left.order - right.order)
        .map((session) => session.id),
    ).toEqual(['s-2', 's-1']);
  });

  it('keeps pre-existing v2 records writable through granular mutations', async () => {
    const ns = namespace();
    const name = resolveFitnessDatabaseName(ns);
    const prior = {
      storageRevision: 3,
      document: {
        schemaVersion: 2,
        routines: [
          {
            ...routine('old'),
            sessions: [
              { id: 's-old', name: 'Legacy', order: 1, exercises: [] },
            ],
          },
        ],
      },
    };
    await seed(name, prior, { storageRevision: 2, document: state('Older') });
    const repository = createIndexedDbFitnessRepository(ns);
    await repository.apply(3, {
      kind: 'delete-session',
      routineId: 'r-old',
      sessionId: 's-old',
    });
    const loaded = await repository.load();
    expect(loaded.storageRevision).toBe(4);
    expect(loaded.document.routines[0]!.sessions).toEqual([]);
    expect(await read(name, 'recovery')).toEqual(prior);
  });

  it('rejects a stale write from a second adapter without touching either slot', async () => {
    const ns = namespace();
    const name = resolveFitnessDatabaseName(ns);
    const first = createIndexedDbFitnessRepository(ns);
    const second = createIndexedDbFitnessRepository(ns);
    await first.load();
    await second.load();
    await first.apply(0, {
      kind: 'create-routine',
      routine: routine('fresh'),
    });
    const primaryBefore = await read(name, 'primary');
    const recoveryBefore = await read(name, 'recovery');
    await expect(
      second.apply(0, {
        kind: 'create-routine',
        routine: routine('stale'),
      }),
    ).rejects.toMatchObject({ code: 'storage-conflict' });
    expect(await read(name, 'primary')).toEqual(primaryBefore);
    expect(await read(name, 'recovery')).toEqual(recoveryBefore);
  });

  it('restores a damaged primary from valid recovery', async () => {
    const ns = namespace();
    const name = resolveFitnessDatabaseName(ns);
    await seed(
      name,
      { storageRevision: 2, document: 'bad' },
      { storageRevision: 1, document: state('Recovered') },
    );
    const loaded = await createIndexedDbFitnessRepository(ns).load();
    expect(loaded).toMatchObject({
      storageRevision: 1,
      document: state('Recovered'),
      recovered: true,
    });
    expect(await read(name, 'primary')).toEqual(await read(name, 'recovery'));
  });

  it('restores when primary is absent but recovery is valid', async () => {
    const ns = namespace();
    const name = resolveFitnessDatabaseName(ns);
    const database = await openDB(name, 1, {
      upgrade(db) {
        db.createObjectStore('records');
      },
    });
    await database.put(
      'records',
      { storageRevision: 4, document: state('Only recovery') },
      'recovery',
    );
    database.close();
    await expect(
      createIndexedDbFitnessRepository(ns).load(),
    ).resolves.toMatchObject({
      storageRevision: 4,
      recovered: true,
    });
  });

  it('fails closed on future primary without replacing it from recovery', async () => {
    const ns = namespace();
    const name = resolveFitnessDatabaseName(ns);
    const future = {
      storageRevision: 2,
      document: { schemaVersion: 3, routines: [] },
    };
    const recovery = { storageRevision: 1, document: state('Old') };
    await seed(name, future, recovery);
    await expect(
      createIndexedDbFitnessRepository(ns).load(),
    ).rejects.toMatchObject({ code: 'unsupported-version' });
    expect(await read(name, 'primary')).toEqual(future);
    expect(await read(name, 'recovery')).toEqual(recovery);
  });

  it('reports unavailable when neither damaged primary nor recovery can validate', async () => {
    const ns = namespace();
    await seed(resolveFitnessDatabaseName(ns), { bad: true }, { also: 'bad' });
    await expect(
      createIndexedDbFitnessRepository(ns).load(),
    ).rejects.toMatchObject({ code: 'storage-unavailable' });
  });

  it('does not downgrade to a future recovery after primary damage', async () => {
    const ns = namespace();
    await seed(
      resolveFitnessDatabaseName(ns),
      { bad: true },
      { storageRevision: 2, document: { schemaVersion: 3, routines: [] } },
    );
    await expect(
      createIndexedDbFitnessRepository(ns).load(),
    ).rejects.toMatchObject({
      code: 'storage-unavailable',
    });
  });

  it('validates the replayed result and leaves both slots unchanged on failure', async () => {
    const ns = namespace();
    const name = resolveFitnessDatabaseName(ns);
    const repository = createIndexedDbFitnessRepository(ns);
    await repository.load();
    const invalid = {
      schemaVersion: 2,
      routines: [{ id: 'r', name: ' ', sessions: [], snapshots: [] }],
    } as unknown as FitnessDocumentV2;
    const primaryBefore = await read(name, 'primary');
    const recoveryBefore = await read(name, 'recovery');
    await expect(
      repository.apply(0, { kind: 'replace-document', document: invalid }),
    ).rejects.toThrow();
    expect(await read(name, 'primary')).toEqual(primaryBefore);
    expect(await read(name, 'recovery')).toEqual(recoveryBefore);
    expect((await repository.load()).storageRevision).toBe(0);
  });

  it('maps an IndexedDB apply failure to a safe storage error', async () => {
    const repository = createIndexedDbFitnessRepository(namespace());
    await expect(
      repository.apply(0, { kind: 'replace-document', document: state() }),
    ).rejects.toMatchObject({
      code: 'storage-unavailable',
    });
  });

  it('isolates namespaces', async () => {
    const one = createIndexedDbFitnessRepository(
      createAutomatedTestNamespace('one'),
    );
    const two = createIndexedDbFitnessRepository(
      createAutomatedTestNamespace('two'),
    );
    await one.load();
    await two.load();
    await one.apply(0, {
      kind: 'replace-document',
      document: state('One'),
    });
    expect((await two.load()).document.routines).toEqual([]);
  });
});
