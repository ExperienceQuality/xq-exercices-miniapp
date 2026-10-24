import AxeBuilder from '@axe-core/playwright';

import { expect, test } from './support/app.js';
import {
  buildRoutineDocument,
  exerciseList,
  exerciseRows,
  legacyMoveButtons,
  openSessionRow,
  readPrimaryRecord,
  reorderControls,
  sessionRows,
} from './support/session-reordering.js';

const VIEWPORTS = [320, 390, 768, 1440] as const;

const boxesOverlap = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

const noHorizontalOverflow = async (page: import('@playwright/test').Page) => {
  const metrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(
    metrics.scrollWidth,
    `Horizontal overflow: scrollWidth ${metrics.scrollWidth} > clientWidth ${metrics.clientWidth}`,
  ).toBeLessThanOrEqual(metrics.clientWidth);
};

const fontSizeOf = async (
  locator: import('@playwright/test').Locator,
): Promise<number> =>
  locator.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).fontSize),
  );

/** Closes whichever editor sheet is open (Cancel button or Escape). */
const dismissEditorSheet = async (
  page: import('@playwright/test').Page,
): Promise<void> => {
  const fields = page
    .getByLabel('Routine name')
    .or(page.getByLabel('Session name'));
  const cancel = page.getByRole('button', { name: 'Cancel' }).first();
  const cancelVisible = await cancel.isVisible().catch(() => false);
  if (cancelVisible) await cancel.click();
  else await page.keyboard.press('Escape');
  await expect(fields).toHaveCount(0);
};

/**
 * Asserts every VISIBLE interactive element on the page meets the
 * >=52x52px target contract (text actions included; hidden file inputs are
 * covered by their visible label control).
 */
const expect52PxTargets = async (
  page: import('@playwright/test').Page,
): Promise<void> => {
  const controls = page.locator(
    [
      'button:visible',
      'a[href]:visible',
      'input:visible',
      'select:visible',
      'textarea:visible',
      '[role="menuitem"]:visible',
    ].join(','),
  );
  for (const control of await controls.all()) {
    const box = await control.boundingBox();
    expect(box, 'Visible control lacks geometry.').toBeTruthy();
    const label =
      (await control.getAttribute('aria-label')) ??
      (await control.innerText().catch(() => ''));
    expect(
      Math.min(box!.width, box!.height),
      `Control "${label}" under 52px in a dimension.`,
    ).toBeGreaterThanOrEqual(52);
  }
};

/** Asserts every VISIBLE action/chevron/grip/back SVG occupies exactly a
 *  28px box (+/-0.5px) at the default 100% root font size. */
const expect28PxIconBoxes = async (
  page: import('@playwright/test').Page,
): Promise<void> => {
  const iconBoxes = await page
    .locator('button svg:visible, .list-button svg:visible')
    .evaluateAll((svgs) =>
      svgs.map((svg) => {
        const box = svg.getBoundingClientRect();
        return { width: box.width, height: box.height };
      }),
    );
  expect(iconBoxes.length).toBeGreaterThan(0);
  for (const box of iconBoxes) {
    expect(box.width, 'Icon box width is not 28px.').toBeCloseTo(28, 0);
    expect(box.height, 'Icon box height is not 28px.').toBeCloseTo(28, 0);
  }
};

/** Computed horizontal padding of the app shell (safe-area insets are 0 in
 *  automation): 16px at <=360px, 20px otherwise. */
const shellPadding = async (
  page: import('@playwright/test').Page,
  width: number,
): Promise<{ left: number; right: number }> => {
  await page.setViewportSize({ width, height: 844 });
  return page.evaluate(() => {
    const shell = document.querySelector('.shell');
    if (!shell) throw new Error('App shell element missing.');
    const style = getComputedStyle(shell);
    return {
      left: Number.parseFloat(style.paddingLeft),
      right: Number.parseFloat(style.paddingRight),
    };
  });
};

