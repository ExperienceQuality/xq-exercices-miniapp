import AxeBuilder from '@axe-core/playwright';

import { expect, test } from './support/app.js';
import {
  abortNextReadwriteTransaction,
  buildExerciseSessionDocument,
  committedExerciseIds,
  committedRevision,
  committedRoutine,
  dragHandleToRow,
  edgeDragRevealAndDrop,
  elementCenter,
  exerciseList,
  exerciseReorderHandle,
  exerciseRowAction,
  exerciseRowById,
  exerciseRowIds,
  exerciseRowNames,
  exerciseRowReorderHandle,
  exerciseRows,
  gateNextReadwritePrimaryGet,
  holdDrag,
  legacyMoveButtons,
  moveEarlierItem,
  moveLaterItem,
  moveMenuOpen,
  moveViaArrowKey,
  moveViaMenu,
  openSessionRow,
  readPrimaryRecord,
  releaseReorderSave,
  reorderControls,
  reorderStatus,
  rowDropPoint,
  scrollOutsideHandle,
  trustedDrag,
  waitForCommittedExerciseOrder,
  waitForRenderedExerciseOrder,
} from './support/session-reordering.js';

const hasTouch = (testInfo: { project: { use: { hasTouch?: boolean } } }) =>
  Boolean(testInfo.project.use.hasTouch);

/**
 * Seeds one routine with one exercise-bearing session through the isolated
 * records namespace, reloads, and opens the session detail so the exercise
 * list renders. Returns the seeded ids.
 */
const seedSessionWithExercises = async (
  app: {
    startFreshApp: (s: string) => Promise<string>;
    seedRecords: (r: { primary: unknown; recovery: unknown }) => Promise<void>;
    click: (n: string) => Promise<void>;
    page: import('@playwright/test').Page;
  },
  scenario: string,
  routineId: string,
  routineName: string,
  sessionId: string,
  sessionName: string,
  exerciseNames: string[],
) => {
  await app.startFreshApp(scenario);
  const document = buildExerciseSessionDocument(
    routineId,
    routineName,
    sessionId,
    sessionName,
    exerciseNames,
  );
  const seeded = await readPrimaryRecord(app.page);
  const revision = (seeded?.storageRevision ?? 0) + 1;
  await app.seedRecords({
    primary: { storageRevision: revision, document },
    recovery: { storageRevision: revision, document },
  });
  await app.page.reload();
  await app.click(routineName);
  await openSessionRow(app.page, sessionName);
  await expect(exerciseList(app.page)).toBeVisible();
  await expect(exerciseRows(app.page)).toHaveCount(exerciseNames.length);
  return {
    routineId,
    sessionId,
    exerciseIds: exerciseNames.map(
      (_, index) => `${sessionId}-e${String(index + 1).padStart(3, '0')}`,
    ),
  };
};

