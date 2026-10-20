import { expect, test } from './support/app.js';

test.describe('Fitness availability and routine acceptance', () => {
  test('AVAIL-01 and ROUTINE-01 open a usable empty Fitness app (FIT-001, FIT-004)', async ({
    app,
  }, testInfo) => {
    const runId = `${testInfo.project.name}-${testInfo.testId}-loading`
      .replace(/[^A-Za-z0-9_-]/g, '-')
      .slice(0, 64)
      .replace(/-$/, 'x');
    await app.installLoadGate();
    await app.page.goto('about:blank');
    await app.page.evaluate((id) => {
      window.name = id;
    }, runId);
    await app.page.goto('./', { waitUntil: 'domcontentloaded' });

    const shell = app.page.locator('main.shell');
    await shell.waitFor();
    await expect(shell).toHaveAttribute('data-ready', 'false');
    await expect(
      app.page.getByRole('button', { name: 'Create Routine' }).first(),
    ).toBeDisabled();
    await app.page.evaluate(() =>
      (
        window as unknown as { __releaseFitnessLoad: () => Promise<void> }
      ).__releaseFitnessLoad(),
    );
    await expect(shell).toHaveAttribute('data-ready', 'true');
    await app.expectText('Fitness');
    await app.expectText('Create Routine');
    await expect(shell).toBeVisible();
  });

  test('ROUTINE-02 and ROUTINE-03 reject blank input and cancel drafts (FIT-005, FIT-006)', async ({
    app,
  }) => {
    await app.startFreshApp('crud');
    await app.click('Create Routine');
    await app.fill('Routine name', '   ');
    await app.expectDisabled('Save');
    await app.fill('Routine name', 'Unsaved Synthetic Routine');
    await app.fill('Notes', 'Unsaved synthetic notes');
    await app.click('Cancel');
    await expect(app.page.getByLabel('Routine name')).toHaveCount(0);
    await app.expectNoText('Unsaved Synthetic Routine');
  });

  test('ROUTINE-04 through ROUTINE-08 create, normalize, select, and reload routines (FIT-007, FIT-008, FIT-009, FIT-010, FIT-011)', async ({
    app,
  }) => {
    await app.startFreshApp('crud');
    await app.createRoutine('  Synthetic Routine  ', '   ');
    await app.expectText('Synthetic Routine');
    await app.page.reload();
    await app.expectText('Synthetic Routine');
    await app.click('Synthetic Routine');
    await expect(
      app.page.getByRole('heading', { name: 'Synthetic Routine' }),
    ).toBeVisible();
    await app.expectText('Sessions');
    await app.click('Back');
    await app.createRoutine(
      '  Synthetic Notes Routine  ',
      '  Visible synthetic notes  ',
    );
    await app.expectText('Synthetic Notes Routine');
    await app.expectText('Visible synthetic notes');
    await app.click('Back');
    await app.click('Synthetic Routine');
    await app.expectText('Synthetic Routine');
    await app.expectNoText('Visible synthetic notes');
  });

  test('AVAIL-02 and AVAIL-03 expose a contained retry without destructive reset (FIT-002, FIT-003)', async ({
    app,
  }) => {
    await app.startFreshApp('crud');
    const corrupt = await app.readFixture('corrupt-primary.json');
    await app.seedRecords({ primary: corrupt, recovery: corrupt });
    await app.page.reload();
    await expect(app.page.getByRole('alert')).toBeVisible();
    await app.expectText('unavailable');
    await app.expectText('Retry');
    await app.click('Retry');
    await app.expectText('unavailable');
    await app.expectText('Retry');
  });
});

