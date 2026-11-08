import type { BrowserContext, Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

import {
  mouseRelease,
  readPrimaryRecord,
  type CommittedFitnessRecord,
} from './session-reordering.js';

const delay = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const routineRow = (page: Page, name: string): Locator =>
  page
    .locator('.routine-row')
    .filter({
      has: page.locator('strong', {
        hasText: new RegExp(`^${escapeRegExp(name)}$`),
      }),
    })
    .first();

export const routineRowById = (page: Page, routineId: string): Locator =>
  page.locator(`.routine-row[data-routine-id="${routineId}"]`);

export const routineOpenButton = (page: Page, name: string): Locator =>
  routineRow(page, name).locator('.list-button');

export const persistentDeleteButton = (page: Page, name: string): Locator =>
  routineRow(page, name).locator('.routine-persistent-delete');

export const persistentDeleteById = (page: Page, routineId: string): Locator =>
  routineRowById(page, routineId).locator('.routine-persistent-delete');

export const revealedDeleteButton = (page: Page, name: string): Locator =>
  routineRow(page, name).locator('.routine-reveal-delete');

export const swipeSurface = (page: Page, name: string): Locator =>
  routineRow(page, name).locator('.routine-swipe-surface');

export const swipeTrack = (page: Page, name: string): Locator =>
  routineRow(page, name).locator('.routine-swipe-track');

export const confirmDialog = (page: Page): Locator =>
  page.getByRole('alertdialog');

export const readRecoveryRecord = async (
  page: Page,
): Promise<CommittedFitnessRecord | null> =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const request = indexedDB.open('xq-fitness');
        request.onerror = () => resolve(null);
        request.onsuccess = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains('records')) {
            database.close();
            resolve(null);
            return;
          }
          const transaction = database.transaction('records', 'readonly');
          const get = transaction.objectStore('records').get('recovery');
          get.onsuccess = () => resolve(get.result ?? null);
          transaction.oncomplete = () => database.close();
          transaction.onerror = () => {
            database.close();
            resolve(null);
          };
          transaction.onabort = () => {
            database.close();
            resolve(null);
          };
        };
      }) as Promise<CommittedFitnessRecord | null>,
  );

export const revealOffset = async (page: Page, name: string): Promise<number> =>
  swipeTrack(page, name).evaluate((element) => {
    const match = /translateX\((-?\d+(?:\.\d+)?)px\)/.exec(
      (element as HTMLElement).style.transform,
    );
    return match ? Math.abs(Number(match[1])) : 0;
  });

export const expectRevealed = async (
  page: Page,
  name: string,
  revealed: boolean,
): Promise<void> => {
  await expect
    .poll(async () => revealOffset(page, name), {
      message: `Expected ${name} reveal offset ${revealed ? '≥64' : '0'}`,
    })
    .toBe(revealed ? 64 : 0);
};

/**
 * Leftward swipe on the routine card. Positive `distancePx` = left.
 * Pass `useTouch` from `testInfo.project.use.hasTouch`.
 */
export const swipeRoutine = async (
  context: BrowserContext,
  page: Page,
  name: string,
  distancePx: number,
  useTouch: boolean,
  options: { verticalPx?: number; cancel?: boolean } = {},
): Promise<void> => {
  const surface = swipeSurface(page, name);
  await surface.scrollIntoViewIfNeeded();
  const box = await surface.boundingBox();
  if (!box) throw new Error(`No geometry for routine ${name}`);
  const start = { x: box.x + box.width * 0.7, y: box.y + box.height / 2 };
  const end = {
    x: start.x - distancePx,
    y: start.y + (options.verticalPx ?? 0),
  };

  if (useTouch) {
    const session = await context.newCDPSession(page);
    try {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: start.x, y: start.y, id: 0 }],
      });
      const steps = 10;
      for (let step = 1; step <= steps; step += 1) {
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [
            {
              x: start.x + ((end.x - start.x) * step) / steps,
              y: start.y + ((end.y - start.y) * step) / steps,
              id: 0,
            },
          ],
        });
        await delay(20);
      }
      await session.send('Input.dispatchTouchEvent', {
        type: options.cancel ? 'touchCancel' : 'touchEnd',
        touchPoints: [],
      });
    } finally {
      await session.detach();
    }
    return;
  }

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  const steps = 12;
  for (let step = 1; step <= steps; step += 1) {
    await page.mouse.move(
      start.x + ((end.x - start.x) * step) / steps,
      start.y + ((end.y - start.y) * step) / steps,
    );
  }
  if (options.cancel) {
    await surface.dispatchEvent('pointercancel', { pointerId: 1 });
    try {
      await mouseRelease(page);
    } catch {
      // Pointer may already be released by cancel.
    }
  } else {
    await mouseRelease(page);
  }
};

export const openDeleteConfirmFromList = async (
  page: Page,
  name: string,
): Promise<void> => {
  await persistentDeleteButton(page, name).click();
  await expect(confirmDialog(page)).toBeVisible();
};

export const openDeleteConfirmFromSwipe = async (
  context: BrowserContext,
  page: Page,
  name: string,
  useTouch: boolean,
): Promise<void> => {
  await swipeRoutine(context, page, name, 64, useTouch);
  await expectRevealed(page, name, true);
  await revealedDeleteButton(page, name).click({ force: true });
  await expect(confirmDialog(page)).toBeVisible();
};

export const confirmRoutineDelete = async (page: Page): Promise<void> => {
  const dialog = confirmDialog(page);
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(dialog).toHaveCount(0);
};

export const cancelRoutineDelete = async (page: Page): Promise<void> => {
  const dialog = confirmDialog(page);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
};

export const buildMultiRoutineDocument = (
  routines: ReadonlyArray<{
    id: string;
    name: string;
    sessions?: number;
    snapshots?: number;
  }>,
) => ({
  schemaVersion: 2 as const,
  routines: routines.map((routine) => ({
    id: routine.id,
    name: routine.name,
    sessions: Array.from({ length: routine.sessions ?? 0 }, (_, index) => ({
      id: `${routine.id}-s${index + 1}`,
      name: `Session ${index + 1}`,
      order: index + 1,
      exercises:
        index === 0
          ? [
              {
                id: `${routine.id}-e1`,
                name: 'Press',
                sets: 3,
                repetitions: 10,
                weightKg: 40,
              },
            ]
          : [],
    })),
    snapshots: Array.from({ length: routine.snapshots ?? 0 }, (_, index) => ({
      id: `${routine.id}-snap${index + 1}`,
      capturedAt: `2026-01-0${index + 1}T00:00:00.000Z`,
      entries: [],
    })),
  })),
});

export const seedDocument = async (
  app: {
    page: Page;
    seedRecords: (records: {
      primary: unknown;
      recovery: unknown;
    }) => Promise<void>;
  },
  document: ReturnType<typeof buildMultiRoutineDocument>,
  revision = 1,
): Promise<void> => {
  const record = {
    storageRevision: revision,
    document,
  };
  await app.seedRecords({
    primary: record,
    recovery: {
      storageRevision: Math.max(0, revision - 1),
      document: { schemaVersion: 2, routines: [] },
    },
  });
  await app.page.reload();
  await expect(app.page.locator('[data-ready="true"]')).toHaveCount(1);
};
