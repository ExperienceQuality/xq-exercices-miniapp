import { expect, test } from './support/app.js';

const abortNextReadwriteTransaction = () => {
  const nativeTransaction = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function (
    this: IDBDatabase,
    ...args: Parameters<IDBDatabase['transaction']>
  ) {
    const transaction = Reflect.apply(nativeTransaction, this, args);
    if (args[1] === 'readwrite') queueMicrotask(() => transaction.abort());
    IDBDatabase.prototype.transaction = nativeTransaction;
    return transaction;
  };
};

test.describe('Progress snapshot acceptance', () => {
  test.beforeEach(async ({ app }) => {
    await app.startFreshApp('snapshots');
    await app.createRoutine('Snapshot Routine');
    await app.click('Back');
    await app.click('Snapshot Routine');
  });

  test('SNAPSHOT-01 captures the first immutable metric values (FIT-031)', async ({
    app,
  }) => {
    await app.addSession('Snapshot Session');
    await app.click('Snapshot Session');
    await app.addExercise({
      name: 'Snapshot Lift',
      sets: 4,
      repetitions: 12,
      weightKg: 22.5,
    });
    await app.click('Back');
    await app.click('Capture Progress');
    for (const value of [
      'Snapshot Lift',
      '4',
      '12',
      '22.5',
      'First snapshot',
    ]) {
      await app.expectText(value);
    }
    await expect(app.page.locator('.progress-row')).toHaveCount(1);
  });

  test('SNAPSHOT-02 accepts an empty capture with guidance (FIT-032)', async ({
    app,
  }) => {
    await app.click('Capture Progress');
    await app.expectText('No Exercises Captured');
    await expect(app.page.locator('.empty-report')).toContainText(
      'Add exercises before your next snapshot.',
    );
    await app.expectText('add exercises');
  });

  test('SNAPSHOT-03 aggregates folded names with independent maxima and canonical order (FIT-033)', async ({
    app,
  }) => {
    await app.addSession('First Ordered Session');
    await app.click('First Ordered Session');
    await app.addExercise({
      name: '  Bench Press  ',
      sets: 3,
      repetitions: 12,
      weightKg: 40,
    });
    await app.click('Back');
    await app.addSession('Second Ordered Session');
    await app.click('Second Ordered Session');
    await app.addExercise({
      name: 'bench press',
      sets: 5,
      repetitions: 8,
      weightKg: 50,
    });
    await app.addExercise({
      name: 'Alpha Lift',
      sets: 1,
      repetitions: 1,
      weightKg: 0,
    });
    await app.click('Back');
    await app.click('Capture Progress');
    await app.waitForSettled(
      async () => (await app.bodyText()).includes('reps'),
      'Progress snapshot did not render aggregated entries.',
    );
    const text = await app.bodyText();
    expect(text.match(/Bench Press/gi) ?? []).toHaveLength(1);
    expect(text.indexOf('Alpha Lift')).toBeLessThan(
      text.indexOf('Bench Press'),
    );
    for (const maximum of ['5', '12', '50']) expect(text).toContain(maximum);
  });

  test('SNAPSHOT-04 through SNAPSHOT-07 classify repetitions and weight independently (FIT-034, FIT-035, FIT-036, FIT-037)', async ({
    app,
  }) => {
    await app.click('Back');
    await app.importFixture('valid-v2.json');
    await app.expectText('Fitness data imported.');
    await app.click('Power Base');
    await expect(app.page.locator('.progress-arrow')).toHaveCount(4);
    await expect(app.page.locator('.progress-increased')).toHaveCount(2);
    await expect(app.page.locator('.progress-decreased')).toHaveCount(1);
    await expect(app.page.locator('.progress-same')).toHaveCount(1);
    await expect(app.page.locator('.progress-increased').first()).toHaveCSS(
      'color',
      'rgb(46, 125, 50)',
    );
    await expect(app.page.locator('.progress-decreased').first()).toHaveCSS(
      'color',
      'rgb(198, 40, 40)',
    );
    await expect(app.page.locator('.progress-same').first()).toHaveCSS(
      'color',
      'rgb(143, 147, 163)',
    );
    await expect(app.page.getByRole('img', { name: 'increased' })).toHaveCount(
      2,
    );
    await expect(app.page.getByRole('img', { name: 'decreased' })).toHaveCount(
      1,
    );
    await expect(app.page.getByRole('img', { name: 'same' })).toHaveCount(1);
  });

  test('SNAPSHOT-08 through SNAPSHOT-10 retain two immutable captures and allow immediate capture (FIT-038, FIT-039, FIT-040)', async ({
    app,
  }) => {
    await app.addSession('Capture Session');
    await app.click('Capture Session');
    await app.addExercise({
      name: 'Immutable Lift',
      repetitions: 10,
      weightKg: 10,
    });
    await app.click('Back');
    await app.click('Capture Progress');
    await app.click('Capture Progress');
    await app.click('Capture Progress');
    await app.waitForSettled(
      async () => (await app.bodyText()).includes('reps'),
      'Progress snapshots did not render aggregated entries.',
    );
    const text = await app.bodyText();
    expect((text.match(/snapshot/gi) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((text.match(/snapshot/gi) ?? []).length).toBeLessThan(4);
    await app.expectText('10');
  });

  test('SNAPSHOT-11 restores the latest comparison after reload (FIT-041)', async ({
    app,
  }) => {
    await app.click('Back');
    await app.importFixture('valid-v2.json');
    await app.click('Power Base');
    await app.page.reload();
    await app.click('Power Base');
    await expect(app.page.locator('.progress-row')).toHaveCount(2);
    await expect(app.page.locator('.progress-increased')).toHaveCount(2);
    await expect(app.page.locator('.progress-decreased')).toHaveCount(1);
    await expect(app.page.locator('.progress-same')).toHaveCount(1);
  });
});

test.describe('Fitness import acceptance', () => {
  test.beforeEach(async ({ app }) => {
    await app.startFreshApp('import');
    await app.createRoutine('Import Sentinel');
    await app.click('Back');
  });

  test('IMPORT-01 replaces state from canonical v2 JSON (FIT-042)', async ({
    app,
  }) => {
    await app.importFixture('valid-v2.json');
    await app.expectText('Fitness data imported.');
    await app.expectText('Power Base');
    await expect(
      app.page.getByRole('button', { name: /Power Base/ }),
    ).toBeVisible();
    await app.expectNoText('Import Sentinel');
  });

  test('IMPORT-02 migrates v1, normalizes it, and persists newest snapshots (FIT-043)', async ({
    app,
  }) => {
    await app.importFixture('valid-v1.json');
    await app.expectText('Fitness data imported.');
    await app.expectText('Legacy Strength');
    await app.page.reload();
    await app.expectText('Legacy Strength');
    await expect(
      app.page.getByRole('button', { name: /Legacy Strength/ }),
    ).toBeVisible();
    await app.expectNoText('Import Sentinel');
  });

  test('IMPORT-03 rejects malformed and invalid v2 documents atomically (FIT-044)', async ({
    app,
  }) => {
    for (const fixture of ['malformed.json', 'invalid-v2.json']) {
      await app.importFixture(fixture);
      await app.expectText('invalid');
      await app.expectText('Import Sentinel');
      await app.expectNoText('Fitness data imported.');
    }
    await expect(
      app.page.getByRole('button', { name: /Import Sentinel/ }),
    ).toBeVisible();
  });

  test('IMPORT-04 rejects unsupported future schema without overwrite (FIT-045)', async ({
    app,
  }) => {
    await app.importFixture('future-v3.json');
    await app.expectText('not supported');
    await app.expectText('Import Sentinel');
    await expect(
      app.page.getByRole('button', { name: /Import Sentinel/ }),
    ).toBeVisible();
    await app.expectNoText('Fitness data imported.');
  });

  test('IMPORT-05 treats an empty change event as picker cancellation (FIT-046)', async ({
    app,
  }) => {
    await app.page
      .locator('input[type="file"]')
      .dispatchEvent('change', { bubbles: true });
    await app.expectText('Import Sentinel');
    await expect(
      app.page.getByRole('button', { name: /Import Sentinel/ }),
    ).toBeVisible();
    await app.expectNoText('Fitness data imported.');
    await app.expectNoText('invalid');
  });

  test('IMPORT-06 keeps the prior state when an import commit is aborted (FIT-047)', async ({
    app,
  }) => {
    await app.page.evaluate(abortNextReadwriteTransaction);
    await app.importFixture('valid-v2.json');
    await app.expectText('could not be saved');
    await app.expectText('Import Sentinel');
    await expect(
      app.page.getByRole('button', { name: /Import Sentinel/ }),
    ).toBeVisible();
    await app.expectNoText('Power Base');
  });
});

test.describe('Persistence and recovery acceptance', () => {
  test('PERSIST-01 publishes only after successful persistence (FIT-048)', async ({
    app,
  }) => {
    await app.startFreshApp('persist-before-publish');
    await app.click('Create Routine');
    const original = await app.bodyText();
    await app.page.evaluate(abortNextReadwriteTransaction);
    await app.fill('Routine name', 'Must Not Publish');
    await app.click('Save');
    await app.expectText('could not be saved');
    await expect(app.page.getByLabel('Routine name')).toHaveValue(
      'Must Not Publish',
    );
    expect(original).not.toContain('Must Not Publish');
    await app.click('Cancel');
    await expect(app.page.getByLabel('Routine name')).toHaveCount(0);
    await app.expectNoText('Must Not Publish');
  });

  test('PERSIST-02 restores a damaged primary from valid recovery (FIT-049)', async ({
    app,
  }) => {
    await app.startFreshApp('damaged-primary');
    const primary = await app.readFixture('corrupt-primary.json');
    const recovery = await app.readFixture('valid-recovery.json');
    await app.seedRecords({ primary, recovery });
    await app.page.reload();
    await app.expectText('Recovered Synthetic Routine');
    await expect(
      app.page.getByRole('button', { name: /Recovered Synthetic Routine/ }),
    ).toBeVisible();
  });

  test('PERSIST-03 fails closed for future primary and does not downgrade (FIT-050)', async ({
    app,
  }) => {
    await app.startFreshApp('future-primary');
    const recovery = await app.readFixture('valid-recovery.json');
    await app.seedRecords({
      primary: {
        storageRevision: 12,
        document: await app.readFixture('future-v3.json'),
      },
      recovery,
    });
    await app.page.reload();
    await app.expectText('not supported');
    await expect(app.page.getByRole('alert')).toBeVisible();
    await app.expectNoText('Recovered Synthetic Routine');
  });

  test('PERSIST-04 isolates UI-test namespaces from production and peers (FIT-051)', async ({
    app,
  }) => {
    const first = await app.startFreshApp('namespace-a');
    await app.createRoutine('Namespace A Sentinel');
    const second = await app.startFreshApp('namespace-b');
    await app.expectNoText('Namespace A Sentinel');
    const names = await app.page.evaluate(async () =>
      (await indexedDB.databases()).map((item) => item.name),
    );
    expect(names).toContain(`xq-fitness-ui-test-${first}`);
    expect(names).toContain(`xq-fitness-ui-test-${second}`);
    expect(names).not.toContain('xq-fitness');
  });

  test('PERSIST-05 restores the complete hierarchy after normal reload (FIT-052)', async ({
    app,
  }) => {
    await app.startFreshApp('normal-relaunch');
    await app.importFixture('valid-v2.json');
    await app.page.reload();
    await app.expectText('Power Base');
    await app.click('Power Base');
    await expect(app.page.locator('.progress-row')).toHaveCount(2);
    await app.expectText('Upper');
    await app.expectText('Lower');
    await expect(app.page.locator('.progress-increased').first()).toBeVisible();
  });
});