test.describe('Training session acceptance', () => {
  test.beforeEach(async ({ app }) => {
    await app.startFreshApp('sessions');
    await app.createRoutine('Session Routine');
    await app.click('Back');
    await app.click('Session Routine');
  });

  test('SESSION-01 through SESSION-03 start empty, validate, and append (FIT-012, FIT-013, FIT-014)', async ({
    app,
  }) => {
    await app.expectText('Add Training Session');
    await app.click('Add Training Session');
    await app.fill('Session name', '   ');
    await app.expectDisabled('Save');
    await app.fill('Session name', '  Session One  ');
    await app.click('Save');
    await app.waitForSettled(
      async () => (await app.page.getByLabel('Session name').count()) === 0,
      'Session editor did not close after saving Session One.',
    );
    await app.expectText('Session One');
    await app.click('Session One');
    await expect(
      app.page.getByRole('button', { name: 'Add Exercise' }).first(),
    ).toBeVisible();
    await app.expectText('Exercises');
  });

  test('SESSION-04 and SESSION-05 preserve append order beyond seven sessions (FIT-015, FIT-016)', async ({
    app,
  }) => {
    for (let index = 1; index <= 8; index += 1) {
      await app.addSession(`Synthetic Session ${index}`);
    }
    await expect(
      app.page.locator('.grouped-list').first().locator('strong'),
    ).toHaveText(
      Array.from({ length: 8 }, (_, index) => `Synthetic Session ${index + 1}`),
    );
  });

  test('SESSION-06 through SESSION-08 retain identity/content, delete without renumbering, and persist (FIT-017, FIT-018, FIT-019)', async ({
    app,
  }) => {
    await app.addSession('Keep Session');
    await app.click('Keep Session');
    await app.addExercise({ name: 'Attached Exercise' });
    await app.click('Edit Training Session');
    await app.fill('Session name', '  Renamed Session  ');
    await app.click('Save');
    await app.waitForSettled(
      async () => (await app.page.getByLabel('Session name').count()) === 0,
      'Session editor did not close after saving Renamed Session.',
    );
    await app.expectText('Renamed Session');
    await expect(
      app.page.getByRole('heading', { name: 'Renamed Session' }),
    ).toBeVisible();
    await app.expectText('Attached Exercise');
    await app.click('Back');
    await app.addSession('Delete Session');
    await app.click('Delete Session');
    await app.click('Delete Training Session');
    await app.page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Delete Session' })
      .click();
    await app.expectNoText('Delete Session');
    await app.page.reload();
    await app.click('Session Routine');
    await app.expectText('Renamed Session');
    await app.expectNoText('Delete Session');
  });
});

