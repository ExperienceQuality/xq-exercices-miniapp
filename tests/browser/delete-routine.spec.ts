import AxeBuilder from '@axe-core/playwright';

import { expect, test } from './support/app.js';
import {
  buildMultiRoutineDocument,
  cancelRoutineDelete,
  confirmDialog,
  confirmRoutineDelete,
  expectRevealed,
  openDeleteConfirmFromList,
  openDeleteConfirmFromSwipe,
  persistentDeleteButton,
  persistentDeleteById,
  readRecoveryRecord,
  revealOffset,
  routineOpenButton,
  routineRow,
  seedDocument,
  swipeRoutine,
  swipeTrack,
} from './support/delete-routine.js';
import {
  committedRevision,
  readPrimaryRecord,
} from './support/session-reordering.js';

const hasTouch = (testInfo: { project: { use: { hasTouch?: boolean } } }) =>
  Boolean(testInfo.project.use.hasTouch);

const noHorizontalOverflow = async (page: import('@playwright/test').Page) => {
  const metrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
};

test.describe('Delete routine — list gesture and confirm (FIT-112…FIT-117)', () => {
  test('TA-DR-001 / FIT-112 swipe left, tap Delete, confirm removes routine', async ({
    app,
    context,
  }, testInfo) => {
    await app.startFreshApp('dr-happy');
    await seedDocument(
      app,
      buildMultiRoutineDocument([
        { id: 'keep', name: 'Keep Me', sessions: 1 },
        { id: 'gone', name: 'Gone Routine', sessions: 2, snapshots: 1 },
      ]),
    );
    const before = await readPrimaryRecord(app.page);
    expect(before?.document.routines).toHaveLength(2);

    await openDeleteConfirmFromSwipe(
      context,
      app.page,
      'Gone Routine',
      hasTouch(testInfo),
    );
    const dialog = confirmDialog(app.page);
    await expect(
      dialog.getByRole('heading', { name: 'Delete routine?' }),
    ).toBeVisible();
    await expect(dialog).toContainText('Gone Routine');
    await expect(dialog).toContainText('sessions');
    await confirmRoutineDelete(app.page);

    await expect(routineOpenButton(app.page, 'Gone Routine')).toHaveCount(0);
    await expect(routineOpenButton(app.page, 'Keep Me')).toBeVisible();
    await app.expectText('Routine “Gone Routine” deleted.');
    const after = await readPrimaryRecord(app.page);
    const recovery = await readRecoveryRecord(app.page);
    expect(after?.document.routines.map((routine) => routine.id)).toEqual([
      'keep',
    ]);
    expect(recovery).toEqual(after);
    expect(after?.storageRevision).toBe((before?.storageRevision ?? 0) + 1);
  });

  test('TA-DR-002 / FIT-113 swipe alone never deletes', async ({
    app,
    context,
  }, testInfo) => {
    await app.startFreshApp('dr-reveal-only');
    await seedDocument(
      app,
      buildMultiRoutineDocument([{ id: 'solo', name: 'Solo', sessions: 1 }]),
    );
    const revisionBefore = await committedRevision(app.page);
    await swipeRoutine(context, app.page, 'Solo', 64, hasTouch(testInfo));
    await expectRevealed(app.page, 'Solo', true);
    await expectRevealed(app.page, 'Solo', true);
    await app.page.reload();
    await expect(app.page.locator('[data-ready="true"]')).toHaveCount(1);
    await app.expectText('Solo');
    expect(await committedRevision(app.page)).toBe(revisionBefore);
    await expectRevealed(app.page, 'Solo', false);
  });

  test('TA-DR-003/004/005 reveal threshold, right swipe never opens', async ({
    app,
    context,
  }, testInfo) => {
    await app.startFreshApp('dr-threshold');
    await seedDocument(
      app,
      buildMultiRoutineDocument([{ id: 't', name: 'Threshold', sessions: 0 }]),
    );
    const useTouch = hasTouch(testInfo);

    await swipeRoutine(context, app.page, 'Threshold', 20, useTouch);
    await expect.poll(async () => revealOffset(app.page, 'Threshold')).toBe(0);

    await swipeRoutine(context, app.page, 'Threshold', 40, useTouch);
    await expectRevealed(app.page, 'Threshold', true);

    await app.page.keyboard.press('Escape');
    await expectRevealed(app.page, 'Threshold', false);

    // Rightward: negative left distance.
    await swipeRoutine(context, app.page, 'Threshold', -48, useTouch);
    await expect.poll(async () => revealOffset(app.page, 'Threshold')).toBe(0);
  });

  test('TA-DR-006/007 vertical and diagonal resolve to one axis', async ({
    app,
    context,
  }, testInfo) => {
    const { touchScrollOn } = await import('./support/session-reordering.js');
    await app.startFreshApp('dr-axis');
    await seedDocument(
      app,
      buildMultiRoutineDocument(
        Array.from({ length: 10 }, (_, index) => ({
          id: `r${index}`,
          name: `Axis ${index}`,
        })),
      ),
    );
    // Vertical-dominant pointer drag must not reveal Delete.
    await swipeRoutine(context, app.page, 'Axis 0', 10, hasTouch(testInfo), {
      verticalPx: 120,
    });
    await expect.poll(async () => revealOffset(app.page, 'Axis 0')).toBe(0);

    // Trusted CDP vertical scroll over a row must not reveal Delete.
    const delta = await touchScrollOn(
      context,
      app.page,
      swipeTrack(app.page, 'Axis 0'),
      240,
    );
    expect(Math.abs(delta)).toBeGreaterThan(0);
    await expect.poll(async () => revealOffset(app.page, 'Axis 0')).toBe(0);

    // Dominant horizontal diagonal still reveals.
    await swipeRoutine(context, app.page, 'Axis 1', 70, hasTouch(testInfo), {
      verticalPx: 20,
    });
    await expectRevealed(app.page, 'Axis 1', true);
  });

  test('TA-DR-008 plain tap opens; swipe does not open', async ({
    app,
    context,
  }, testInfo) => {
    await app.startFreshApp('dr-tap');
    await seedDocument(
      app,
      buildMultiRoutineDocument([{ id: 'open', name: 'Open Me', sessions: 1 }]),
    );
    await routineOpenButton(app.page, 'Open Me').click();
    await expect(
      app.page.getByRole('heading', { name: 'Open Me' }),
    ).toBeVisible();
    await app.click('Back');

    await swipeRoutine(context, app.page, 'Open Me', 64, hasTouch(testInfo));
    await expectRevealed(app.page, 'Open Me', true);
    await routineOpenButton(app.page, 'Open Me').click();
    await expect(
      app.page.getByRole('heading', { name: 'Open Me' }),
    ).toHaveCount(0);
    await expect(
      app.page.getByRole('heading', { name: 'Routines' }),
    ).toBeVisible();
  });

  test('TA-DR-009 only one reveal; Escape / outside / scroll closes', async ({
    app,
    context,
  }, testInfo) => {
    await app.startFreshApp('dr-one');
    await seedDocument(
      app,
      buildMultiRoutineDocument([
        { id: 'a', name: 'Alpha' },
        { id: 'b', name: 'Beta' },
        { id: 'c', name: 'Gamma' },
      ]),
    );
    const useTouch = hasTouch(testInfo);
    await swipeRoutine(context, app.page, 'Alpha', 64, useTouch);
    await expectRevealed(app.page, 'Alpha', true);
    await swipeRoutine(context, app.page, 'Beta', 64, useTouch);
    await expectRevealed(app.page, 'Beta', true);
    await expectRevealed(app.page, 'Alpha', false);

    await app.page.keyboard.press('Escape');
    await expectRevealed(app.page, 'Beta', false);

    await swipeRoutine(context, app.page, 'Gamma', 64, useTouch);
    await expectRevealed(app.page, 'Gamma', true);
    await app.page.getByRole('heading', { name: 'Routines' }).click();
    await expectRevealed(app.page, 'Gamma', false);
    expect(await revealOffset(app.page, 'Gamma')).toBe(0);
  });

  test('TA-DR-010 pointer cancel mid-swipe leaves no reveal or write', async ({
    app,
    context,
  }, testInfo) => {
    await app.startFreshApp('dr-cancel');
    await seedDocument(
      app,
      buildMultiRoutineDocument([{ id: 'c', name: 'Cancel Me' }]),
    );
    const revisionBefore = await committedRevision(app.page);
    await swipeRoutine(context, app.page, 'Cancel Me', 64, hasTouch(testInfo), {
      cancel: true,
    });
    await expect.poll(async () => revealOffset(app.page, 'Cancel Me')).toBe(0);
    expect(await committedRevision(app.page)).toBe(revisionBefore);
  });

  test('TA-DR-011 pointer drag matches reveal policy', async ({
    app,
    context,
  }, testInfo) => {
    await app.startFreshApp('dr-mouse');
    await seedDocument(
      app,
      buildMultiRoutineDocument([{ id: 'm', name: 'Mouse Row' }]),
    );
    await swipeRoutine(context, app.page, 'Mouse Row', 64, hasTouch(testInfo));
    await expectRevealed(app.page, 'Mouse Row', true);
    expect(await revealOffset(app.page, 'Mouse Row')).toBe(64);
  });

  test('TA-DR-012/013/014/018 dialog names cascade; Cancel/Escape/backdrop write nothing; Cancel focused', async ({
    app,
  }) => {
    await app.startFreshApp('dr-dialog');
    await seedDocument(
      app,
      buildMultiRoutineDocument([
        { id: 'keep', name: 'Keep' },
        { id: 'target', name: 'Target & <Special>', sessions: 2, snapshots: 1 },
      ]),
    );
    const revisionBefore = await committedRevision(app.page);

    await openDeleteConfirmFromList(app.page, 'Target & <Special>');
    const dialog = confirmDialog(app.page);
    await expect(
      dialog.getByRole('heading', { name: 'Delete routine?' }),
    ).toBeVisible();
    await expect(dialog).toContainText('Target & <Special>');
    await expect(dialog).toContainText('progress snapshots');
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();

    await cancelRoutineDelete(app.page);
    expect(await committedRevision(app.page)).toBe(revisionBefore);
    await app.expectText('Target & <Special>');

    await openDeleteConfirmFromList(app.page, 'Target & <Special>');
    await app.page.keyboard.press('Escape');
    await expect(confirmDialog(app.page)).toHaveCount(0);
    expect(await committedRevision(app.page)).toBe(revisionBefore);

    await openDeleteConfirmFromList(app.page, 'Target & <Special>');
    // Click the dimmed backdrop outside the sheet (sheet covers bottom).
    await app.page.mouse.click(8, 8);
    await expect(confirmDialog(app.page)).toHaveCount(0);
    expect(await committedRevision(app.page)).toBe(revisionBefore);
  });

  test('TA-DR-015 double confirm produces one mutation', async ({ app }) => {
    await app.startFreshApp('dr-double');
    await seedDocument(
      app,
      buildMultiRoutineDocument([{ id: 'once', name: 'Once' }]),
    );
    const revisionBefore = await committedRevision(app.page);
    await openDeleteConfirmFromList(app.page, 'Once');
    const dialog = confirmDialog(app.page);
    // Double-activate the confirm control in one turn; busy guard must keep
    // a single storage write.
    await dialog.evaluate((node) => {
      const button = node.querySelector<HTMLButtonElement>(
        'button.danger-solid',
      );
      button?.click();
      button?.click();
    });
    await expect(dialog).toHaveCount(0);
    await expect(routineRow(app.page, 'Once')).toHaveCount(0);
    expect(await committedRevision(app.page)).toBe(revisionBefore + 1);
  });

  test('TA-DR-016 / FIT-115 detail Delete returns to list', async ({ app }) => {
    await app.startFreshApp('dr-detail');
    await seedDocument(
      app,
      buildMultiRoutineDocument([
        { id: 'keep', name: 'Still Here' },
        { id: 'detail', name: 'Detail Gone', sessions: 1 },
      ]),
    );
    await routineOpenButton(app.page, 'Detail Gone').click();
    await expect(
      app.page.getByRole('heading', { name: 'Detail Gone' }),
    ).toBeVisible();
    await app.page.getByRole('button', { name: 'Delete routine' }).click();
    const dialog = confirmDialog(app.page);
    await expect(
      dialog.getByRole('heading', { name: 'Delete routine?' }),
    ).toBeVisible();
    await confirmRoutineDelete(app.page);
    await expect(
      app.page.getByRole('heading', { name: 'Routines' }),
    ).toBeVisible();
    await expect(routineRow(app.page, 'Detail Gone')).toHaveCount(0);
    await expect(routineRow(app.page, 'Still Here')).toBeVisible();
    await app.expectText('Routine “Detail Gone” deleted.');
  });

  test('TA-DR-017/019/020 keyboard Delete path, focus and announcement', async ({
    app,
  }) => {
    await app.startFreshApp('dr-keyboard');
    await seedDocument(
      app,
      buildMultiRoutineDocument([{ id: 'key', name: 'Key Path' }]),
    );
    const deleteButton = persistentDeleteButton(app.page, 'Key Path');
    await deleteButton.focus();
    await expect(deleteButton).toBeFocused();
    await app.page.keyboard.press('Enter');
    const dialog = confirmDialog(app.page);
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await app.page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(deleteButton).toBeFocused();

    await deleteButton.click();
    await confirmRoutineDelete(app.page);
    await expect(
      app.page.getByRole('heading', { name: 'Routines', exact: true }),
    ).toBeFocused();
    await expect(app.page.getByRole('status')).toContainText(
      'Routine “Key Path” deleted.',
    );
    await expect(routineRow(app.page, 'Key Path')).toHaveCount(0);
    await app.expectText('No routines yet');
  });

  test('TA-DR-021/022/043 axe, 52px targets, reduced motion, no overflow', async ({
    app,
    context,
  }, testInfo) => {
    await app.startFreshApp('dr-a11y');
    await seedDocument(
      app,
      buildMultiRoutineDocument([
        { id: 'a', name: 'A11y One' },
        { id: 'b', name: 'A11y Two' },
      ]),
    );

    const deleteBox = await persistentDeleteButton(
      app.page,
      'A11y One',
    ).boundingBox();
    expect(deleteBox).toBeTruthy();
    expect(
      Math.min(deleteBox!.width, deleteBox!.height),
    ).toBeGreaterThanOrEqual(52);

    await app.page.emulateMedia({ reducedMotion: 'reduce' });
    await swipeRoutine(context, app.page, 'A11y One', 64, hasTouch(testInfo));
    await expectRevealed(app.page, 'A11y One', true);
    const transition = await swipeTrack(app.page, 'A11y One').evaluate(
      (element) => getComputedStyle(element).transitionDuration,
    );
    expect(transition === '0s' || transition === '').toBeTruthy();
    await noHorizontalOverflow(app.page);

    const axe = await new AxeBuilder({ page: app.page }).analyze();
    const serious = axe.violations.filter(({ impact }) =>
      ['serious', 'critical'].includes(impact ?? ''),
    );
    expect(serious.map((item) => item.id)).toEqual([]);
  });

  test('TA-DR-048 long / special names round-trip in dialog and isolation', async ({
    app,
  }) => {
    const longName =
      'Super «spécial» routine — 超长名字 / name with "quotes" & ampersands';
    await app.startFreshApp('dr-names');
    await seedDocument(
      app,
      buildMultiRoutineDocument([
        { id: 'sentinel', name: 'Sentinel Twin', sessions: 1, snapshots: 1 },
        { id: 'long', name: longName, sessions: 1 },
      ]),
    );
    const sentinelBefore = structuredClone(
      (await readPrimaryRecord(app.page))!.document.routines.find(
        (routine) => routine.id === 'sentinel',
      ),
    );
    await openDeleteConfirmFromList(app.page, longName);
    await expect(confirmDialog(app.page)).toContainText(longName);
    await confirmRoutineDelete(app.page);
    await expect(routineRow(app.page, longName)).toHaveCount(0);
    const after = await readPrimaryRecord(app.page);
    expect(after?.document.routines).toHaveLength(1);
    expect(after?.document.routines[0]).toEqual(sentinelBefore);
  });

  test('TA-DR-049 success announced only after commit', async ({ app }) => {
    await app.startFreshApp('dr-announce');
    await seedDocument(
      app,
      buildMultiRoutineDocument([{ id: 'ann', name: 'Announce Me' }]),
    );
    await openDeleteConfirmFromList(app.page, 'Announce Me');
    await expect(app.page.getByRole('status')).toHaveCount(0);
    await confirmRoutineDelete(app.page);
    await expect(app.page.getByRole('status')).toContainText(
      'Routine “Announce Me” deleted.',
    );
  });
});

