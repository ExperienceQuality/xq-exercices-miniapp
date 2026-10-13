/* global before, beforeEach, describe, it */
import assert from 'node:assert/strict';

import { browser } from '@wdio/globals';

import {
  addExercise,
  addSession,
  bodyText,
  click,
  createRoutine,
  expectNoText,
  expectText,
  importFixture,
  installNamespaceIsolation,
  readFixture,
  seedRecords,
  startFreshApp,
} from './support/app.js';

describe('Progress snapshot acceptance', () => {
  before(installNamespaceIsolation);
  beforeEach(async () => {
    await startFreshApp('snapshots');
    await createRoutine('Snapshot Routine');
  });

  it('SNAPSHOT-01 captures the first immutable metric values (FIT-031)', async () => {
    await addSession('Snapshot Session');
    await click('Snapshot Session');
    await addExercise({
      name: 'Snapshot Lift',
      sets: 4,
      repetitions: 12,
      weightKg: 22.5,
    });
    await click('Back');
    await click('Capture Progress');
    for (const value of [
      'Snapshot Lift',
      '4',
      '12',
      '22.5',
      'First snapshot',
    ]) {
      await expectText(value);
    }
  });

  it('SNAPSHOT-02 accepts an empty capture with guidance (FIT-032)', async () => {
    await click('Capture Progress');
    await expectText('No Exercises Captured');
    await expectText('add exercises');
  });

  it('SNAPSHOT-03 aggregates folded names with independent maxima and canonical order (FIT-033)', async () => {
    await addSession('First Ordered Session');
    await click('First Ordered Session');
    await addExercise({
      name: '  Bench Press  ',
      sets: 3,
      repetitions: 12,
      weightKg: 40,
    });
    await click('Back');
    await addSession('Second Ordered Session');
    await click('Second Ordered Session');
    await addExercise({
      name: 'bench press',
      sets: 5,
      repetitions: 8,
      weightKg: 50,
    });
    await addExercise({
      name: 'Alpha Lift',
      sets: 1,
      repetitions: 1,
      weightKg: 0,
    });
    await click('Back');
    await click('Capture Progress');
    const text = await bodyText();
    assert.equal((text.match(/Bench Press/gi) ?? []).length, 1);
    assert.ok(text.indexOf('Alpha Lift') < text.indexOf('Bench Press'));
    for (const maximum of ['5', '12', '50']) assert.ok(text.includes(maximum));
  });

  it('SNAPSHOT-04 through SNAPSHOT-07 classify repetitions and weight independently (FIT-034, FIT-035, FIT-036, FIT-037)', async () => {
    await importFixture('valid-v2.json');
    await expectText('Fitness data imported.');
    await click('Power Base');
    const report = await bodyText();
    for (const classification of ['Increased', 'Decreased', 'Same']) {
      assert.ok(
        report.includes(classification) ||
          report.includes(classification.toLowerCase()),
      );
    }
  });

  it('SNAPSHOT-08 through SNAPSHOT-10 retain two immutable captures and allow immediate capture (FIT-038, FIT-039, FIT-040)', async () => {
    await addSession('Capture Session');
    await click('Capture Session');
    await addExercise({
      name: 'Immutable Lift',
      repetitions: 10,
      weightKg: 10,
    });
    await click('Back');
    await click('Capture Progress');
    await click('Capture Progress');
    await click('Capture Progress');
    const text = await bodyText();
    assert.ok((text.match(/snapshot/gi) ?? []).length >= 2);
    assert.ok((text.match(/snapshot/gi) ?? []).length < 4);
    await expectText('10');
  });

  it('SNAPSHOT-11 restores the latest comparison after reload (FIT-041)', async () => {
    await importFixture('valid-v2.json');
    await click('Power Base');
    await browser.refresh();
    await expectText('Increased');
    await expectText('Decreased');
    await expectText('Same');
  });
});