test.describe('Exercise acceptance', () => {
  test.beforeEach(async ({ app }) => {
    await app.startFreshApp('exercises');
    await app.createRoutine('Exercise Routine');
    await app.click('Back');
    await app.click('Exercise Routine');
    await app.addSession('Session A');
    await app.click('Session A');
  });

  test('EXERCISE-02 through EXERCISE-05 expose required labels, defaults, cancellation, and numeric validation (FIT-021, FIT-022, FIT-023, FIT-024, FIT-030)', async ({
    app,
  }) => {
    await app.click('Add Exercise');
    for (const label of [
      'Exercise name',
      'Sets',
      'Repetitions',
      'Weight in kilograms',
    ]) {
      await expect(app.page.getByLabel(label)).toBeVisible();
    }
    await expect(app.page.getByLabel('Sets')).toHaveValue('3');
    await expect(app.page.getByLabel('Repetitions')).toHaveValue('10');
    await expect(app.page.getByLabel('Weight in kilograms')).toHaveValue('0');
    await app.fill('Exercise name', '   ');
    await app.expectDisabled('Save');
    await app.fill('Exercise name', 'Unsaved Exercise');
    await app.click('Cancel');
    await app.expectNoText('Unsaved Exercise');
  });

  test('EXERCISE-01 and EXERCISE-07 isolate valid exercises by parent session (FIT-020, FIT-026)', async ({
    app,
  }) => {
    await app.addExercise({
      name: '  Session A Exercise  ',
      sets: 4,
      repetitions: 12,
      weightKg: 2.5,
    });
    await app.expectText('Session A Exercise');
    await app.click('Back');
    await app.addSession('Session B');
    await app.click('Session B');
    await app.addExercise({ name: 'Session B Exercise' });
    await app.expectText('Session B Exercise');
    await app.expectNoText('Session A Exercise');
    await app.click('Back');
    await app.click('Session A');
    await app.expectText('Session A Exercise');
    await expect(app.page.locator('.exercise-row')).toHaveCount(1);
    await app.expectNoText('Session B Exercise');
  });

  test('EXERCISE-06 rejects invalid metrics without changing stored data (FIT-025)', async ({
    app,
  }) => {
    await app.click('Add Exercise');
    await app.fill('Exercise name', 'Invalid Metrics');
    await app.fill('Sets', 0);
    await app.fill('Repetitions', -1);
    await app.fill('Weight in kilograms', -0.5);
    await expect(app.page.getByLabel('Exercise name')).toHaveValue(
      'Invalid Metrics',
    );
    await app.expectDisabled('Save');
    await app.click('Cancel');
    await app.expectNoText('Invalid Metrics');
  });

  test('EXERCISE-11 accepts a decimal weight typed key by key (FIT-030)', async ({
    app,
  }) => {
    await app.click('Add Exercise');
    const weight = app.page.getByLabel('Weight in kilograms');
    await weight.fill('');
    await weight.pressSequentially('31.8');
    await expect(weight).toHaveValue('31.8');
  });

  test('EXERCISE-11 accepts a comma-separated decimal weight (FIT-030)', async ({
    app,
  }) => {
    await app.click('Add Exercise');
    await app.fill('Exercise name', 'Comma Weight Exercise');
    const weight = app.page.getByLabel('Weight in kilograms');
    await weight.fill('');
    await weight.pressSequentially('12,5');
    await expect(weight).toHaveValue('12,5');
    await app.expectDisabled('Save', false);
    await app.click('Save');
    await app.waitForSettled(
      async () => (await app.page.getByLabel('Exercise name').count()) === 0,
      'Exercise editor did not close after saving Comma Weight Exercise.',
    );
    await app.expectText('12.5');
  });

  test('EXERCISE-01 wraps a long exercise name instead of truncating it (FIT-020)', async ({
    app,
  }) => {
    const longName =
      'Extremely long exercise name that must remain fully visible to the user';
    await app.addExercise({ name: longName });
    const name = app.page.locator('.exercise-row .exercise-name');
    await expect(name).toHaveText(longName);
    const metrics = await name.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        whiteSpace: style.whiteSpace,
        height: element.getBoundingClientRect().height,
        fontSize: Number.parseFloat(style.fontSize),
      };
    });
    expect(metrics.whiteSpace).toBe('normal');
    expect(metrics.height).toBeGreaterThan(metrics.fontSize * 1.5);
  });

  test('EXERCISE-08 and EXERCISE-09 preserve identity on edit and show the last-item empty state after delete (FIT-027, FIT-028)', async ({
    app,
  }) => {
    await app.addExercise({ name: 'Editable Exercise' });
    await app.click('Edit Editable Exercise');
    await app.fill('Sets', 5);
    await app.fill('Repetitions', 6);
    await app.fill('Weight in kilograms', 7.5);
    await app.click('Save');
    await app.waitForSettled(
      async () => (await app.page.getByLabel('Exercise name').count()) === 0,
      'Exercise editor did not close after saving Editable Exercise.',
    );
    await app.expectText('5');
    await app.expectText('6');
    await app.expectText('7.5');
    await app.click('Delete Editable Exercise');
    await app.page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Delete Exercise' })
      .click();
    await app.expectNoText('Editable Exercise');
    await expect(app.page.locator('.exercise-row')).toHaveCount(0);
    await app.expectText('No exercises');
  });
});