test.describe('Delete routine — persistence / cascade system (FIT-118, FIT-119)', () => {
  test('TA-DR-024/025/028 isolation by id, empty state CTA', async ({
    app,
  }) => {
    await app.startFreshApp('dr-iso');
    await seedDocument(
      app,
      buildMultiRoutineDocument([
        { id: 'dup-1', name: 'Dup', sessions: 2, snapshots: 1 },
        { id: 'dup-2', name: 'Dup', sessions: 1 },
      ]),
    );
    const twinBefore = structuredClone(
      (await readPrimaryRecord(app.page))!.document.routines.find(
        (routine) => routine.id === 'dup-2',
      ),
    );
    await persistentDeleteById(app.page, 'dup-1').click();
    await expect(confirmDialog(app.page)).toBeVisible();
    await confirmRoutineDelete(app.page);
    const afterFirst = await readPrimaryRecord(app.page);
    expect(afterFirst?.document.routines.map((routine) => routine.id)).toEqual([
      'dup-2',
    ]);
    expect(afterFirst?.document.routines[0]).toEqual(twinBefore);

    await persistentDeleteById(app.page, 'dup-2').click();
    await expect(confirmDialog(app.page)).toBeVisible();
    await confirmRoutineDelete(app.page);
    await app.expectText('No routines yet');
    await expect(
      app.page.getByRole('button', { name: 'Create Routine' }).first(),
    ).toBeVisible();
    const empty = await readPrimaryRecord(app.page);
    expect(empty?.document).toEqual({ schemaVersion: 2, routines: [] });
    const recovery = await readRecoveryRecord(app.page);
    expect(recovery).toEqual(empty);
  });

  test('TA-DR-029/031/032 persists across reload; both slots equal; no resurrection', async ({
    app,
  }) => {
    await app.startFreshApp('dr-persist');
    await seedDocument(
      app,
      buildMultiRoutineDocument([
        { id: 'keep', name: 'Persist Keep' },
        { id: 'gone', name: 'Persist Gone', sessions: 1, snapshots: 2 },
      ]),
      4,
    );
    await openDeleteConfirmFromList(app.page, 'Persist Gone');
    await confirmRoutineDelete(app.page);
    const committed = await readPrimaryRecord(app.page);
    const recovery = await readRecoveryRecord(app.page);
    expect(committed?.storageRevision).toBe(5);
    expect(recovery).toEqual(committed);

    // Corrupt recovery must not resurrect deleted routine while primary healthy.
    await app.seedRecords({
      primary: committed,
      recovery: {
        storageRevision: 3,
        document: buildMultiRoutineDocument([
          { id: 'keep', name: 'Persist Keep' },
          { id: 'gone', name: 'Persist Gone', sessions: 1 },
        ]),
      },
    });
    await app.page.reload();
    await expect(app.page.locator('[data-ready="true"]')).toHaveCount(1);
    await expect(routineRow(app.page, 'Persist Keep')).toBeVisible();
    await expect(routineRow(app.page, 'Persist Gone')).toHaveCount(0);
    expect(
      (await readPrimaryRecord(app.page))?.document.routines.map(
        (routine) => routine.id,
      ),
    ).toEqual(['keep']);
  });
});
