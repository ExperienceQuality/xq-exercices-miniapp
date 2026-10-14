/* global before, beforeEach, describe, it */
import assert from 'node:assert/strict';

import { $, browser } from '@wdio/globals';

import {
  addExercise,
  addSession,
  bodyText,
  click,
  control,
  createRoutine,
  expectDisabled,
  expectNoText,
  expectText,
  fill,
  installNamespaceIsolation,
  readFixture,
  seedRecords,
  startFreshApp,
} from './support/app.js';

describe('Fitness availability and routine acceptance', () => {
  before(installNamespaceIsolation);
  beforeEach(() => startFreshApp('crud'));

  it('AVAIL-01 and ROUTINE-01 open a usable empty Fitness app (FIT-001, FIT-004)', async () => {
    await expectText('Fitness');
    await expectText('Create Routine');
    assert.ok(
      (await $('main').isExisting()) || (await $('[role="main"]').isExisting()),
    );
  });

  it('ROUTINE-02 and ROUTINE-03 reject blank input and cancel drafts (FIT-005, FIT-006)', async () => {
    await click('Create Routine');
    await fill('Routine name', '   ');
    await expectDisabled('Save');
    await fill('Routine name', 'Unsaved Synthetic Routine');
    await fill('Notes', 'Unsaved synthetic notes');
    await click('Cancel');
    await expectNoText('Unsaved Synthetic Routine');
  });

  it('ROUTINE-04 through ROUTINE-08 create, normalize, select, and reload routines (FIT-007, FIT-008, FIT-009, FIT-010, FIT-011)', async () => {
    await createRoutine('  Synthetic Routine  ', '   ');
    await expectText('Synthetic Routine');
    await browser.refresh();
    await expectText('Synthetic Routine');
    await click('Back');
    await createRoutine(
      '  Synthetic Notes Routine  ',
      '  Visible synthetic notes  ',
    );
    await expectText('Synthetic Notes Routine');
    await expectText('Visible synthetic notes');
    await click('Back');
    await click('Synthetic Routine');
    await expectText('Synthetic Routine');
    await expectNoText('Visible synthetic notes');
  });

  it('AVAIL-02 and AVAIL-03 expose a contained retry without destructive reset (FIT-002, FIT-003)', async () => {
    const corrupt = await readFixture('corrupt-primary.json');
    await seedRecords({ primary: corrupt, recovery: corrupt });
    await browser.refresh();
    await expectText('unavailable');
    await expectText('Retry');
    const originalError = await bodyText();
    await click('Retry');
    await expectText('unavailable');
    assert.equal(await bodyText(), originalError);
  });
});

describe('Training session acceptance', () => {
  before(installNamespaceIsolation);
  beforeEach(async () => {
    await startFreshApp('sessions');
    await createRoutine('Session Routine');
  });

  it('SESSION-01 through SESSION-03 start empty, validate, and append (FIT-012, FIT-013, FIT-014)', async () => {
    await expectText('Add Training Session');
    await click('Add Training Session');
    await fill('Session name', '   ');
    await expectDisabled('Save');
    await fill('Session name', '  Session One  ');
    await click('Save');
    await expectText('Session One');
  });

  it('SESSION-04 and SESSION-05 preserve append order beyond seven sessions (FIT-015, FIT-016)', async () => {
    for (let index = 1; index <= 8; index += 1) {
      await addSession(`Synthetic Session ${index}`);
    }
    const sessionNames = await browser.execute(() =>
      [...document.querySelectorAll('[role="tab"]')].map((element) =>
        element.textContent?.trim(),
      ),
    );
    assert.deepEqual(
      sessionNames,
      Array.from({ length: 8 }, (_, index) => `Synthetic Session ${index + 1}`),
    );
  });

  it('SESSION-06 through SESSION-08 retain identity/content, delete without renumbering, and persist (FIT-017, FIT-018, FIT-019)', async () => {
    await addSession('Keep Session');
    await click('Keep Session');
    await addExercise({ name: 'Attached Exercise' });
    await click('Edit Training Session');
    await fill('Session name', '  Renamed Session  ');
    await click('Save');
    await expectText('Renamed Session');
    await expectText('Attached Exercise');
    await click('Back');
    await addSession('Delete Session');
    await click('Delete Session');
    await click('Delete Training Session');
    await click('Confirm Delete');
    await expectNoText('Delete Session');
    await browser.refresh();
    await expectText('Renamed Session');
    await expectNoText('Delete Session');
  });
});

describe('Exercise acceptance', () => {
  before(installNamespaceIsolation);
  beforeEach(async () => {
    await startFreshApp('exercises');
    await createRoutine('Exercise Routine');
    await addSession('Session A');
    await click('Session A');
  });

  it('EXERCISE-02 through EXERCISE-05 expose required labels, defaults, cancellation, and numeric validation (FIT-021, FIT-022, FIT-023, FIT-024, FIT-030)', async () => {
    await click('Add Exercise');
    for (const label of [
      'Exercise name',
      'Sets',
      'Repetitions',
      'Weight in kilograms',
    ]) {
      assert.equal(await (await control(label)).isExisting(), true);
    }
    assert.equal(await (await control('Sets')).getValue(), '3');
    assert.equal(await (await control('Repetitions')).getValue(), '10');
    assert.equal(await (await control('Weight in kilograms')).getValue(), '0');
    await fill('Exercise name', '   ');
    await expectDisabled('Save');
    await fill('Exercise name', 'Unsaved Exercise');
    await click('Cancel');
    await expectNoText('Unsaved Exercise');
  });

  it('EXERCISE-01 and EXERCISE-07 isolate valid exercises by parent session (FIT-020, FIT-026)', async () => {
    await addExercise({
      name: '  Session A Exercise  ',
      sets: 4,
      repetitions: 12,
      weightKg: 2.5,
    });
    await expectText('Session A Exercise');
    await click('Back');
    await addSession('Session B');
    await click('Session B');
    await addExercise({ name: 'Session B Exercise' });
    await expectText('Session B Exercise');
    await expectNoText('Session A Exercise');
    await click('Back');
    await click('Session A');
    await expectText('Session A Exercise');
    await expectNoText('Session B Exercise');
  });

  it('EXERCISE-06 rejects invalid metrics without changing stored data (FIT-025)', async () => {
    await click('Add Exercise');
    await fill('Exercise name', 'Invalid Metrics');
    await fill('Sets', 0);
    await fill('Repetitions', -1);
    await fill('Weight in kilograms', -0.5);
    await expectDisabled('Save');
    await expectNoText('Invalid Metrics');
  });

  it('EXERCISE-08 and EXERCISE-09 preserve identity on edit and show the last-item empty state after delete (FIT-027, FIT-028)', async () => {
    await addExercise({ name: 'Editable Exercise' });
    await click('Editable Exercise');
    await click('Edit Exercise');
    await fill('Sets', 5);
    await fill('Repetitions', 6);
    await fill('Weight in kilograms', 7.5);
    await click('Save');
    await expectText('5');
    await expectText('6');
    await expectText('7.5');
    await click('Delete Exercise');
    await click('Confirm Delete');
    await expectNoText('Editable Exercise');
    await expectText('No exercises');
  });
});