describe('Fitness import acceptance', () => {
  before(installNamespaceIsolation);
  beforeEach(async () => {
    await startFreshApp('import');
    await createRoutine('Import Sentinel');
    await click('Back');
  });

  it('IMPORT-01 replaces state from canonical v2 JSON (FIT-042)', async () => {
    await importFixture('valid-v2.json');
    await expectText('Fitness data imported.');
    await expectText('Power Base');
    await expectNoText('Import Sentinel');
  });

  it('IMPORT-02 migrates v1, normalizes it, and persists newest snapshots (FIT-043)', async () => {
    await importFixture('valid-v1.json');
    await expectText('Fitness data imported.');
    await expectText('Legacy Strength');
    await browser.refresh();
    await expectText('Legacy Strength');
    await expectNoText('Import Sentinel');
  });

  it('IMPORT-03 rejects malformed and invalid v2 documents atomically (FIT-044)', async () => {
    for (const fixture of ['malformed.json', 'invalid-v2.json']) {
      await importFixture(fixture);
      await expectText('invalid');
      await expectText('Import Sentinel');
      await expectNoText('Fitness data imported.');
    }
  });

  it('IMPORT-04 rejects unsupported future schema without overwrite (FIT-045)', async () => {
    await importFixture('future-v3.json');
    await expectText('not supported');
    await expectText('Import Sentinel');
    await expectNoText('Fitness data imported.');
  });

  it('IMPORT-05 treats an empty change event as picker cancellation (FIT-046)', async () => {
    await browser.execute(() => {
      document
        .querySelector('input[type="file"]')
        ?.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expectText('Import Sentinel');
    await expectNoText('Fitness data imported.');
    await expectNoText('invalid');
  });

  it('IMPORT-06 keeps the prior state when an import commit is aborted (FIT-047)', async () => {
    await browser.execute(() => {
      const original = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function (...args) {
        const transaction = original.apply(this, args);
        if (args[1] === 'readwrite') queueMicrotask(() => transaction.abort());
        IDBDatabase.prototype.transaction = original;
        return transaction;
      };
    });
    await importFixture('valid-v2.json');
    await expectText('could not be saved');
    await expectText('Import Sentinel');
    await expectNoText('Power Base');
  });
});

describe('Persistence and recovery acceptance', () => {
  before(installNamespaceIsolation);

  it('PERSIST-01 publishes only after successful persistence (FIT-048)', async () => {
    await startFreshApp('persist-before-publish');
    await click('Create Routine');
    const original = await bodyText();
    await browser.execute(() => {
      const nativeTransaction = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function (...args) {
        const transaction = nativeTransaction.apply(this, args);
        if (args[1] === 'readwrite') queueMicrotask(() => transaction.abort());
        IDBDatabase.prototype.transaction = nativeTransaction;
        return transaction;
      };
    });
    const { fill } = await import('./support/app.js');
    await fill('Routine name', 'Must Not Publish');
    await click('Save');
    await expectText('could not be saved');
    assert.equal(
      (await bodyText()).includes('Must Not Publish') &&
        !original.includes('Must Not Publish'),
      true,
    );
    await click('Cancel');
    await expectNoText('Must Not Publish');
  });

  it('PERSIST-02 restores a damaged primary from valid recovery (FIT-049)', async () => {
    await startFreshApp('damaged-primary');
    const primary = await readFixture('corrupt-primary.json');
    const recovery = await readFixture('valid-recovery.json');
    await seedRecords({ primary, recovery });
    await browser.refresh();
    await expectText('Recovered Synthetic Routine');
  });

  it('PERSIST-03 fails closed for future primary and does not downgrade (FIT-050)', async () => {
    await startFreshApp('future-primary');
    const recovery = await readFixture('valid-recovery.json');
    await seedRecords({
      primary: {
        storageRevision: 12,
        document: await readFixture('future-v3.json'),
      },
      recovery,
    });
    await browser.refresh();
    await expectText('not supported');
    await expectNoText('Recovered Synthetic Routine');
  });

  it('PERSIST-04 isolates UI-test namespaces from production and peers (FIT-051)', async () => {
    const first = await startFreshApp('namespace-a');
    await createRoutine('Namespace A Sentinel');
    const second = await startFreshApp('namespace-b');
    await expectNoText('Namespace A Sentinel');
    const names = await browser.executeAsync((done) => {
      indexedDB
        .databases()
        .then((items) => done(items.map((item) => item.name)));
    });
    assert.ok(names.includes(`xq-fitness-ui-test-${first}`));
    assert.ok(names.includes(`xq-fitness-ui-test-${second}`));
    assert.ok(!names.includes('xq-fitness'));
  });

  it('PERSIST-05 restores the complete hierarchy after normal reload (FIT-052)', async () => {
    await startFreshApp('normal-relaunch');
    await importFixture('valid-v2.json');
    await browser.refresh();
    await expectText('Power Base');
    await click('Power Base');
    await expectText('Upper');
    await expectText('Lower');
    await expectText('Increased');
  });
});
