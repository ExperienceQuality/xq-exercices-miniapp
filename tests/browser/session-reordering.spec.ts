import AxeBuilder from '@axe-core/playwright';

import { expect, test } from './support/app.js';
import {
  abortNextReadwriteTransaction,
  buildRoutineDocument,
  committedRevision,
  committedRoutine,
  committedSessionIds,
  dragHandleToRow,
  edgeDragRevealAndDrop,
  elementCenter,
  gateNextReadwritePrimaryGet,
  holdDrag,
  legacyMoveButtons,
  moveEarlierItem,
  moveLaterItem,
  moveMenuOpen,
  moveViaArrowKey,
  moveViaMenu,
  openMoveMenu,
  openSessionRow,
  readPrimaryRecord,
  releaseReorderSave,
  reorderControls,
  reorderHandle,
  reorderStatus,
  routineIdByName,
  rowDropPoint,
  rowReorderHandle,
  scrollOutsideHandle,
  sessionIdsByNames,
  sessionList,
  sessionRowById,
  sessionRowIds,
  sessionRowNames,
  sessionRows,
  trustedDrag,
  waitForCommittedOrder,
  waitForRenderedOrder,
} from './support/session-reordering.js';

const hasTouch = (testInfo: { project: { use: { hasTouch?: boolean } } }) =>
  Boolean(testInfo.project.use.hasTouch);

const setupRoutine = async (
  app: {
    startFreshApp: (s: string) => Promise<string>;
    createRoutine: (n: string) => Promise<void>;
    click: (n: string) => Promise<void>;
    addSession: (n: string) => Promise<void>;
  },
  scenario: string,
  routineName: string,
  sessions: string[],
) => {
  await app.startFreshApp(scenario);
  await app.createRoutine(routineName);
  await app.click('Back');
  await app.click(routineName);
  for (const name of sessions) await app.addSession(name);
};

