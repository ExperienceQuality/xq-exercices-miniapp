import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import {
  createAutomatedTestNamespace,
  resolveFitnessDatabaseName,
} from '../../app/dependencies';
import type { FitnessDocumentV2 } from '../domain/model';
import { createIndexedDbFitnessRepository } from './indexeddb-fitness-repository';

const state = (name = 'A'): FitnessDocumentV2 => ({
  schemaVersion: 2,
  routines: [{ id: `r-${name}`, name, sessions: [], snapshots: [] }],
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

  it('commits atomically with prior primary as recovery and rejects stale revisions', async () => {
    const ns = namespace();
    const repository = createIndexedDbFitnessRepository(ns);
    await repository.load();
    await expect(repository.commit(0, state())).resolves.toEqual({
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
    await expect(repository.commit(0, state('B'))).rejects.toMatchObject({
      code: 'storage-conflict',
    });
    expect((await repository.load()).document).toEqual(state());
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

  it('validates the complete candidate before any write', async () => {
    const ns = namespace();
    const repository = createIndexedDbFitnessRepository(ns);
    await repository.load();
    const invalid = {
      schemaVersion: 2,
      routines: [{ id: 'r', name: ' ', sessions: [], snapshots: [] }],
    } as unknown as FitnessDocumentV2;
    await expect(repository.commit(0, invalid)).rejects.toThrow();
    expect((await repository.load()).storageRevision).toBe(0);
  });

  it('maps an IndexedDB commit failure to a safe storage error', async () => {
    const repository = createIndexedDbFitnessRepository(namespace());
    await expect(repository.commit(0, state())).rejects.toMatchObject({
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
    await one.commit(0, state('One'));
    expect((await two.load()).document.routines).toEqual([]);
  });
});