test.describe('Exercise reordering acceptance', () => {
  test('RUI-AC-11/13/19 mouse grip drag reorders once, persists, never opens the menu; sub-threshold tap does (FIT-087, FIT-089, FIT-095)', async ({
    app,
  }, testInfo) => {
    const { routineId, sessionId, exerciseIds } =
      await seedSessionWithExercises(
        app,
        'ex-drag',
        'routine-ex-drag',
        'Lift Routine',
        'session-ex-drag',
        'Main Session',
        ['Bench', 'Row', 'Curl'],
      );
    const [bench, row, curl] = exerciseIds;
    const revisionBefore = await committedRevision(app.page);

    await dragHandleToRow(
      app.page,
      exerciseReorderHandle(app.page, 'Curl'),
      exerciseRowById(app.page, bench!),
      'before',
    );
    await waitForRenderedExerciseOrder(app.page, [curl!, bench!, row!]);
    await waitForCommittedExerciseOrder(app.page, routineId, sessionId, [
      curl!,
      bench!,
      row!,
    ]);
    // Exactly one commit for the gesture.
    await expect
      .poll(() => committedRevision(app.page))
      .toBe(revisionBefore + 1);
    // A released drag never opens the tap-to-move menu.
    expect(await moveMenuOpen(app.page)).toBe(false);

    // Sub-threshold release (<6px) is a tap: menu opens, nothing commits.
    const grip = exerciseReorderHandle(app.page, 'Row');
    const start = await elementCenter(grip);
    await app.page.mouse.move(start.x, start.y);
    await app.page.mouse.down();
    await app.page.mouse.move(start.x, start.y + 3);
    await app.page.mouse.up();
    await expect(
      moveEarlierItem(app.page).or(moveLaterItem(app.page)).first(),
    ).toBeVisible();
    expect(await committedExerciseIds(app.page, routineId, sessionId)).toEqual([
      curl!,
      bench!,
      row!,
    ]);
    await app.page.keyboard.press('Escape');

    await app.page.screenshot({
      path: testInfo.outputPath('exercise-reordered-drag.png'),
      fullPage: true,
    });
  });

  test('RUI-AC-12/17 trusted-input grip drag commits; native scroll off the grip never starts a reorder (FIT-088, FIT-093)', async ({
    app,
    context,
  }, testInfo) => {
    const useTouch = hasTouch(testInfo);
    const names = Array.from(
      { length: 14 },
      (_, index) => `Lift ${String(index + 1).padStart(2, '0')}`,
    );
    const { routineId, sessionId, exerciseIds } =
      await seedSessionWithExercises(
        app,
        'ex-touch',
        'routine-ex-touch',
        'Touch Routine',
        'session-ex-touch',
        'Touch Session',
        names,
      );
    const revisionBefore = await committedRevision(app.page);

    // Native scrolling on the row body (outside the grip) scrolls and
    // never reorders or activates Edit/Delete.
    const delta = await scrollOutsideHandle(
      context,
      app.page,
      useTouch,
      exerciseRowById(app.page, exerciseIds[2]!).locator('strong'),
    );
    expect(Math.abs(delta)).toBeGreaterThan(50);
    expect(await committedExerciseIds(app.page, routineId, sessionId)).toEqual(
      exerciseIds,
    );
    expect(await committedRevision(app.page)).toBe(revisionBefore);

    // Reload after the scroll scenario: guarantees no inertial momentum can
    // race the drop-point measurement and the reopened list is settled at
    // the top before any coordinate is read.
    await app.page.reload();
    await app.click('Touch Routine');
    await openSessionRow(app.page, 'Touch Session');
    await waitForRenderedExerciseOrder(app.page, exerciseIds);
    await expect.poll(() => app.page.evaluate(() => window.scrollY)).toBe(0);

    // Trusted-input grip drag commits a reorder (CDP touch on hasTouch
    // projects, real mouse on desktop). The grip is brought into view before
    // the drop point is measured so the coordinate cannot go stale.
    const grip = exerciseReorderHandle(app.page, names[3]!);
    await grip.scrollIntoViewIfNeeded();
    const drop = await rowDropPoint(
      exerciseRowById(app.page, exerciseIds[0]!),
      'before',
    );
    await trustedDrag(context, app.page, useTouch, grip, drop);
    const expected = [
      exerciseIds[3]!,
      exerciseIds[0]!,
      exerciseIds[1]!,
      exerciseIds[2]!,
      ...exerciseIds.slice(4),
    ];
    await waitForCommittedExerciseOrder(
      app.page,
      routineId,
      sessionId,
      expected,
    );
    await waitForRenderedExerciseOrder(app.page, expected);
    await app.page.screenshot({
      path: testInfo.outputPath('exercise-reordered-touch.png'),
      fullPage: true,
    });
  });

  test('RUI-AC-18 exercise rows show name, metadata and one grip with Edit/Delete on their own row below — no badge, no move buttons (FIT-094, FIT-083)', async ({
    app,
  }) => {
    await seedSessionWithExercises(
      app,
      'ex-anatomy',
      'routine-ex-anatomy',
      'Anatomy Routine',
      'session-ex-anatomy',
      'Anatomy Session',
      ['Overhead Press', 'Lateral Raise'],
    );
    const rows = exerciseRows(app.page);
    await expect(rows).toHaveCount(2);
    await expect(legacyMoveButtons(app.page)).toHaveCount(0);

    for (let index = 0; index < 2; index += 1) {
      const row = rows.nth(index);
      // Exactly one grip per row.
      await expect(row.getByRole('button', { name: /^Reorder / })).toHaveCount(
        1,
      );
      // Metadata line keeps the N sets · N reps · N kg shape.
      await expect(row.locator('small').first()).toContainText(
        /\d+\s+sets\s*·\s*\d+\s+reps\s*·\s*\d+(\.\d+)?\s+kg/,
      );
      // No initials badge / generated label competes with the name: no
      // aria-hidden node in the row holds a 1–2 character label.
      const badges = await row
        .locator('[aria-hidden="true"]')
        .evaluateAll((nodes) =>
          nodes
            .map((node) => node.textContent?.trim() ?? '')
            .filter((text) => /^[A-Z]{1,2}$/.test(text)),
        );
      expect(badges).toEqual([]);
      // Geometry: Edit/Delete render on their own row BELOW the name/grip
      // block, not beside it.
      const nameBox = await row.locator('strong').first().boundingBox();
      const gripBox = await row
        .getByRole('button', { name: /^Reorder / })
        .boundingBox();
      const editBox = await row
        .getByRole('button', { name: /^Edit / })
        .boundingBox();
      const deleteBox = await row
        .getByRole('button', { name: /^Delete / })
        .boundingBox();
      for (const box of [nameBox, gripBox, editBox, deleteBox]) {
        expect(box, 'Exercise row element missing geometry.').toBeTruthy();
      }
      expect(editBox!.y).toBeGreaterThanOrEqual(nameBox!.y + nameBox!.height);
      expect(deleteBox!.y).toBeGreaterThanOrEqual(nameBox!.y + nameBox!.height);
      // Grip sits in the upper block beside the name, not on the actions row.
      expect(gripBox!.y).toBeLessThan(editBox!.y);
      // Edit/Delete are real >=52px targets.
      expect(Math.min(editBox!.width, editBox!.height)).toBeGreaterThanOrEqual(
        52,
      );
      expect(
        Math.min(deleteBox!.width, deleteBox!.height),
      ).toBeGreaterThanOrEqual(52);
      expect(Math.min(gripBox!.width, gripBox!.height)).toBeGreaterThanOrEqual(
        52,
      );
    }
  });

  test('RUI-AC-19/20/21/22/23 grip menu, arrow-key moves, boundaries, focus retention and announcements (FIT-095, FIT-096, FIT-097, FIT-098, FIT-099)', async ({
    app,
  }) => {
    const { routineId, sessionId, exerciseIds } =
      await seedSessionWithExercises(
        app,
        'ex-keys',
        'routine-ex-keys',
        'Keys Routine',
        'session-ex-keys',
        'Keys Session',
        ['Alpha', 'Beta', 'Gamma'],
      );
    const [alpha, beta, gamma] = exerciseIds;

    // ArrowUp on the focused grip moves one position, focus stays on the
    // moved exercise's grip by stable id.
    const betaGrip = exerciseReorderHandle(app.page, 'Beta');
    await betaGrip.focus();
    await app.page.keyboard.press('ArrowUp');
    await waitForCommittedExerciseOrder(app.page, routineId, sessionId, [
      beta!,
      alpha!,
      gamma!,
    ]);
    await expect(betaGrip).toBeFocused();
    await expect(reorderStatus(app.page)).toContainText(
      'Beta moved to position 1.',
    );

    // Boundary press is a no-op write.
    const revisionBefore = await committedRevision(app.page);
    await app.page.keyboard.press('ArrowUp');
    expect(await committedExerciseIds(app.page, routineId, sessionId)).toEqual([
      beta!,
      alpha!,
      gamma!,
    ]);
    expect(await committedRevision(app.page)).toBe(revisionBefore);

    // Enter on the grip also opens the menu (keyboard pointer alternative).
    await betaGrip.focus();
    await app.page.keyboard.press('Enter');
    await expect(moveEarlierItem(app.page)).toBeDisabled();
    await expect(moveLaterItem(app.page)).toBeEnabled();
    await app.page.keyboard.press('Escape');
    await expect(moveEarlierItem(app.page)).toHaveCount(0);
    await expect(betaGrip).toBeFocused();

    // Menu item activation moves via the same pipeline and announces.
    await moveViaMenu(
      app.page,
      exerciseReorderHandle(app.page, 'Gamma'),
      'earlier',
    );
    await waitForCommittedExerciseOrder(app.page, routineId, sessionId, [
      beta!,
      gamma!,
      alpha!,
    ]);
    await expect(reorderStatus(app.page)).toContainText(
      'Gamma moved to position 2.',
    );

    // Grips carry usage description + key shortcuts.
    const grip = exerciseReorderHandle(app.page, 'Beta');
    await expect(grip).toHaveAttribute('aria-keyshortcuts', /Arrow(Up|Down)/);
    const describedBy = await grip.getAttribute('aria-describedby');
    const description = await grip.getAttribute('aria-description');
    expect((describedBy ?? '') + (description ?? '')).not.toBe('');
  });

  test('RUI-AC-19/20 the move menu is keyboard-operable and stays inside the viewport at 320px with 200% text (FIT-095, FIT-096, FIT-082)', async ({
    app,
  }) => {
    await app.page.setViewportSize({ width: 320, height: 568 });
    const { routineId, sessionId, exerciseIds } =
      await seedSessionWithExercises(
        app,
        'ex-menu',
        'routine-ex-menu',
        'Menu Routine',
        'session-ex-menu',
        'Menu Session',
        ['Alpha', 'Beta', 'Gamma'],
      );
    const [alpha, beta, gamma] = exerciseIds;
    await app.setTextScale(2);

    const focusedName = () =>
      app.page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return el
          ? (el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '')
          : '';
      });

    // Enter on the focused grip opens the menu and moves focus to the
    // first ENABLED menu item — keyboard operation, not just state.
    const betaGrip = exerciseReorderHandle(app.page, 'Beta');
    await betaGrip.focus();
    await app.page.keyboard.press('Enter');
    await expect(moveEarlierItem(app.page)).toBeVisible();
    await expect(moveLaterItem(app.page)).toBeVisible();
    await expect
      .poll(focusedName, { message: 'Focus did not land on a menu item.' })
      .toMatch(/^Move (earlier|later)$/);
    // The first enabled item for a middle row is "Move earlier".
    expect(await focusedName()).toBe('Move earlier');

    // Tab regression: a real Tab inside the open menu must NOT strand focus
    // on <body>/chrome — it dismisses the menu and returns focus to the
    // invoking grip; the next Tab continues the normal page sequence.
    await app.page.keyboard.press('Tab');
    expect(await moveMenuOpen(app.page)).toBe(false);
    await expect(betaGrip).toBeFocused();
    await app.page.keyboard.press('Tab');
    await expect
      .poll(focusedName, {
        message: 'Tab after the grip did not land on the next row control.',
      })
      .toBe('Edit Beta');
    const insideMain = await app.page.evaluate(() => {
      const el = document.activeElement;
      return el !== document.body && el?.closest('main') !== null;
    });
    expect(insideMain, 'Focus left the page after menu dismissal.').toBe(true);
    // Shift+Tab walks back to the same grip; Enter reopens the menu.
    await app.page.keyboard.press('Shift+Tab');
    await expect(betaGrip).toBeFocused();
    await app.page.keyboard.press('Enter');
    await expect(moveEarlierItem(app.page)).toBeVisible();
    await expect
      .poll(focusedName, { message: 'Focus did not land on a menu item.' })
      .toMatch(/^Move (earlier|later)$/);
    expect(await focusedName()).toBe('Move earlier');

    // The anchored menu is fully inside the viewport — never clipped by
    // list overflow or the screen edge at this width and text scale.
    const menuBox = await app.page
      .locator('[role="menu"], .reorder-menu')
      .first()
      .boundingBox();
    expect(menuBox, 'Move menu has no bounding box.').toBeTruthy();
    expect(menuBox!.x).toBeGreaterThanOrEqual(0);
    expect(menuBox!.y).toBeGreaterThanOrEqual(0);
    expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(320);
    expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(568);

    // Arrow/Home keys traverse the menu items.
    await app.page.keyboard.press('ArrowDown');
    await expect.poll(focusedName).toBe('Move later');
    await app.page.keyboard.press('Home');
    await expect.poll(focusedName).toBe('Move earlier');
    await app.page.keyboard.press('End');
    await expect.poll(focusedName).toBe('Move later');

    // Activating the focused item commits through the same pipeline.
    await app.page.keyboard.press('Enter');
    await waitForCommittedExerciseOrder(app.page, routineId, sessionId, [
      alpha!,
      gamma!,
      beta!,
    ]);
    expect(await moveMenuOpen(app.page)).toBe(false);
    await app.setTextScale(1);
  });

  test('RUI-AC-14/15 Escape, pointercancel and original-position releases write nothing; drags never trigger Edit/Delete (FIT-090, FIT-091, FIT-093, FIT-094)', async ({
    app,
    context,
  }, testInfo) => {
    const { routineId, sessionId, exerciseIds } =
      await seedSessionWithExercises(
        app,
        'ex-cancel',
        'routine-ex-cancel',
        'Cancel Routine',
        'session-ex-cancel',
        'Cancel Session',
        ['Press', 'Pull', 'Squat'],
      );
    const revisionBefore = await committedRevision(app.page);
    const useTouch = hasTouch(testInfo);

    // Escape mid-drag.
    let gesture = await holdDrag(
      context,
      app.page,
      useTouch,
      exerciseReorderHandle(app.page, 'Press'),
    );
    // Measured after holdDrag's scroll-into-view so the point is not stale.
    const lastCenter = await elementCenter(
      exerciseRowById(app.page, exerciseIds[2]!),
    );
    await gesture.move(lastCenter);
    await gesture.move(lastCenter);
    await app.page.keyboard.press('Escape');
    await gesture.release();
    expect(await exerciseRowIds(app.page)).toEqual(exerciseIds);
    expect(await committedRevision(app.page)).toBe(revisionBefore);
    // No editor or confirmation sheet opened during the drag.
    await expect(app.page.getByRole('alertdialog')).toHaveCount(0);
    await expect(app.page.getByLabel('Exercise name')).toHaveCount(0);

    // Pointer cancel mid-drag over the last row's Delete control: the drag
    // swallows the interaction — Delete never activates.
    gesture = await holdDrag(
      context,
      app.page,
      useTouch,
      exerciseReorderHandle(app.page, 'Press'),
    );
    const deleteCenter = await elementCenter(
      exerciseRowAction(app.page, exerciseIds[2]!, 'Delete', 'Squat'),
    );
    await gesture.move(deleteCenter);
    await gesture.cancel();
    await expect(app.page.getByRole('alertdialog')).toHaveCount(0);
    expect(await exerciseRowIds(app.page)).toEqual(exerciseIds);
    expect(await committedRevision(app.page)).toBe(revisionBefore);

    // Release at the original position: no mutation attempted. The drop
    // point is measured after holdDrag's scroll-into-view settles but before
    // any preview-inducing move reflows the rows.
    gesture = await holdDrag(
      context,
      app.page,
      useTouch,
      exerciseReorderHandle(app.page, 'Press'),
    );
    const firstCenter = await rowDropPoint(
      exerciseRowById(app.page, exerciseIds[0]!),
      'before',
    );
    // Move to the MIDDLE row, not the last: the bottom row's center sits in
    // the autoscroll edge zone at 568px, which would scroll the layout and
    // leave the measured drop point stale.
    await gesture.move(
      await elementCenter(exerciseRowById(app.page, exerciseIds[1]!)),
    );
    await gesture.move(firstCenter);
    await gesture.release();
    expect(await committedExerciseIds(app.page, routineId, sessionId)).toEqual(
      exerciseIds,
    );
    expect(await committedRevision(app.page)).toBe(revisionBefore);
  });

  test('RUI-AC-16 autoscroll reaches an initially offscreen destination across variable-height wrapped rows (FIT-092)', async ({
    app,
    context,
  }, testInfo) => {
    // Alternating short and very long names force variable row heights.
    const names = Array.from({ length: 16 }, (_, index) =>
      index % 2 === 0
        ? `Lift ${index + 1}`
        : `A very long exercise name number ${index + 1} that wraps onto several lines at narrow widths`,
    );
    const { routineId, sessionId, exerciseIds } =
      await seedSessionWithExercises(
        app,
        'ex-autoscroll',
        'routine-ex-scroll',
        'Scroll Routine',
        'session-ex-scroll',
        'Scroll Session',
        names,
      );
    const lastRow = exerciseRowById(app.page, exerciseIds.at(-1)!);
    await expect(lastRow).not.toBeInViewport();
    const useTouch = hasTouch(testInfo);
    const viewport = app.page.viewportSize();
    const bottomEdge = {
      x: viewport!.width / 2,
      y: viewport!.height - 12,
    };

    const reached = await edgeDragRevealAndDrop(context, app.page, {
      useTouch,
      handle: exerciseReorderHandle(app.page, names[0]!),
      edge: bottomEdge,
      dropOn: lastRow,
      placement: 'after',
    });
    expect(reached).toBe(true);
    const expected = [...exerciseIds.slice(1), exerciseIds[0]!];
    await waitForCommittedExerciseOrder(
      app.page,
      routineId,
      sessionId,
      expected,
    );
    await waitForRenderedExerciseOrder(app.page, expected);

    // Cancelling an edge-ward drag writes nothing.
    const revisionBefore = await committedRevision(app.page);
    const orderBefore = await committedExerciseIds(
      app.page,
      routineId,
      sessionId,
    );
    const gesture = await holdDrag(
      context,
      app.page,
      useTouch,
      exerciseReorderHandle(app.page, names[1]!),
    );
    await gesture.move(bottomEdge);
    await app.page.keyboard.press('Escape');
    await gesture.release();
    expect(await committedExerciseIds(app.page, routineId, sessionId)).toEqual(
      orderBefore,
    );
    expect(await committedRevision(app.page)).toBe(revisionBefore);
  });

  test('RUI-AC-24 empty and single-exercise sessions expose no enabled reorder affordance and keep their CTAs (FIT-100)', async ({
    app,
  }) => {
    await app.startFreshApp('ex-empty');
    await app.createRoutine('Empty Ex Routine');
    await app.click('Back');
    await app.click('Empty Ex Routine');
    await app.addSession('Solo Session');
    await openSessionRow(app.page, 'Solo Session');

    // Empty list keeps its existing CTA and shows no grip.
    await app.expectText('Add Exercise');
    await expect(
      app.page.getByRole('button', { name: /^Reorder / }),
    ).toHaveCount(0);

    await app.addExercise({ name: 'Only Lift' });
    await app.expectDisabled('Reorder Only Lift');
    await expect(legacyMoveButtons(app.page)).toHaveCount(0);
  });

  test('RUI-AC-29 exercise reorder saves offline and survives reconnect+reload; an ordered v2 document imports with array order preserved (FIT-105)', async ({
    app,
    context,
  }) => {
    const { routineId, sessionId, exerciseIds } =
      await seedSessionWithExercises(
        app,
        'ex-offline',
        'routine-ex-offline',
        'Offline Routine',
        'session-ex-offline',
        'Offline Session',
        ['One', 'Two', 'Three'],
      );
    const [one, two, three] = exerciseIds;

    await context.setOffline(true);
    await moveViaArrowKey(
      app.page,
      exerciseReorderHandle(app.page, 'Three'),
      'earlier',
    );
    await waitForCommittedExerciseOrder(app.page, routineId, sessionId, [
      one!,
      three!,
      two!,
    ]);
    await context.setOffline(false);
    await app.page.reload();
    await app.click('Offline Routine');
    await openSessionRow(app.page, 'Offline Session');
    await waitForRenderedExerciseOrder(app.page, [one!, three!, two!]);

    // Import round-trip: a v2 document with a reordered exercise array
    // keeps that exact array order — no export needed.
    await app.startFreshApp('ex-import');
    const ordered = buildExerciseSessionDocument(
      'routine-imported',
      'Imported Routine',
      'session-imported',
      'Imported Session',
      ['Zeta', 'Alpha', 'Mid'],
    );
    await app.importDocument(ordered);
    await app.expectText('Imported Routine');
    await app.click('Imported Routine');
    await openSessionRow(app.page, 'Imported Session');
    await expect
      .poll(() =>
        committedExerciseIds(app.page, 'routine-imported', 'session-imported'),
      )
      .toEqual([
        'session-imported-e001',
        'session-imported-e002',
        'session-imported-e003',
      ]);
    expect(await exerciseRowNames(app.page)).toEqual(['Zeta', 'Alpha', 'Mid']);
  });

  test('RUI-AC-30 a failed exercise reorder restores the latest committed order with a visible announced error (FIT-106)', async ({
    app,
  }) => {
    const { routineId, sessionId, exerciseIds } =
      await seedSessionWithExercises(
        app,
        'ex-failure',
        'routine-ex-failure',
        'Failure Routine',
        'session-ex-failure',
        'Failure Session',
        ['North', 'South', 'East'],
      );
    const revisionBefore = await committedRevision(app.page);

    await app.page.evaluate(abortNextReadwriteTransaction);
    await moveViaMenu(
      app.page,
      exerciseReorderHandle(app.page, 'South'),
      'earlier',
    );
    await app.expectText('could not be saved');
    await expect.poll(() => exerciseRowIds(app.page)).toEqual(exerciseIds);
    expect(await committedExerciseIds(app.page, routineId, sessionId)).toEqual(
      exerciseIds,
    );
    expect(await committedRevision(app.page)).toBe(revisionBefore);
    await app.page.reload();
    await app.click('Failure Routine');
    await openSessionRow(app.page, 'Failure Session');
    await expect.poll(() => exerciseRowIds(app.page)).toEqual(exerciseIds);
  });

  test('RUI-AC-31 a revision conflict fails closed: stored order never overwritten, no automatic retry (FIT-107)', async ({
    app,
  }) => {
    const { routineId, sessionId, exerciseIds } =
      await seedSessionWithExercises(
        app,
        'ex-conflict',
        'routine-ex-conflict',
        'Conflict Routine',
        'session-ex-conflict',
        'Conflict Session',
        ['Up', 'Down', 'Left'],
      );
    const loadedIds = [...exerciseIds];

    // Another writer commits a different exercise order at a higher revision.
    const record = await readPrimaryRecord(app.page);
    expect(record).toBeTruthy();
    const conflicting = structuredClone(record!);
    const session = conflicting.document.routines
      .find((entry) => entry.id === routineId)!
      .sessions.find((entry) => entry.id === sessionId)!;
    session.exercises = [...session.exercises].reverse();
    conflicting.storageRevision = record!.storageRevision + 1;
    await app.seedRecords({ primary: conflicting, recovery: conflicting });
    const conflictingIds = await committedExerciseIds(
      app.page,
      routineId,
      sessionId,
    );
    expect(conflictingIds).not.toEqual(loadedIds);

    await moveViaArrowKey(
      app.page,
      exerciseReorderHandle(app.page, 'Up'),
      'later',
    );
    await app.expectText('Fitness data changed in another tab');
    await expect.poll(() => exerciseRowIds(app.page)).toEqual(loadedIds);
    expect(await committedExerciseIds(app.page, routineId, sessionId)).toEqual(
      conflictingIds,
    );
    expect(await committedRevision(app.page)).toBe(record!.storageRevision + 1);
  });

  test('RUI-AC-32/34 a pending exercise reorder suppresses grips on BOTH lists; a screen switch mid-pending never retargets the write (FIT-108, FIT-110)', async ({
    app,
  }) => {
    const names = ['Sun', 'Moon', 'Star'];
    const { routineId, sessionId, exerciseIds } =
      await seedSessionWithExercises(
        app,
        'ex-pending',
        'routine-ex-pending',
        'Pending Routine',
        'session-ex-pending',
        'Pending Session',
        names,
      );
    // Give the routine a second session so its session list has enabled grips.
    const record = await readPrimaryRecord(app.page);
    const withSecond = structuredClone(record!);
    withSecond!.document.routines
      .find((entry) => entry.id === routineId)!
      .sessions.push({
        id: 'session-ex-pending-2',
        name: 'Second Session',
        order: 2,
        exercises: [],
      });
    withSecond!.storageRevision = record!.storageRevision + 1;
    await app.seedRecords({ primary: withSecond, recovery: withSecond });
    await app.page.reload();
    await app.click('Pending Routine');
    await openSessionRow(app.page, 'Pending Session');

    const revisionBefore = await committedRevision(app.page);
    await app.page.evaluate(gateNextReadwritePrimaryGet);
    try {
      await moveViaArrowKey(
        app.page,
        exerciseReorderHandle(app.page, 'Star'),
        'earlier',
      );
      await expect(exerciseList(app.page)).toHaveAttribute('aria-busy', 'true');
      const grips = reorderControls(app.page, 'exercise');
      for (let index = 0; index < (await grips.count()); index += 1) {
        await expect(grips.nth(index)).toBeDisabled();
      }
      expect(await moveMenuOpen(app.page)).toBe(false);

      // Screen switch mid-pending: the session list's grips are suppressed
      // by the same global gate, and the pending write is not retargeted.
      await app.click('Back');
      const sessionGrips = reorderControls(app.page, 'session');
      for (let index = 0; index < (await sessionGrips.count()); index += 1) {
        await expect(sessionGrips.nth(index)).toBeDisabled();
      }
    } finally {
      await releaseReorderSave(app.page);
    }

    // The exercise reorder landed on the originally captured session —
    // navigation mid-save never redirected it.
    const [sun, moon, star] = exerciseIds;
    await waitForCommittedExerciseOrder(app.page, routineId, sessionId, [
      sun!,
      star!,
      moon!,
    ]);
    await expect
      .poll(() => committedRevision(app.page))
      .toBe(revisionBefore + 1);
    const committed = await committedRoutine(app.page, routineId);
    expect(
      committed!.sessions.find((s) => s.id === 'session-ex-pending-2')!
        .exercises,
    ).toEqual([]);
  });

  test('RUI-AC-28/33 duplicate exercise names reorder by id; edit-after-reorder edits the right row, delete preserves order, comma decimals still work (FIT-104, FIT-109)', async ({
    app,
  }) => {
    const { routineId, sessionId, exerciseIds } =
      await seedSessionWithExercises(
        app,
        'ex-dupes',
        'routine-ex-dupes',
        'Dupes Routine',
        'session-ex-dupes',
        'Dupes Session',
        ['Twin', 'Twin', 'Solo'],
      );
    const [firstTwin, secondTwin, solo] = exerciseIds;

    // Move the FIRST twin down via its row-scoped grip; identity is by id.
    const grip = exerciseRowReorderHandle(app.page, firstTwin!, 'Twin');
    await grip.focus();
    await app.page.keyboard.press('ArrowDown');
    await waitForCommittedExerciseOrder(app.page, routineId, sessionId, [
      secondTwin!,
      firstTwin!,
      solo!,
    ]);

    // Edit-after-reorder targets the moved row's own id.
    await exerciseRowAction(app.page, firstTwin!, 'Edit', 'Twin').click();
    await app.fill('Weight in kilograms', '42,5');
    await app.click('Save');
    await expect(app.page.getByLabel('Exercise name')).toHaveCount(0);
    const session = await committedRoutine(app.page, routineId).then(
      (routine) => routine!.sessions.find((s) => s.id === sessionId)!,
    );
    const edited = session.exercises.find((e) => e.id === firstTwin)!;
    expect(edited.weightKg).toBe(42.5);
    // Sibling twin untouched, order preserved after the edit.
    expect(session.exercises.map((e) => e.id)).toEqual([
      secondTwin,
      firstTwin,
      solo,
    ]);

    // Delete preserves the relative order of what remains.
    await exerciseRowAction(app.page, secondTwin!, 'Delete', 'Twin').click();
    await app.page
      .getByRole('alertdialog')
      .getByRole('button', { name: /^Delete/ })
      .click();
    await waitForCommittedExerciseOrder(app.page, routineId, sessionId, [
      firstTwin!,
      solo!,
    ]);

    // No other session/routine was touched.
    const committed = await committedRoutine(app.page, routineId);
    expect(committed!.sessions).toHaveLength(1);
  });

  test('Exercise reorder UI stays accessible: no serious/critical axe violations on the session detail (FIT-086)', async ({
    app,
  }, testInfo) => {
    await seedSessionWithExercises(
      app,
      'ex-a11y',
      'routine-ex-a11y',
      'A11y Routine',
      'session-ex-a11y',
      'A11y Session',
      ['Dip', 'Chin', 'Plank'],
    );
    const result = await new AxeBuilder({ page: app.page }).analyze();
    const seriousCritical = result.violations
      .filter(({ impact }) => ['serious', 'critical'].includes(impact ?? ''))
      .map(({ id, impact, nodes }) => `${id}:${impact}:${nodes.length}`);
    expect(seriousCritical).toEqual([]);
    await app.page.screenshot({
      path: testInfo.outputPath('exercise-list-a11y.png'),
      fullPage: true,
    });
  });
});