test.describe('Session reordering acceptance', () => {
  test('SRO-01/SRO-05 grip drag reorders multi-position both ways, persists atomically, and survives reload (FIT-053, FIT-057, FIT-069, FIT-087)', async ({
    app,
  }, testInfo) => {
    await setupRoutine(app, 'reorder-drag', 'Drag Routine', [
      'Alpha',
      'Bravo',
      'Charlie',
    ]);
    const routineId = await routineIdByName(app.page, 'Drag Routine');
    const [alpha, bravo, charlie] = await sessionIdsByNames(
      app.page,
      routineId,
      ['Alpha', 'Bravo', 'Charlie'],
    );
    const revisionBefore = await committedRevision(app.page);

    // Forward multi-position: drag Charlie above Alpha (insert-before).
    await dragHandleToRow(
      app.page,
      reorderHandle(app.page, 'Charlie'),
      sessionRowById(app.page, alpha),
      'before',
    );
    await waitForRenderedOrder(app.page, [charlie, alpha, bravo]);
    await waitForCommittedOrder(app.page, routineId, [charlie, alpha, bravo]);
    // Atomic write: exactly one revision bump, exact permutation committed.
    await expect
      .poll(() => committedRevision(app.page))
      .toBe(revisionBefore + 1);
    expect(
      [...(await committedSessionIds(app.page, routineId))].sort(),
    ).toEqual([alpha, bravo, charlie].sort());

    // A completed drag never opens the tap-to-move menu (RUI-AC-19).
    expect(await moveMenuOpen(app.page)).toBe(false);

    await app.page.reload();
    await app.click('Drag Routine');
    await waitForRenderedOrder(app.page, [charlie, alpha, bravo]);
    await app.page.screenshot({
      path: testInfo.outputPath('session-reordered-drag.png'),
      fullPage: true,
    });

    // Backward multi-position: drag Charlie back below Bravo (insert-after).
    await dragHandleToRow(
      app.page,
      reorderHandle(app.page, 'Charlie'),
      sessionRowById(app.page, bravo),
      'after',
    );
    await waitForCommittedOrder(app.page, routineId, [alpha, bravo, charlie]);
    await waitForRenderedOrder(app.page, [alpha, bravo, charlie]);
    expect(await moveMenuOpen(app.page)).toBe(false);
  });

  test('SRO-06 trusted-input grip drag reorders and saves; SRO-07 row body tap opens without a write; SRO-08 native scroll outside the grip does not reorder (FIT-058, FIT-059, FIT-060, FIT-088, FIT-093)', async ({
    app,
    context,
  }, testInfo) => {
    // A routine taller than every project viewport is seeded directly so the
    // native-scroll assertions have room to travel.
    const names = Array.from(
      { length: 18 },
      (_, index) => `Entry ${String(index + 1).padStart(2, '0')}`,
    );
    await app.startFreshApp('reorder-touch');
    const document = buildRoutineDocument(
      'routine-touch',
      'Touch Routine',
      names,
    );
    const seeded = await readPrimaryRecord(app.page);
    const revision = (seeded?.storageRevision ?? 0) + 1;
    await app.seedRecords({
      primary: { storageRevision: revision, document },
      recovery: { storageRevision: revision, document },
    });
    await app.page.reload();
    await app.click('Touch Routine');
    const routineId = 'routine-touch';
    const ids = await committedSessionIds(app.page, routineId);
    expect(ids).toHaveLength(names.length);
    const revisionBefore = await committedRevision(app.page);
    const useTouch = hasTouch(testInfo);

    // Row body tap/click opens the session detail and writes nothing.
    await openSessionRow(app.page, names[2]!);
    await expect(
      app.page.getByRole('heading', { name: names[2]! }),
    ).toBeVisible();
    expect(await committedRevision(app.page)).toBe(revisionBefore);
    expect(await committedSessionIds(app.page, routineId)).toEqual(ids);
    await app.click('Back');

    // Native scrolling starting on the row body (outside the grip)
    // scrolls the page and never starts a reorder or navigates.
    const delta = await scrollOutsideHandle(
      context,
      app.page,
      useTouch,
      sessionRowById(app.page, ids[2]!).locator('.list-button'),
    );
    expect(Math.abs(delta)).toBeGreaterThan(50);
    expect(await committedSessionIds(app.page, routineId)).toEqual(ids);
    expect(await committedRevision(app.page)).toBe(revisionBefore);
    await expect(
      app.page.getByRole('heading', { name: 'Touch Routine' }),
    ).toBeVisible();

    // Trusted-input drag on the grip commits a reorder. Reloading after
    // the scroll scenario guarantees no inertial scroll momentum can race
    // the drop-point measurement; the reopened list must already be settled
    // at the top before any coordinate is read.
    await app.page.reload();
    await app.click('Touch Routine');
    await waitForRenderedOrder(app.page, ids);
    await expect.poll(() => app.page.evaluate(() => window.scrollY)).toBe(0);
    const grip = reorderHandle(app.page, names[3]!);
    await grip.scrollIntoViewIfNeeded();
    const drop = await rowDropPoint(
      sessionRowById(app.page, ids[0]!),
      'before',
    );
    await trustedDrag(context, app.page, useTouch, grip, drop);
    const expected = [ids[3]!, ids[0]!, ids[1]!, ids[2]!, ...ids.slice(4)];
    await waitForCommittedOrder(app.page, routineId, expected);
    await waitForRenderedOrder(app.page, expected);
    await app.page.screenshot({
      path: testInfo.outputPath('session-reordered-touch.png'),
      fullPage: true,
    });
  });

  test('SRO-09 an in-progress grip drag over row content never navigates or activates controls (FIT-061, FIT-093)', async ({
    app,
    context,
  }, testInfo) => {
    await setupRoutine(app, 'reorder-nolock', 'NoNav Routine', [
      'One',
      'Two',
      'Three',
    ]);
    const routineId = await routineIdByName(app.page, 'NoNav Routine');
    const ids = await committedSessionIds(app.page, routineId);

    // Drag the grip of row One across the middle row's own grip and row
    // body, then cancel with Escape: no navigation, no control activation,
    // no second drag steals the gesture.
    const middleRow = sessionRowById(app.page, ids[1]!);
    const middleGrip = middleRow.getByRole('button', {
      name: 'Reorder Two',
      exact: true,
    });
    const target = await elementCenter(middleGrip);
    const gesture = await holdDrag(
      context,
      app.page,
      hasTouch(testInfo),
      reorderHandle(app.page, 'One'),
    );
    await gesture.move(target);
    await app.page.keyboard.press('Escape');
    await gesture.release();
    await expect(
      app.page.getByRole('heading', { name: 'NoNav Routine' }),
    ).toBeVisible();
    expect(await sessionRowIds(app.page)).toEqual(ids);
    expect(await committedSessionIds(app.page, routineId)).toEqual(ids);
    // Cancelling a drag never surfaces the move menu.
    expect(await moveMenuOpen(app.page)).toBe(false);
  });

  test('SRO-10/SRO-11/SRO-12 grip keyboard arrows and the tap-to-move menu keep focus, respect boundaries, and announce via polite status (FIT-062, FIT-063, FIT-064, FIT-095, FIT-096, FIT-097, FIT-098, FIT-099)', async ({
    app,
  }) => {
    await setupRoutine(app, 'reorder-keys', 'Keys Routine', [
      'Top',
      'Middle',
      'Bottom',
    ]);
    const routineId = await routineIdByName(app.page, 'Keys Routine');
    const [top, middle, bottom] = await sessionIdsByNames(app.page, routineId, [
      'Top',
      'Middle',
      'Bottom',
    ]);

    // Row anatomy: one grip per row, no visible up/down buttons anywhere.
    await expect(reorderControls(app.page)).toHaveCount(3);
    await expect(legacyMoveButtons(app.page)).toHaveCount(0);

    // Keyboard path: ArrowUp on the focused grip moves one position and
    // focus stays on the moved session's grip by stable row identity.
    const middleGrip = reorderHandle(app.page, 'Middle');
    await middleGrip.focus();
    await app.page.keyboard.press('ArrowUp');
    await waitForCommittedOrder(app.page, routineId, [middle, top, bottom]);
    await expect
      .poll(async () =>
        app.page.evaluate(() => {
          const active = document.activeElement;
          const row = active?.closest('li[data-session-id]');
          return {
            sessionId: row?.getAttribute('data-session-id') ?? '',
            label: active?.getAttribute('aria-label') ?? '',
          };
        }),
      )
      .toEqual({ sessionId: middle, label: 'Reorder Middle' });
    // Polite live region announces the persisted move.
    await expect(reorderStatus(app.page)).toContainText(
      'Middle moved to position 1.',
    );

    // Boundary press toward the top is a no-op that writes nothing.
    const revisionBeforeBoundary = await committedRevision(app.page);
    await app.page.keyboard.press('ArrowUp');
    expect(await committedSessionIds(app.page, routineId)).toEqual([
      middle,
      top,
      bottom,
    ]);
    expect(await committedRevision(app.page)).toBe(revisionBeforeBoundary);

    // Pointer-accessible menu path: tapping the grip of the boundary item
    // opens the anchored menu with "Move earlier" visibly unavailable.
    const firstGrip = reorderHandle(app.page, 'Middle');
    await openMoveMenu(app.page, firstGrip);
    await expect(moveEarlierItem(app.page)).toBeDisabled();
    await expect(moveLaterItem(app.page)).toBeEnabled();
    // Escape dismisses without mutation and returns focus to the grip.
    await app.page.keyboard.press('Escape');
    await expect(moveEarlierItem(app.page)).toHaveCount(0);
    await expect(moveLaterItem(app.page)).toHaveCount(0);
    await expect(firstGrip).toBeFocused();
    expect(await committedSessionIds(app.page, routineId)).toEqual([
      middle,
      top,
      bottom,
    ]);

    // Menu activation moves one position through the same pipeline.
    await moveViaMenu(app.page, reorderHandle(app.page, 'Bottom'), 'earlier');
    await waitForCommittedOrder(app.page, routineId, [middle, bottom, top]);
    await expect(reorderStatus(app.page)).toContainText(
      'Bottom moved to position 2.',
    );
    await expect(moveEarlierItem(app.page)).toHaveCount(0);

    // ArrowDown on the focused grip restores the order.
    await moveViaArrowKey(app.page, reorderHandle(app.page, 'Bottom'), 'later');
    await waitForCommittedOrder(app.page, routineId, [middle, top, bottom]);
  });

  test('SRO-04 empty and single-session routines expose no enabled reorder affordance (FIT-056, FIT-100)', async ({
    app,
  }) => {
    await app.startFreshApp('reorder-empty');
    await app.createRoutine('Empty Routine');
    await app.click('Back');
    await app.click('Empty Routine');
    await expect(
      app.page.getByRole('button', { name: /^Reorder / }),
    ).toHaveCount(0);
    await expect(legacyMoveButtons(app.page)).toHaveCount(0);

    // A singleton may render its grip disabled or hidden; it may never be
    // enabled, and no move menu can open from it.
    await app.addSession('Solo');
    await expect(
      app.page.locator('button[aria-label="Reorder Solo"]:visible:enabled'),
    ).toHaveCount(0);
    expect(await moveMenuOpen(app.page)).toBe(false);
    await expect(legacyMoveButtons(app.page)).toHaveCount(0);
  });

  test('SRO-13 reorder saves offline once loaded and the committed order survives reload (FIT-065, FIT-105)', async ({
    app,
    context,
  }) => {
    await setupRoutine(app, 'reorder-offline', 'Offline Routine', [
      'Red',
      'Green',
      'Blue',
    ]);
    const routineId = await routineIdByName(app.page, 'Offline Routine');
    const [red, green, blue] = await sessionIdsByNames(app.page, routineId, [
      'Red',
      'Green',
      'Blue',
    ]);

    await context.setOffline(true);
    await moveViaArrowKey(app.page, reorderHandle(app.page, 'Blue'), 'earlier');
    await waitForCommittedOrder(app.page, routineId, [red, blue, green]);
    await context.setOffline(false);
    await app.page.reload();
    await app.click('Offline Routine');
    await waitForRenderedOrder(app.page, [red, blue, green]);
    expect(await sessionRowNames(app.page)).toEqual(['Red', 'Blue', 'Green']);
  });

  test('SRO-14 a failed reorder save restores the committed order and surfaces an error (FIT-066, FIT-106)', async ({
    app,
  }) => {
    await setupRoutine(app, 'reorder-failure', 'Failure Routine', [
      'North',
      'South',
      'East',
    ]);
    const routineId = await routineIdByName(app.page, 'Failure Routine');
    const ids = await committedSessionIds(app.page, routineId);
    const revisionBefore = await committedRevision(app.page);

    await app.page.evaluate(abortNextReadwriteTransaction);
    await moveViaMenu(app.page, reorderHandle(app.page, 'South'), 'earlier');
    await app.expectText('could not be saved');
    // UI rolled back to the committed order; nothing partial persisted.
    await expect.poll(() => sessionRowIds(app.page)).toEqual(ids);
    expect(await committedSessionIds(app.page, routineId)).toEqual(ids);
    expect(await committedRevision(app.page)).toBe(revisionBefore);
    await app.page.reload();
    await app.click('Failure Routine');
    await expect.poll(() => sessionRowIds(app.page)).toEqual(ids);
  });

  test('SRO-15 a revision conflict fails closed: preview rolls back, conflicting order is never overwritten, no automatic retry (FIT-067, FIT-107)', async ({
    app,
  }) => {
    await setupRoutine(app, 'reorder-conflict', 'Conflict Routine', [
      'Up',
      'Down',
      'Left',
      'Right',
    ]);
    const routineId = await routineIdByName(app.page, 'Conflict Routine');
    const loadedIds = await committedSessionIds(app.page, routineId);

    // Simulate another writer: bump the stored primary record with a
    // different committed order and a higher storageRevision.
    const record = await readPrimaryRecord(app.page);
    expect(record, 'Primary record missing.').toBeTruthy();
    const conflicting = structuredClone(record!);
    const routine = conflicting.document.routines.find(
      (entry) => entry.id === routineId,
    );
    expect(routine, 'Routine missing from record.').toBeTruthy();
    const reversed = [...routine.sessions].reverse();
    reversed.forEach((session, index) => {
      session.order = index + 1;
    });
    routine.sessions = reversed;
    conflicting.storageRevision = record!.storageRevision + 1;
    await app.seedRecords({ primary: conflicting, recovery: conflicting });
    const conflictingIds = await committedSessionIds(app.page, routineId);
    expect(conflictingIds).not.toEqual(loadedIds);

    // Attempt a reorder against the stale revision: it must fail closed.
    await moveViaArrowKey(app.page, reorderHandle(app.page, 'Up'), 'later');
    await app.expectText('Fitness data changed in another tab');
    // Local preview rolled back to what the loaded page committed.
    await expect.poll(() => sessionRowIds(app.page)).toEqual(loadedIds);
    // The conflicting committed order was never overwritten and no retry ran.
    expect(await committedSessionIds(app.page, routineId)).toEqual(
      conflictingIds,
    );
    expect(await committedRevision(app.page)).toBe(record!.storageRevision + 1);
    await app.expectText('Fitness data changed in another tab');
  });

  test('SRO-16 while a reorder save is pending the grips and menu are suppressed and no second reorder is written (FIT-068, FIT-096, FIT-108)', async ({
    app,
  }) => {
    await setupRoutine(app, 'reorder-pending', 'Pending Routine', [
      'Sun',
      'Moon',
      'Star',
    ]);
    const routineId = await routineIdByName(app.page, 'Pending Routine');
    const [sun, moon, star] = await sessionIdsByNames(app.page, routineId, [
      'Sun',
      'Moon',
      'Star',
    ]);

    const revisionBefore = await committedRevision(app.page);
    await app.page.evaluate(gateNextReadwritePrimaryGet);
    try {
      await moveViaArrowKey(
        app.page,
        reorderHandle(app.page, 'Star'),
        'earlier',
      );

      // Pending save: list reports busy and every grip is suppressed, so a
      // second reorder can neither be queued nor written.
      await expect(sessionList(app.page)).toHaveAttribute('aria-busy', 'true');
      const controls = reorderControls(app.page);
      const count = await controls.count();
      expect(count).toBeGreaterThan(0);
      for (let index = 0; index < count; index += 1) {
        await expect(controls.nth(index)).toBeDisabled();
      }
      // The tap-to-move menu is suppressed while the save is pending.
      expect(await moveMenuOpen(app.page)).toBe(false);

      // A second reorder is attempted by force-enabling a suppressed
      // grip: even bypassing the DOM guard, the controller's pending
      // gate must refuse to queue or write it, and force-clicking must
      // not open the menu. (No committed-state reads here: a readonly
      // transaction must wait for the gated readwrite one, so storage is
      // only inspected after release.)
      await app.page.evaluate(() => {
        const button = document.querySelector<HTMLButtonElement>(
          'button[aria-label="Reorder Sun"]',
        );
        if (!button) throw new Error('Reorder grip missing.');
        button.disabled = false;
        button.click();
      });
      expect(await moveMenuOpen(app.page)).toBe(false);
      await app.page.keyboard.press('ArrowDown');
    } finally {
      await releaseReorderSave(app.page);
    }

    await waitForCommittedOrder(app.page, routineId, [sun, star, moon]);
    await expect(sessionList(app.page)).toHaveAttribute('aria-busy', 'false');
    // Exactly one reorder was persisted — nothing queued behind it.
    await expect
      .poll(() => committedRevision(app.page))
      .toBe(revisionBefore + 1);
    expect(await committedSessionIds(app.page, routineId)).toEqual([
      sun,
      star,
      moon,
    ]);
    await waitForRenderedOrder(app.page, [sun, star, moon]);
  });

  test('SRO-18/SRO-19 generated numbering is gone while a user-authored "Session 1" name is unchanged (FIT-070, FIT-071)', async ({
    app,
  }) => {
    await setupRoutine(app, 'reorder-labels', 'Labels Routine', [
      'Session 1',
      'Authored Beta',
    ]);
    const routineId = await routineIdByName(app.page, 'Labels Routine');
    const [first, second] = await sessionIdsByNames(app.page, routineId, [
      'Session 1',
      'Authored Beta',
    ]);

    // List subtitle shows only the exercise count — no generated
    // "Session {index}" numbering.
    const subtitles = sessionRows(app.page).locator('.list-button small');
    const texts = await subtitles.allTextContents();
    for (const text of texts) {
      expect(text.trim()).toMatch(/^\d+\s+exercises?$/);
      expect(text).not.toMatch(/Session \d+/);
    }
    await app.expectText('Session 1');

    // Detail subtitle shows only the routine name.
    await openSessionRow(app.page, 'Session 1');
    await expect(
      app.page.getByRole('heading', { name: 'Session 1' }),
    ).toBeVisible();
    await expect(app.page.locator('p.subtitle').first()).toHaveText(
      'Labels Routine',
    );
    await app.click('Back');
    expect(await committedSessionIds(app.page, routineId)).toEqual([
      first,
      second,
    ]);
  });

  test('SRO-20 duplicate session names reorder the correct row by data-session-id (FIT-072)', async ({
    app,
  }) => {
    await setupRoutine(app, 'reorder-dupes', 'Dupes Routine', [
      'Twin',
      'Twin',
      'Solo',
    ]);
    const routineId = await routineIdByName(app.page, 'Dupes Routine');
    const [firstTwin, secondTwin, solo] = await sessionIdsByNames(
      app.page,
      routineId,
      ['Twin', 'Twin', 'Solo'],
    );

    // Move the first Twin down via its own row-scoped grip only.
    const grip = rowReorderHandle(app.page, firstTwin, 'Twin');
    await grip.focus();
    await app.page.keyboard.press('ArrowDown');
    await waitForCommittedOrder(app.page, routineId, [
      secondTwin,
      firstTwin,
      solo,
    ]);
    await waitForRenderedOrder(app.page, [secondTwin, firstTwin, solo]);
    expect(await committedSessionIds(app.page, routineId)).toEqual([
      secondTwin,
      firstTwin,
      solo,
    ]);
  });

  test('SRO-03/SRO-21/SRO-22 reorder preserves other routines, names, exercises and snapshots; new sessions append and delete keeps order (FIT-055, FIT-073, FIT-074)', async ({
    app,
  }) => {
    await app.startFreshApp('reorder-preserve');
    await app.createRoutine('Primary Routine');
    await app.click('Back');
    await app.createRoutine('Other Routine');
    await app.click('Back');
    await app.click('Other Routine');
    await app.addSession('Other One');
    await app.addSession('Other Two');
    await app.click('Back');
    await app.click('Primary Routine');
    await app.addSession('Keep Alpha');
    await app.addSession('Keep Beta');
    await app.addSession('Keep Gamma');
    await openSessionRow(app.page, 'Keep Alpha');
    await app.addExercise({ name: 'Anchor Exercise', sets: 5, repetitions: 5 });
    await app.click('Back');
    await app.click('Capture Progress');
    await app.expectText('Anchor Exercise');

    const primaryId = await routineIdByName(app.page, 'Primary Routine');
    const otherId = await routineIdByName(app.page, 'Other Routine');
    const before = await committedRoutine(app.page, primaryId);
    const otherBefore = await committedRoutine(app.page, otherId);
    expect(before, 'Committed routines missing.').toBeTruthy();
    expect(otherBefore, 'Committed routines missing.').toBeTruthy();
    const [alpha, beta, gamma] = await sessionIdsByNames(app.page, primaryId, [
      'Keep Alpha',
      'Keep Beta',
      'Keep Gamma',
    ]);

    await moveViaMenu(app.page, reorderHandle(app.page, 'Keep Alpha'), 'later');
    await waitForCommittedOrder(app.page, primaryId, [beta, alpha, gamma]);

    const after = await committedRoutine(app.page, primaryId);
    const otherAfter = await committedRoutine(app.page, otherId);
    expect(after, 'Committed routines missing.').toBeTruthy();
    expect(otherAfter, 'Committed routines missing.').toBeTruthy();
    // Names, ids and exercise content unchanged; only order values differ.
    expect(after!.sessions.map((s) => s.id).sort()).toEqual(
      before!.sessions.map((s) => s.id).sort(),
    );
    for (const session of after!.sessions) {
      const original = before!.sessions.find((s) => s.id === session.id);
      expect(session.name).toBe(original?.name);
      expect(session.exercises).toEqual(original?.exercises);
    }
    expect(after!.snapshots).toEqual(before!.snapshots);
    // The other routine is entirely unchanged.
    expect(otherAfter).toEqual(otherBefore);
    // Snapshot surfaces still render the captured data.
    await app.click('Capture Progress');
    await app.expectText('Anchor Exercise');

    // Append lands after the last session without disturbing the order.
    await app.addSession('Keep Delta');
    const delta = (await committedSessionIds(app.page, primaryId)).at(-1);
    expect(await committedSessionIds(app.page, primaryId)).toEqual([
      beta,
      alpha,
      gamma,
      delta,
    ]);
    // Deleting a session keeps the remaining committed order intact.
    await openSessionRow(app.page, 'Keep Beta');
    await app.click('Delete Training Session');
    await app.page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Delete Session' })
      .click();
    await app.expectNoText('Keep Beta');
    expect(await committedSessionIds(app.page, primaryId)).toEqual([
      alpha,
      gamma,
      delta,
    ]);
  });

  test('SRO-23 Escape, pointer cancellation, sub-threshold releases and no-op drops write nothing (FIT-075, FIT-089, FIT-090, FIT-091)', async ({
    app,
    context,
  }, testInfo) => {
    await setupRoutine(app, 'reorder-cancel', 'Cancel Routine', [
      'Red',
      'Green',
      'Blue',
    ]);
    const routineId = await routineIdByName(app.page, 'Cancel Routine');
    const ids = await committedSessionIds(app.page, routineId);
    const revisionBefore = await committedRevision(app.page);
    const useTouch = hasTouch(testInfo);
    const lastRow = sessionRowById(app.page, ids[2]!);

    // Escape during an active drag (keyboard press lands mid-gesture).
    let gesture = await holdDrag(
      context,
      app.page,
      useTouch,
      reorderHandle(app.page, 'Red'),
    );
    // Measured after holdDrag's scroll-into-view so the point is not stale.
    const lastCenter = await elementCenter(lastRow);
    await gesture.move(lastCenter);
    await gesture.move(lastCenter); // a second frame keeps the drag engaged
    await app.page.keyboard.press('Escape');
    await gesture.release();
    expect(await sessionRowIds(app.page)).toEqual(ids);
    expect(await committedSessionIds(app.page, routineId)).toEqual(ids);
    expect(await committedRevision(app.page)).toBe(revisionBefore);

    // Pointer cancellation mid-drag: trusted CDP touchCancel on touch
    // projects, pointercancel on desktop.
    gesture = await holdDrag(
      context,
      app.page,
      useTouch,
      reorderHandle(app.page, 'Red'),
    );
    await gesture.move(lastCenter);
    await gesture.cancel();
    expect(await sessionRowIds(app.page)).toEqual(ids);
    expect(await committedSessionIds(app.page, routineId)).toEqual(ids);
    expect(await committedRevision(app.page)).toBe(revisionBefore);

    // Real no-op: drag past the movement threshold to another row, then
    // back onto the original slot before releasing. The drop point is
    // measured after holdDrag's scroll-into-view settles but before any
    // preview-inducing move reflows the rows.
    const firstRow = sessionRowById(app.page, ids[0]!);
    gesture = await holdDrag(
      context,
      app.page,
      useTouch,
      reorderHandle(app.page, 'Red'),
    );
    const firstCenter = await rowDropPoint(firstRow, 'before');
    await gesture.move(lastCenter);
    await gesture.move(firstCenter);
    await gesture.release();
    expect(await sessionRowIds(app.page)).toEqual(ids);
    expect(await committedSessionIds(app.page, routineId)).toEqual(ids);
    expect(await committedRevision(app.page)).toBe(revisionBefore);

    // Sub-threshold release: a tiny move that never crosses the 6px
    // activation threshold is a tap — it opens the move menu and never
    // commits a reorder (RUI-AC-13 + RUI-AC-19).
    const grip = reorderHandle(app.page, 'Red');
    const start = await elementCenter(grip);
    await app.page.mouse.move(start.x, start.y);
    await app.page.mouse.down();
    await app.page.mouse.move(start.x, start.y + 3);
    await app.page.mouse.up();
    await expect(
      moveEarlierItem(app.page).or(moveLaterItem(app.page)).first(),
    ).toBeVisible();
    expect(await committedSessionIds(app.page, routineId)).toEqual(ids);
    expect(await committedRevision(app.page)).toBe(revisionBefore);
    // Outside interaction dismisses without mutation, focus returns to grip.
    await app.page.getByRole('heading', { name: 'Cancel Routine' }).click();
    await expect(moveEarlierItem(app.page)).toHaveCount(0);
    await expect(grip).toBeFocused();
    expect(await committedRevision(app.page)).toBe(revisionBefore);
  });

  test('SRO-24 dragging toward the viewport edge autoscrolls to an initially offscreen destination; cancelling that drag writes nothing (FIT-076, FIT-092)', async ({
    app,
    context,
  }, testInfo) => {
    await app.startFreshApp('reorder-autoscroll');
    // Seed a long routine directly so the list is taller than the viewport.
    const count = 20;
    const names = Array.from(
      { length: count },
      (_, index) => `Entry ${String(index + 1).padStart(2, '0')}`,
    );
    const document = buildRoutineDocument(
      'routine-long',
      'Long Routine',
      names,
    );
    const existing = await readPrimaryRecord(app.page);
    const revision = (existing?.storageRevision ?? 0) + 1;
    await app.seedRecords({
      primary: { storageRevision: revision, document },
      recovery: { storageRevision: revision, document },
    });
    await app.page.reload();
    await app.click('Long Routine');
    const ids = await committedSessionIds(app.page, 'routine-long');
    expect(ids).toHaveLength(count);
    await expect(sessionRows(app.page)).toHaveCount(count);
    const lastRow = sessionRowById(app.page, ids[count - 1]!);
    const topRow = sessionRowById(app.page, ids[1]!);
    await expect(lastRow).not.toBeInViewport();
    const useTouch = hasTouch(testInfo);
    const viewport = app.page.viewportSize();
    expect(viewport, 'Viewport size unavailable.').toBeTruthy();
    const bottomEdge = { x: viewport!.width / 2, y: viewport!.height - 12 };
    const topEdge = { x: viewport!.width / 2, y: 12 };

    // Bottom reachability: hold the drag at the viewport bottom edge until
    // the autoscroll reveals the last row, then drop below its midpoint.
    const reachedBottom = await edgeDragRevealAndDrop(context, app.page, {
      useTouch,
      handle: reorderHandle(app.page, names[0]!),
      edge: bottomEdge,
      dropOn: lastRow,
      placement: 'after',
    });
    expect(reachedBottom).toBe(true);
    const atBottom = [...ids.slice(1), ids[0]!];
    await waitForCommittedOrder(app.page, 'routine-long', atBottom);
    await waitForRenderedOrder(app.page, atBottom);
    await app.page.screenshot({
      path: testInfo.outputPath('session-autoscroll-reorder.png'),
      fullPage: true,
    });

    // Top reachability: Entry 02 now tops the list offscreen above the
    // viewport; drag the last entry to the top edge until it is revealed
    // and drop above its midpoint.
    await expect(topRow).not.toBeInViewport();
    const reachedTop = await edgeDragRevealAndDrop(context, app.page, {
      useTouch,
      handle: reorderHandle(app.page, names.at(-1)!),
      edge: topEdge,
      dropOn: topRow,
      placement: 'before',
    });
    expect(reachedTop).toBe(true);
    const atTop = [ids.at(-1)!, ...ids.slice(1, -1), ids[0]!];
    await waitForCommittedOrder(app.page, 'routine-long', atTop);
    await waitForRenderedOrder(app.page, atTop);

    // Cancel an edge-ward drag: scroll happens but no write at all.
    const revisionBefore = await committedRevision(app.page);
    const orderBefore = await committedSessionIds(app.page, 'routine-long');
    const gesture = await holdDrag(
      context,
      app.page,
      useTouch,
      reorderHandle(app.page, names[1]!),
    );
    await gesture.move(bottomEdge);
    await app.page.keyboard.press('Escape');
    await gesture.release();
    expect(await committedSessionIds(app.page, 'routine-long')).toEqual(
      orderBefore,
    );
    expect(await committedRevision(app.page)).toBe(revisionBefore);
  });

  test('Reorder UI stays accessible: grip affordance with description/shortcuts, no serious/critical axe violations, 52px targets, clean console (FIT-057, FIT-062, FIT-064, FIT-084, FIT-086, FIT-094, FIT-099)', async ({
    app,
  }) => {
    const consoleErrors: string[] = [];
    app.page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    app.page.on('pageerror', (error) => consoleErrors.push(error.message));

    await setupRoutine(app, 'reorder-a11y', 'A11y Routine', [
      'Warm Up',
      'Main Lift',
      'Cool Down',
    ]);
    await expect(sessionList(app.page)).toBeVisible();

    // Grip anatomy: every row exposes exactly one >=52px grip carrying a
    // programmatic usage description and aria-keyshortcuts; no legacy
    // up/down move buttons exist.
    const grips = reorderControls(app.page);
    await expect(grips).toHaveCount(3);
    for (let index = 0; index < 3; index += 1) {
      const grip = grips.nth(index);
      const box = await grip.boundingBox();
      expect(box, `Grip ${index} has no bounding box.`).toBeTruthy();
      expect(Math.min(box!.width, box!.height)).toBeGreaterThanOrEqual(52);
      await expect(grip).toHaveAttribute('aria-keyshortcuts', /Arrow(Up|Down)/);
      const describedBy = await grip.getAttribute('aria-describedby');
      const description = await grip.getAttribute('aria-description');
      expect(
        (describedBy ?? '') + (description ?? ''),
        'Grip lacks a usage description.',
      ).not.toBe('');
    }
    await expect(legacyMoveButtons(app.page)).toHaveCount(0);

    const result = await new AxeBuilder({ page: app.page }).analyze();
    const seriousCritical = result.violations
      .filter(({ impact }) => ['serious', 'critical'].includes(impact ?? ''))
      .map(({ id, impact, nodes }) => `${id}:${impact}:${nodes.length}`);
    expect(seriousCritical).toEqual([]);

    // Overflow check at this project's viewport.
    const metrics = await app.page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
    expect(consoleErrors).toEqual([]);
  });
});