/** Asserts the focused element shows a real visible focus indicator. */
const expectVisibleFocusIndicator = async (
  locator: import('@playwright/test').Locator,
): Promise<void> => {
  const focusStyle = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outline: `${style.outlineStyle} ${style.outlineWidth}`,
      shadow: style.boxShadow,
    };
  });
  const outlined =
    !focusStyle.outline.includes('none') && !focusStyle.outline.includes('0px');
  const shadowed = focusStyle.shadow !== 'none';
  expect(
    outlined || shadowed,
    'Focused element shows no visible indicator.',
  ).toBe(true);
};

test.describe('Roomier UI layout acceptance', () => {
  test('RUI-AC-01 typography floors hold on all three screens and the editor sheet (FIT-077)', async ({
    app,
  }) => {
    await app.startFreshApp('layout-type');
    await app.createRoutine('Type Routine');
    await app.click('Back');
    await app.click('Type Routine');
    await app.addSession('Type Session');
    await openSessionRow(app.page, 'Type Session');
    await app.addExercise({ name: 'Type Exercise' });

    // h1 page titles are 36px — the VISIBLE screen title inside the page
    // screen, never a hidden global/sr-only document title.
    const h1 = app.page
      .locator('.page-screen h1')
      .locator('visible=true')
      .first();
    await expect(h1).toBeVisible();
    expect(await fontSizeOf(h1)).toBeGreaterThanOrEqual(35.5);

    // Item name 20px, metadata >=15px on the exercise row.
    const exerciseName = exerciseRows(app.page).locator('strong').first();
    expect(await fontSizeOf(exerciseName)).toBeGreaterThanOrEqual(19.5);
    const metadata = exerciseRows(app.page).locator('small').first();
    expect(await fontSizeOf(metadata)).toBeGreaterThanOrEqual(14.5);

    // Buttons and body text >=18px.
    for (const name of ['Add Exercise', 'Edit Type Exercise']) {
      const button = app.page.getByRole('button', { name }).first();
      expect(
        await fontSizeOf(button),
        `${name} font size`,
      ).toBeGreaterThanOrEqual(17.5);
    }

    // Back to routine detail: session row name is 20px too.
    await app.click('Back');
    const sessionName = sessionRows(app.page)
      .locator('.list-button strong')
      .first();
    expect(await fontSizeOf(sessionName)).toBeGreaterThanOrEqual(19.5);

    // Editor sheet: title is 24px, input text >=18px.
    await app.click('Add Training Session');
    const sheetTitle = app.page.getByRole('heading', { level: 2 }).first();
    await expect(sheetTitle).toBeVisible();
    expect(await fontSizeOf(sheetTitle)).toBeGreaterThanOrEqual(23.5);
    const input = app.page.getByLabel('Session name');
    expect(await fontSizeOf(input)).toBeGreaterThanOrEqual(17.5);
    await dismissEditorSheet(app.page);
  });

  test('RUI-AC-02/07 very long names wrap fully at 320px and no badge competes with the exercise name (FIT-078, FIT-083)', async ({
    app,
  }) => {
    await app.page.setViewportSize({ width: 320, height: 568 });
    const long =
      'An extraordinarily long display name that absolutely must wrap across several rendered lines without any truncation';
    await app.startFreshApp('layout-wrap');
    await app.createRoutine(long);
    await app.click('Back');
    await app.click(long);
    await app.addSession(long);
    await openSessionRow(app.page, long);
    await app.addExercise({ name: long });

    const nameStrong = exerciseRows(app.page).locator('strong').first();
    await expect(nameStrong).toHaveText(long);
    const metrics = await nameStrong.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        height: box.height,
        fontSize: Number.parseFloat(style.fontSize),
        overflowX: style.overflowX,
        textOverflow: style.textOverflow,
        clipped:
          element.scrollHeight > element.clientHeight + 1 ||
          element.scrollWidth > element.clientWidth + 1,
      };
    });
    // The full name is present, renders on multiple lines, and is never
    // ellipsized or clipped.
    expect(metrics.height).toBeGreaterThan(metrics.fontSize * 1.4);
    expect(metrics.textOverflow).not.toBe('ellipsis');
    expect(metrics.clipped).toBe(false);
    await noHorizontalOverflow(app.page);

    // No initials badge / generated label beside the exercise name.
    const badges = await exerciseRows(app.page)
      .locator('[aria-hidden="true"]')
      .evaluateAll((nodes) =>
        nodes
          .map((node) => node.textContent?.trim() ?? '')
          .filter((text) => /^[A-Z]{1,2}$/.test(text)),
      );
    expect(badges).toEqual([]);
  });

  test('RUI-AC-03 no horizontal overflow at 320/390/768/1440 with spec padding and section gaps (FIT-079)', async ({
    app,
  }, testInfo) => {
    await app.startFreshApp('layout-overflow');
    await app.createRoutine('Overflow Routine');
    await app.click('Back');
    await app.click('Overflow Routine');
    await app.addSession('Overflow Session');
    await openSessionRow(app.page, 'Overflow Session');
    await app.addExercise({ name: 'Overflow Exercise' });

    for (const width of VIEWPORTS) {
      await app.page.setViewportSize({ width, height: 844 });
      // Session detail
      await noHorizontalOverflow(app.page);
      // Routine detail
      await app.click('Back');
      await noHorizontalOverflow(app.page);
      // Routines screen
      await app.click('Back');
      await noHorizontalOverflow(app.page);
      // Editor sheet open at this width
      await app.click('Create Routine');
      await expect(app.page.getByLabel('Routine name')).toBeVisible();
      await noHorizontalOverflow(app.page);
      await dismissEditorSheet(app.page);
      // Re-enter the routine for the next iteration.
      await app.click('Overflow Routine');
      await openSessionRow(app.page, 'Overflow Session');
      await app.page.screenshot({
        path: testInfo.outputPath(`layout-${width}px.png`),
      });
    }

    // Screen padding contract on .shell: exactly 16px at <=360px, 20px
    // wider; safe-area insets are 0 under automation.
    let padding = await shellPadding(app.page, 320);
    expect(padding.left).toBeCloseTo(16, 0);
    expect(padding.right).toBeCloseTo(16, 0);
    for (const width of [390, 768, 1440] as const) {
      padding = await shellPadding(app.page, width);
      expect(padding.left).toBeCloseTo(20, 0);
      expect(padding.right).toBeCloseTo(20, 0);
    }

    // 20px section gaps between screen sections.
    const sectionGap = await app.page
      .locator('.section-heading-row')
      .first()
      .evaluate((el) => Number.parseFloat(getComputedStyle(el).marginTop));
    expect(sectionGap).toBeGreaterThanOrEqual(19.5);
  });

  test('RUI-AC-04/05 the desktop shell stays a centered narrow app on the gray background and header actions wrap at 320px (FIT-080, FIT-081)', async ({
    app,
  }) => {
    await app.startFreshApp('layout-shell');
    await app.page.setViewportSize({ width: 1440, height: 900 });
    await app.page.reload();

    const shell = await app.page.evaluate(() => {
      const el = document.querySelector('main.shell, .shell');
      const mount = document.getElementById('app');
      if (!el) throw new Error('App shell element missing.');
      if (!mount) throw new Error('App mount #app missing.');
      const box = el.getBoundingClientRect();
      return {
        background: getComputedStyle(document.body).backgroundColor,
        width: box.width,
        left: box.left,
        bodyWidth: document.body.clientWidth,
        insideMount: mount.contains(el),
        mountIsBodyChild: mount.parentElement === document.body,
      };
    });
    // Existing centered narrow app (max 520px) on the gray grouped-list
    // background — the shell mounts inside #app with no extra app frame.
    expect(shell.background).toBe('rgb(242, 242, 247)');
    expect(shell.insideMount).toBe(true);
    expect(shell.mountIsBodyChild).toBe(true);
    expect(shell.width).toBeGreaterThanOrEqual(519);
    expect(shell.width).toBeLessThanOrEqual(521);
    // Centered: left edge is half the leftover viewport width.
    expect(
      Math.abs(shell.left - (shell.bodyWidth - shell.width) / 2),
      'App shell is not centered on the desktop viewport.',
    ).toBeLessThanOrEqual(4);
    // No fake phone/status-bar chrome exists in the document.
    await expect(
      app.page.locator(
        '[class*="status-bar"], [class*="device-frame"], [class*="phone-frame"]',
      ),
    ).toHaveCount(0);

    // Header action wrap at 320: Import + Create stay on-screen, don't
    // overlap, and never shrink their text below the body floor.
    await app.page.setViewportSize({ width: 320, height: 568 });
    // The existing import affordance is a labelled control; find it by its
    // visible text regardless of element kind.
    const importControl = app.page.getByText('Import Fitness JSON').first();
    const createButton = app.page
      .getByRole('button', { name: 'Create Routine' })
      .first();
    await expect(createButton).toBeVisible();
    await expect(importControl).toBeVisible();
    await noHorizontalOverflow(app.page);
    const a = await importControl.boundingBox();
    const b = await createButton.boundingBox();
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(
      boxesOverlap(a!, b!),
      'Header actions overlap instead of wrapping.',
    ).toBe(false);
    const size = await importControl.evaluate((el) =>
      Number.parseFloat(getComputedStyle(el).fontSize),
    );
    expect(size).toBeGreaterThanOrEqual(17.5);
  });

  test('RUI-AC-08/09/18 every target is >=52px, CTAs >=56px, top-level rows >=88px, action icons occupy a 28px box, session rows carry one grip only (FIT-084, FIT-085, FIT-094)', async ({
    app,
  }) => {
    await app.startFreshApp('layout-targets');
    await app.createRoutine('Targets Routine');
    await app.click('Back');
    await app.click('Targets Routine');
    await app.addSession('Targets Session');
    await app.addSession('Second Session');

    // Session rows: >=88px tall, opener + chevron + exactly one grip,
    // no legacy move buttons.
    const rows = sessionRows(app.page);
    for (let index = 0; index < (await rows.count()); index += 1) {
      const row = rows.nth(index);
      const box = await row.boundingBox();
      expect(box!.height, 'Session row under 88px.').toBeGreaterThanOrEqual(88);
      await expect(row.getByRole('button', { name: /^Reorder / })).toHaveCount(
        1,
      );
      // chevron icon present on the opener
      await expect(row.locator('svg').first()).toBeVisible();
    }
    await expect(legacyMoveButtons(app.page)).toHaveCount(0);

    // Every visible interactive target is >=52px in BOTH dimensions on the
    // routine detail screen, and on every screen + sheet below.
    await expect52PxTargets(app.page);
    await expect28PxIconBoxes(app.page);
    await openSessionRow(app.page, 'Targets Session');
    await app.addExercise({ name: 'Targets Exercise' });
    await expect52PxTargets(app.page);
    await expect28PxIconBoxes(app.page);
    await app.click('Back');
    await app.click('Back');
    await expect52PxTargets(app.page);
    await expect28PxIconBoxes(app.page);

    // The header text action is >=52px of content height.
    const textAction = app.page.getByRole('button', {
      name: 'Create Routine',
    });
    const textActionBox = await textAction.first().boundingBox();
    expect(textActionBox!.height).toBeGreaterThanOrEqual(52);

    // The real primary CTA: the editor sheet's Save button is >=56px tall;
    // every sheet input is a >=52px target with >=18px text.
    await app.click('Create Routine');
    await expect(app.page.getByLabel('Routine name')).toBeVisible();
    await app.fill('Routine name', 'CTA Routine');
    const saveCta = app.page
      .locator('[role="dialog"] .primary-cta, .sheet .primary-cta')
      .first();
    const ctaBox = await saveCta.boundingBox();
    expect(ctaBox!.height, 'Primary CTA under 56px.').toBeGreaterThanOrEqual(
      56,
    );
    await expect52PxTargets(app.page);
    for (const field of ['Routine name', 'Notes']) {
      const input = app.page.getByLabel(field, { exact: false }).first();
      const box = await input.boundingBox();
      expect(box!.height, `${field} input under 52px.`).toBeGreaterThanOrEqual(
        52,
      );
      expect(await fontSizeOf(input)).toBeGreaterThanOrEqual(17.5);
    }
    await dismissEditorSheet(app.page);

    // Confirmation sheet controls are >=52px targets too.
    await app.click('Targets Routine');
    await openSessionRow(app.page, 'Targets Session');
    await app.click('Delete Training Session');
    const confirm = app.page.getByRole('alertdialog');
    await expect(confirm).toBeVisible();
    await expect52PxTargets(app.page);
    await app.page.keyboard.press('Escape');
    await expect(confirm).toHaveCount(0);
    // The session was NOT deleted — dismissal cancelled the confirmation.
    await app.expectText('Targets Session');
    await app.click('Back');
    await app.click('Back');
  });

  test('RUI-AC-10 keyboard focus is visibly indicated and axe finds zero serious/critical violations incl. color contrast on every screen and sheet (FIT-086)', async ({
    app,
  }, testInfo) => {
    await app.startFreshApp('layout-a11y');
    await app.createRoutine('A11y Routine');
    await app.click('Back');
    await app.click('A11y Routine');
    await app.addSession('A11y Session');
    await openSessionRow(app.page, 'A11y Session');
    await app.addExercise({ name: 'A11y Exercise' });
    // A second exercise keeps the grips enabled — a singleton disables them.
    await app.addExercise({ name: 'A11y Exercise Two' });

    const runAxe = async (label: string) => {
      const result = await new AxeBuilder({ page: app.page }).analyze();
      const seriousCritical = result.violations
        .filter(({ impact }) => ['serious', 'critical'].includes(impact ?? ''))
        .map(({ id, impact, nodes }) => `${id}:${impact}:${nodes.length}`);
      expect(seriousCritical, `axe violations on ${label}`).toEqual([]);
    };

    // Focus visibility on a real control. Pure programmatic .focus() never
    // triggers :focus-visible, so focus the control immediately before the
    // grips ('Add Exercise') and move on with ONE real Tab press — keyboard
    // interaction makes the browser apply the :focus-visible indicator.
    const grip = reorderControls(app.page, 'exercise').first();
    await app.page
      .getByRole('button', { name: 'Add Exercise', exact: true })
      .focus();
    await app.page.keyboard.press('Tab');
    await expect(
      grip,
      'First exercise grip should follow Add Exercise in the tab order.',
    ).toBeFocused();
    await expectVisibleFocusIndicator(grip);

    await runAxe('session detail');
    await app.page.screenshot({
      path: testInfo.outputPath('a11y-session-detail.png'),
      fullPage: true,
    });
    await app.click('Back');
    await runAxe('routine detail');
    await app.click('Back');
    await runAxe('routines');
    // Editor sheet
    await app.click('Create Routine');
    await expect(app.page.getByLabel('Routine name')).toBeVisible();
    await runAxe('editor sheet');
  });

  test('RUI-AC-06 at 320px with 200% text scaling every control stays reachable and functional (FIT-082)', async ({
    app,
  }) => {
    await app.page.setViewportSize({ width: 320, height: 568 });
    await app.startFreshApp('layout-scale');
    await app.createRoutine('Scale Routine');
    await app.click('Back');
    await app.click('Scale Routine');
    await app.addSession('Scale Session');
    await openSessionRow(app.page, 'Scale Session');
    await app.addExercise({ name: 'Scale Exercise' });

    // Root font-size scaling (text zoom), not a viewport change.
    await app.setTextScale(2);
    await noHorizontalOverflow(app.page);

    // Full navigation loop and every primary control still works.
    await app.click('Back');
    await noHorizontalOverflow(app.page);
    await app.click('Back');
    await noHorizontalOverflow(app.page);
    await app.click('Scale Routine');
    await openSessionRow(app.page, 'Scale Session');
    await app.click('Add Exercise');
    await expect(app.page.getByLabel('Exercise name')).toBeVisible();
    await app.fill('Exercise name', 'Scaled Add');
    await app.fill('Sets', 2);
    await app.fill('Repetitions', 12);
    await app.fill('Weight in kilograms', '7,5');
    await app.click('Save');
    await expect(app.page.getByLabel('Exercise name')).toHaveCount(0);
    await app.expectText('Scaled Add');
    await app.setTextScale(1);
    await noHorizontalOverflow(app.page);
  });

  test('RUI-AC-01/09 progress details render at 18px and glyph arrows at 24px without overflow (FIT-077, FIT-085)', async ({
    app,
  }, testInfo) => {
    await app.startFreshApp('progress-legibility');
    await app.createRoutine('Progress Routine');
    await app.click('Back');
    await app.click('Progress Routine');
    await app.addSession('Progress Session');
    await openSessionRow(app.page, 'Progress Session');
    await app.addExercise({
      name: 'Rising Lift',
      sets: 4,
      repetitions: 12,
      weightKg: 20,
    });
    await app.addExercise({
      name: 'Falling Lift',
      sets: 3,
      repetitions: 8,
      weightKg: 30,
    });
    await app.click('Back');
    await app.click('Capture Progress');
    // Second capture after value edits so real arrow classes render.
    await openSessionRow(app.page, 'Progress Session');
    await app.click('Edit Rising Lift');
    await app.fill('Weight in kilograms', '25');
    await app.click('Save');
    await app.click('Edit Falling Lift');
    await app.fill('Repetitions', 6);
    await app.click('Save');
    await app.click('Back');
    await app.click('Capture Progress');

    await expect(app.page.locator('.progress-row')).toHaveCount(2);
    await expect(app.page.locator('.progress-increased')).not.toHaveCount(0);
    await expect(app.page.locator('.progress-decreased')).not.toHaveCount(0);
    await expect(app.page.locator('.progress-same')).not.toHaveCount(0);

    const details = app.page.locator('.progress-row small');
    const arrows = app.page.locator('.progress-arrow');
    for (const detail of await details.all()) {
      expect(await fontSizeOf(detail)).toBeCloseTo(18, 0);
    }
    for (const arrow of await arrows.all()) {
      expect(await fontSizeOf(arrow)).toBeCloseTo(24, 0);
    }
    await noHorizontalOverflow(app.page);
    // Element-level evidence of the real arrow state after the second
    // capture — the grouped list containing the progress rows.
    const progressList = app.page
      .locator('.grouped-list')
      .filter({ has: app.page.locator('.progress-row') });
    await progressList.screenshot({
      path: testInfo.outputPath('progress-rows-100pct.png'),
    });

    // Exercise and session metadata stays 15px; names stay 20px.
    await openSessionRow(app.page, 'Progress Session');
    const exerciseDetail = app.page.locator('.exercise-row small').first();
    await expect(exerciseDetail).toBeVisible();
    expect(await fontSizeOf(exerciseDetail)).toBeCloseTo(15, 0);
    const exerciseName = app.page
      .locator('.exercise-row .exercise-name')
      .first();
    expect(await fontSizeOf(exerciseName)).toBeCloseTo(20, 0);
    await app.click('Back');
    const sessionDetail = app.page.locator('.session-row small').first();
    await expect(sessionDetail).toBeVisible();
    expect(await fontSizeOf(sessionDetail)).toBeCloseTo(15, 0);

    // 200% text scaling at 320px: 36px details, 48px arrows, no clipping.
    await app.page.setViewportSize({ width: 320, height: 568 });
    await app.setTextScale(2);
    for (const detail of await details.all()) {
      expect(await fontSizeOf(detail)).toBeCloseTo(36, 0);
      await expect(detail).toBeVisible();
      expect(
        await detail.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
    }
    for (const arrow of await arrows.all()) {
      expect(await fontSizeOf(arrow)).toBeCloseTo(48, 0);
      const arrowBox = await arrow.boundingBox();
      const rowBox = await arrow.locator('xpath=..').boundingBox();
      expect(arrowBox).not.toBeNull();
      expect(rowBox).not.toBeNull();
      expect(arrowBox!.x).toBeGreaterThanOrEqual(rowBox!.x - 0.5);
      expect(arrowBox!.y).toBeGreaterThanOrEqual(rowBox!.y - 0.5);
      expect(arrowBox!.x + arrowBox!.width).toBeLessThanOrEqual(
        rowBox!.x + rowBox!.width + 0.5,
      );
      expect(arrowBox!.y + arrowBox!.height).toBeLessThanOrEqual(
        rowBox!.y + rowBox!.height + 0.5,
      );
    }
    await noHorizontalOverflow(app.page);
    await progressList.screenshot({
      path: testInfo.outputPath('progress-rows-320-200pct.png'),
    });
    await app.setTextScale(1);
    await noHorizontalOverflow(app.page);
  });

  test('RUI-AC-24/33 singleton and empty lists show no enabled reorder affordance while existing CTAs and progress flows are unchanged (FIT-100, FIT-109)', async ({
    app,
  }) => {
    await app.startFreshApp('layout-compat');
    await app.createRoutine('Compat Routine');
    await app.click('Back');
    await app.click('Compat Routine');

    // Empty session list keeps its CTA.
    await app.expectText('Add Training Session');
    await expect(
      app.page.getByRole('button', { name: /^Reorder / }),
    ).toHaveCount(0);

    await app.addSession('Compat Session');
    // Singleton grip may be hidden OR disabled — never enabled+visible.
    await expect(
      app.page.locator(
        'button[aria-label="Reorder Compat Session"]:visible:enabled',
      ),
    ).toHaveCount(0);
    await openSessionRow(app.page, 'Compat Session');
    // Empty exercise list keeps its CTA; progress capture still present.
    await app.expectText('Add Exercise');
    await expect(
      app.page.getByRole('button', { name: /^Reorder / }),
    ).toHaveCount(0);
    await app.addExercise({ name: 'Compat Exercise' });
    await expect(
      app.page.locator(
        'button[aria-label="Reorder Compat Exercise"]:visible:enabled',
      ),
    ).toHaveCount(0);
    await app.click('Back');
    await app.click('Capture Progress');
    await app.expectText('Compat Exercise');
  });

  test('RUI-AC-03/10 exercise Edit/Delete and confirmations remain functional at the smallest viewport (FIT-079, FIT-109)', async ({
    app,
  }) => {
    await app.page.setViewportSize({ width: 320, height: 568 });
    await app.startFreshApp('layout-editdelete');
    const document = buildRoutineDocument('routine-ed', 'ED Routine', [
      'ED Session',
    ]);
    const seeded = await readPrimaryRecord(app.page);
    const revision = (seeded?.storageRevision ?? 0) + 1;
    await app.seedRecords({
      primary: { storageRevision: revision, document },
      recovery: { storageRevision: revision, document },
    });
    await app.page.reload();
    await app.click('ED Routine');
    await openSessionRow(app.page, 'ED Session');
    await app.addExercise({ name: 'Delete Me' });
    await app.addExercise({ name: 'Keep Me' });

    await exerciseList(app.page)
      .getByRole('button', {
        name: 'Delete Delete Me',
        exact: true,
      })
      .click();
    await app.page
      .getByRole('alertdialog')
      .getByRole('button', { name: /^Delete/ })
      .click();
    await app.expectNoText('Delete Me');
    await noHorizontalOverflow(app.page);
    await expect(exerciseRows(app.page)).toHaveCount(1);
  });
});
