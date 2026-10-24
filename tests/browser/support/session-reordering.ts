import {
  expect,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test';

/**
 * Support helpers for the session reordering acceptance spec
 * (docs/session-reordering-acceptance.md, SRO-01..SRO-24 => FIT-053..076)
 * and the roomier-ui reorder specs (docs/roomier-ui-acceptance.md,
 * RUI-AC-11..24 => FIT-087..100).
 *
 * DOM contract (lead-frozen at T0, generic across both lists):
 * - ul[aria-label="Training sessions"] lists sessions; ul[aria-label=
 *   "Exercises"] lists exercises inside a session.
 * - Each row is li[data-session-id] / li[data-exercise-id].
 * - The ONLY reorder affordance is the grip button (aria-label
 *   "Reorder ${name}"): a 28px SVG in a >=52px target. There are NO
 *   visible "Move ${name} up/down" buttons.
 * - ArrowUp/ArrowDown on the focused grip move one position directly;
 *   tap/click/Enter/Space on the grip opens an anchored menu with
 *   "Move earlier" / "Move later" items (boundaries disabled).
 * - The list sets aria-busy="true" while a reorder save is pending and a
 *   polite live region (role=status) announces "{name} moved to position
 *   {n}." and failures.
 * - Exercise rows additionally render Edit ${name} / Delete ${name} on a
 *   lower row inside the same li.
 */

export interface ExerciseRecordShape {
  id: string;
  name: string;
  sets: number;
  repetitions: number;
  weightKg: number;
}

export interface CommittedFitnessRecord {
  storageRevision: number;
  document: {
    schemaVersion: number;
    routines: Array<{
      id: string;
      name: string;
      notes?: string;
      sessions: Array<{
        id: string;
        name: string;
        order: number;
        exercises: ExerciseRecordShape[];
      }>;
      snapshots?: unknown[];
    }>;
  };
}

/* ------------------------------------------------------------------ */
/* Generic list plumbing                                               */
/* ------------------------------------------------------------------ */

export type ListKind = 'session' | 'exercise';

const listLabels: Record<ListKind, string> = {
  session: 'Training sessions',
  exercise: 'Exercises',
};

const rowAttributes: Record<ListKind, string> = {
  session: 'data-session-id',
  exercise: 'data-exercise-id',
};

export const reorderableList = (page: Page, kind: ListKind): Locator =>
  page.getByRole('list', { name: listLabels[kind] });

export const itemRows = (page: Page, kind: ListKind): Locator =>
  reorderableList(page, kind).locator(`li[${rowAttributes[kind]}]`);

export const itemRowById = (
  page: Page,
  kind: ListKind,
  itemId: string,
): Locator =>
  reorderableList(page, kind).locator(`li[${rowAttributes[kind]}="${itemId}"]`);

export const itemRowIds = async (
  page: Page,
  kind: ListKind,
): Promise<string[]> =>
  itemRows(page, kind).evaluateAll(
    (rows, attribute) => rows.map((row) => row.getAttribute(attribute) ?? ''),
    rowAttributes[kind],
  );

/** The 52px grip is the only reorder control in either list. */
export const reorderGrip = (
  page: Page,
  kind: ListKind,
  name: string,
): Locator =>
  reorderableList(page, kind).getByRole('button', {
    name: `Reorder ${name}`,
    exact: true,
  });

/** Grip inside one specific row — safe with duplicate item names. */
export const rowReorderGrip = (
  page: Page,
  kind: ListKind,
  itemId: string,
  name: string,
): Locator =>
  itemRowById(page, kind, itemId).getByRole('button', {
    name: `Reorder ${name}`,
    exact: true,
  });

/** Every reorder grip in a list. */
export const reorderControls = (
  page: Page,
  kind: ListKind = 'session',
): Locator =>
  reorderableList(page, kind).getByRole('button', {
    name: /^Reorder /,
    exact: false,
  });

/**
 * The superseded SR-03 affordance must not exist anywhere: no visible
 * "Move {name} up/down" buttons may render.
 */
export const legacyMoveButtons = (page: Page): Locator =>
  page.getByRole('button', { name: /^Move .+ (up|down)$/ });

export const reorderStatus = (page: Page): Locator => page.getByRole('status');

/* ------------------------------------------------------------------ */
/* Move menu ("Move earlier" / "Move later")                           */
/* ------------------------------------------------------------------ */

/** A menu item may be role=menuitem or a plain button inside the menu. */
const menuItem = (page: Page, name: 'Move earlier' | 'Move later'): Locator =>
  page
    .getByRole('menuitem', { name, exact: true })
    .or(page.getByRole('button', { name, exact: true }));

export const moveEarlierItem = (page: Page): Locator =>
  menuItem(page, 'Move earlier');
export const moveLaterItem = (page: Page): Locator =>
  menuItem(page, 'Move later');

export const moveMenuOpen = async (page: Page): Promise<boolean> =>
  (await moveEarlierItem(page).count()) > 0 ||
  (await moveLaterItem(page).count()) > 0;

/**
 * Activates a grip without dragging (a plain click never crosses the 6px
 * threshold) and waits for the anchored move menu to appear.
 */
export const openMoveMenu = async (
  page: Page,
  grip: Locator,
): Promise<void> => {
  await grip.click();
  await expect(
    moveEarlierItem(page).or(moveLaterItem(page)).first(),
  ).toBeVisible();
};

/**
 * Moves an item one position through the pointer-accessible move menu —
 * the WCAG 2.5.7 non-drag alternative that rides the same reorder
 * pipeline as drag and arrow keys.
 */
export const moveViaMenu = async (
  page: Page,
  grip: Locator,
  direction: 'earlier' | 'later',
): Promise<void> => {
  await openMoveMenu(page, grip);
  const item = direction === 'earlier' ? moveEarlierItem : moveLaterItem;
  await item(page).click();
};

/**
 * Moves an item one position with ArrowUp/ArrowDown pressed on the
 * focused grip — the direct keyboard path (no pickup mode).
 */
export const moveViaArrowKey = async (
  page: Page,
  grip: Locator,
  direction: 'earlier' | 'later',
): Promise<void> => {
  await grip.focus();
  await page.keyboard.press(direction === 'earlier' ? 'ArrowUp' : 'ArrowDown');
};

/* ------------------------------------------------------------------ */
/* Session-list conveniences (kept names from the SRO suite)           */
/* ------------------------------------------------------------------ */

export const sessionList = (page: Page): Locator =>
  reorderableList(page, 'session');

export const sessionRows = (page: Page): Locator => itemRows(page, 'session');

export const sessionRowById = (page: Page, sessionId: string): Locator =>
  itemRowById(page, 'session', sessionId);

export const sessionRowIds = async (page: Page): Promise<string[]> =>
  itemRowIds(page, 'session');

export const sessionRowNames = async (page: Page): Promise<string[]> =>
  sessionRows(page)
    .locator('.list-button strong')
    .evaluateAll((nodes) =>
      nodes.map((node) => node.textContent?.trim() ?? ''),
    );

export const reorderHandle = (page: Page, name: string): Locator =>
  reorderGrip(page, 'session', name);

export const rowReorderHandle = (
  page: Page,
  sessionId: string,
  name: string,
): Locator => rowReorderGrip(page, 'session', sessionId, name);

export const openSessionRow = async (
  page: Page,
  name: string,
): Promise<void> => {
  const button = sessionList(page).locator('.list-button', {
    has: page.locator('strong', {
      hasText: new RegExp(`^${escapeRegExp(name)}$`),
    }),
  });
  await expect(button).toHaveCount(1);
  await button.click();
};

/* ------------------------------------------------------------------ */
/* Exercise-list conveniences                                          */
/* ------------------------------------------------------------------ */

export const exerciseList = (page: Page): Locator =>
  reorderableList(page, 'exercise');

export const exerciseRows = (page: Page): Locator => itemRows(page, 'exercise');

export const exerciseRowById = (page: Page, exerciseId: string): Locator =>
  itemRowById(page, 'exercise', exerciseId);

export const exerciseRowIds = async (page: Page): Promise<string[]> =>
  itemRowIds(page, 'exercise');

export const exerciseRowNames = async (page: Page): Promise<string[]> =>
  exerciseRows(page)
    .locator('strong')
    .evaluateAll((nodes) =>
      nodes.map((node) => node.textContent?.trim() ?? ''),
    );

export const exerciseReorderHandle = (page: Page, name: string): Locator =>
  reorderGrip(page, 'exercise', name);

export const exerciseRowReorderHandle = (
  page: Page,
  exerciseId: string,
  name: string,
): Locator => rowReorderGrip(page, 'exercise', exerciseId, name);

/** Exercise-row Edit/Delete controls, scoped to one row by id. */
export const exerciseRowAction = (
  page: Page,
  exerciseId: string,
  action: 'Edit' | 'Delete',
  name: string,
): Locator =>
  exerciseRowById(page, exerciseId).getByRole('button', {
    name: `${action} ${name}`,
    exact: true,
  });

/* ------------------------------------------------------------------ */
/* Committed-state reads                                               */
/* ------------------------------------------------------------------ */

export const readPrimaryRecord = async (
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
          const get = transaction.objectStore('records').get('primary');
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

export const committedRoutine = async (page: Page, routineId: string) =>
  (await readPrimaryRecord(page))?.document.routines.find(
    (routine) => routine.id === routineId,
  );

export const committedSession = async (
  page: Page,
  routineId: string,
  sessionId: string,
) =>
  (await committedRoutine(page, routineId))?.sessions.find(
    (session) => session.id === sessionId,
  );

export const committedSessionIds = async (
  page: Page,
  routineId: string,
): Promise<string[]> =>
  [...((await committedRoutine(page, routineId))?.sessions ?? [])]
    .sort((a, b) => a.order - b.order)
    .map((session) => session.id);

/** Exercise order is the literal `session.exercises` array position. */
export const committedExerciseIds = async (
  page: Page,
  routineId: string,
  sessionId: string,
): Promise<string[]> =>
  ((await committedSession(page, routineId, sessionId))?.exercises ?? []).map(
    (exercise) => exercise.id,
  );

export const committedRevision = async (page: Page): Promise<number> =>
  (await readPrimaryRecord(page))?.storageRevision ?? -1;

export const routineIdByName = async (
  page: Page,
  name: string,
): Promise<string> => {
  const routine = (await readPrimaryRecord(page))?.document.routines.find(
    (entry) => entry.name === name,
  );
  if (!routine) throw new Error(`Routine ${name} not found in primary record.`);
  return routine.id;
};

export const sessionIdsByNames = async (
  page: Page,
  routineId: string,
  names: string[],
): Promise<string[]> => {
  const routine = await committedRoutine(page, routineId);
  if (!routine) throw new Error(`Routine ${routineId} not committed.`);
  // Duplicate names resolve to successive occurrences — a per-name
  // occurrence counter, never a fallback to the first match.
  const used = new Map<string, number>();
  return names.map((name) => {
    const matches = routine.sessions.filter((session) => session.name === name);
    const occurrence = used.get(name) ?? 0;
    used.set(name, occurrence + 1);
    const match = matches[occurrence];
    if (!match)
      throw new Error(
        `Session ${name} (occurrence ${occurrence}) not committed to ${routineId}.`,
      );
    return match.id;
  });
};

export const sessionIdByName = async (
  page: Page,
  routineId: string,
  name: string,
): Promise<string> => (await sessionIdsByNames(page, routineId, [name]))[0]!;

/** Resolve exercise ids by name inside one session; duplicates map by
 *  successive per-name occurrence — never a fallback to the first match. */
export const exerciseIdsByNames = async (
  page: Page,
  routineId: string,
  sessionId: string,
  names: string[],
): Promise<string[]> => {
  const session = await committedSession(page, routineId, sessionId);
  if (!session) throw new Error(`Session ${sessionId} not committed.`);
  const used = new Map<string, number>();
  return names.map((name) => {
    const matches = session.exercises.filter(
      (exercise) => exercise.name === name,
    );
    const occurrence = used.get(name) ?? 0;
    used.set(name, occurrence + 1);
    const match = matches[occurrence];
    if (!match)
      throw new Error(
        `Exercise ${name} (occurrence ${occurrence}) not committed to ${sessionId}.`,
      );
    return match.id;
  });
};

export const waitForCommittedOrder = async (
  page: Page,
  routineId: string,
  sessionIds: string[],
): Promise<void> => {
  await expect
    .poll(() => committedSessionIds(page, routineId), {
      message: `Committed order for ${routineId} did not become ${sessionIds.join(',')}`,
    })
    .toEqual(sessionIds);
};

export const waitForRenderedOrder = async (
  page: Page,
  sessionIds: string[],
): Promise<void> => {
  await expect
    .poll(() => sessionRowIds(page), {
      message: `Rendered order did not become ${sessionIds.join(',')}`,
    })
    .toEqual(sessionIds);
};

export const waitForCommittedExerciseOrder = async (
  page: Page,
  routineId: string,
  sessionId: string,
  exerciseIds: string[],
): Promise<void> => {
  await expect
    .poll(() => committedExerciseIds(page, routineId, sessionId), {
      message: `Committed exercise order for ${sessionId} did not become ${exerciseIds.join(',')}`,
    })
    .toEqual(exerciseIds);
};

export const waitForRenderedExerciseOrder = async (
  page: Page,
  exerciseIds: string[],
): Promise<void> => {
  await expect
    .poll(() => exerciseRowIds(page), {
      message: `Rendered exercise order did not become ${exerciseIds.join(',')}`,
    })
    .toEqual(exerciseIds);
};

/* ------------------------------------------------------------------ */
/* Trusted input: mouse drags, CDP touch, native scroll, autoscroll    */
/* ------------------------------------------------------------------ */

/** Center point of a locator; throws when the element is not rendered. */
export const elementCenter = async (locator: Locator) => {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Element has no bounding box for drag input.');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

const centerOf = elementCenter;

/**
 * Drop point that unambiguously targets insert-before (top quarter) or
 * insert-after (bottom quarter) of a row's midpoint per indexFromPoint.
 */
export const rowDropPoint = async (
  locator: Locator,
  placement: 'before' | 'after',
): Promise<{ x: number; y: number }> => {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Row has no bounding box for drop input.');
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height * (placement === 'before' ? 0.25 : 0.75),
  };
};

export const mouseDrag = async (
  page: Page,
  from: Locator,
  to: { x: number; y: number },
): Promise<void> => {
  // Rows can sit below the fold on short viewports; bring the grip into view
  // before measuring its center or the trusted input starts offscreen.
  await from.scrollIntoViewIfNeeded();
  const start = await centerOf(from);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  // A genuine pointer gesture needs several intermediate moves; this is
  // input cadence for drag recognition, not an assertion sleep.
  const steps = 12;
  for (let step = 1; step <= steps; step += 1) {
    await page.mouse.move(
      start.x + ((to.x - start.x) * step) / steps,
      start.y + ((to.y - start.y) * step) / steps,
    );
  }
};

export const mouseRelease = (page: Page) => page.mouse.up();

export const dragHandleToRow = async (
  page: Page,
  handle: Locator,
  targetRow: Locator,
  placement: 'before' | 'after' = 'before',
): Promise<void> => {
  // Scroll the grip into view FIRST, then measure the drop point — otherwise
  // the coordinate is stale the moment scrollIntoViewIfNeeded shifts layout.
  await handle.scrollIntoViewIfNeeded();
  await mouseDrag(page, handle, await rowDropPoint(targetRow, placement));
  await page.mouse.up();
};

const delay = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

/**
 * Real trusted browser-level touch drag via Chromium CDP
 * Input.dispatchTouchEvent. DOM-dispatched TouchEvents and mouse input at a
 * mobile viewport do not prove the native pointer/touch arbitration path.
 */
export const touchDrag = async (
  context: BrowserContext,
  page: Page,
  from: Locator,
  to: { x: number; y: number },
): Promise<void> => {
  await from.scrollIntoViewIfNeeded();
  const start = await centerOf(from);
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
            x: start.x + ((to.x - start.x) * step) / steps,
            y: start.y + ((to.y - start.y) * step) / steps,
            id: 0,
          },
        ],
      });
      // Controlled input cadence so the browser delivers distinct move
      // frames during the gesture; assertions never rely on this delay.
      await delay(30);
    }
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
  } finally {
    await session.detach();
  }
};

/**
 * Trusted native touch scroll performed outside the drag handle, on the row
 * body. Returns the scroll offset delta observed after the gesture.
 */
export const touchScrollOn = async (
  context: BrowserContext,
  page: Page,
  over: Locator,
  deltaY: number,
): Promise<number> => {
  const start = await centerOf(over);
  const before = await page.evaluate(() => window.scrollY);
  const session = await context.newCDPSession(page);
  try {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: start.x, y: start.y, id: 0 }],
    });
    const steps = 8;
    for (let step = 1; step <= steps; step += 1) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          {
            x: start.x,
            y: start.y - (deltaY * step) / steps,
            id: 0,
          },
        ],
      });
      await delay(30);
    }
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
  } finally {
    await session.detach();
  }
  await expect.poll(() => page.evaluate(() => window.scrollY)).not.toBe(before);
  return (await page.evaluate(() => window.scrollY)) - before;
};

/**
 * Modality-unified native scroll outside the drag handle: trusted CDP touch
 * scroll on hasTouch projects, trusted wheel input on desktop. Returns the
 * observed scroll delta.
 */
export const scrollOutsideHandle = async (
  context: BrowserContext,
  page: Page,
  useTouch: boolean,
  over: Locator,
): Promise<number> => {
  if (useTouch) return touchScrollOn(context, page, over, 300);
  const before = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 400);
  await expect.poll(() => page.evaluate(() => window.scrollY)).not.toBe(before);
  return (await page.evaluate(() => window.scrollY)) - before;
};

/** Trusted-input handle drag: CDP touch on hasTouch projects, real mouse. */
export const trustedDrag = async (
  context: BrowserContext,
  page: Page,
  useTouch: boolean,
  from: Locator,
  to: { x: number; y: number },
): Promise<void> => {
  if (useTouch) {
    await touchDrag(context, page, from, to);
    return;
  }
  await mouseDrag(page, from, to);
  await page.mouse.up();
};

export interface HeldGesture {
  move: (to: { x: number; y: number }) => Promise<void>;
  release: () => Promise<void>;
  cancel: () => Promise<void>;
}

/**
 * Starts a trusted drag on `from` and leaves the pointer/contact held so the
 * test can act mid-gesture (Escape, cancellation, further moves). Touch
 * projects use a CDP session that stays open until release/cancel; desktop
 * uses the real mouse. `cancel` is a trusted touchCancel on touch projects
 * and a DOM pointercancel on desktop (no trusted mouse-cancel exists).
 */
export const holdDrag = async (
  context: BrowserContext,
  page: Page,
  useTouch: boolean,
  from: Locator,
): Promise<HeldGesture> => {
  await from.scrollIntoViewIfNeeded();
  const start = await centerOf(from);
  if (useTouch) {
    const session = await context.newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: start.x, y: start.y, id: 0 }],
    });
    return {
      move: async (to) => {
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: to.x, y: to.y, id: 0 }],
        });
        await delay(30);
      },
      release: async () => {
        try {
          await session.send('Input.dispatchTouchEvent', {
            type: 'touchEnd',
            touchPoints: [],
          });
        } finally {
          await session.detach();
        }
      },
      cancel: async () => {
        try {
          await session.send('Input.dispatchTouchEvent', {
            type: 'touchCancel',
            touchPoints: [],
          });
        } finally {
          await session.detach();
        }
      },
    };
  }
  // Capture the real pointerId of the gesture so a synthetic pointercancel
  // can target exactly the active pointer (the product ignores cancels
  // from other pointer ids).
  await from.evaluate((element) => {
    element.addEventListener(
      'pointerdown',
      (event) => {
        (window as unknown as Record<string, unknown>).__xqDragPointerId = (
          event as PointerEvent
        ).pointerId;
      },
      { once: true },
    );
  });
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  return {
    move: async (to) => page.mouse.move(to.x, to.y),
    release: () => page.mouse.up(),
    cancel: async () => {
      const pointerId = await page.evaluate(
        () =>
          ((window as unknown as Record<string, unknown>).__xqDragPointerId as
            number | undefined) ?? 1,
      );
      await from.dispatchEvent('pointercancel', { pointerId });
    },
  };
};

/**
 * Holds a pointer/touch drag at the given viewport-edge point, polling until
 * the target row's midpoint enters the viewport (proof the autoscroll made
 * it reachable, not merely that the row exists in the DOM), then moves onto
 * the revealed row and releases. Uses trusted CDP touch on hasTouch projects
 * and real mouse input on desktop. Returns false when the autoscroll never
 * revealed the destination (the gesture is released).
 */
export const edgeDragRevealAndDrop = async (
  context: BrowserContext,
  page: Page,
  {
    useTouch,
    handle,
    edge,
    dropOn,
    placement,
  }: {
    useTouch: boolean;
    handle: Locator;
    edge: { x: number; y: number };
    dropOn: Locator;
    placement: 'before' | 'after';
  },
): Promise<boolean> => {
  const dropPointVisible = async () => {
    const box = await dropOn.boundingBox();
    const viewport = page.viewportSize();
    if (!box || !viewport) return false;
    const midY = box.y + box.height / 2;
    const midX = box.x + box.width / 2;
    return (
      midY >= 0 &&
      midY <= viewport.height &&
      midX >= 0 &&
      midX <= viewport.width
    );
  };
  await handle.scrollIntoViewIfNeeded();
  const start = await centerOf(handle);
  if (useTouch) {
    const session = await context.newCDPSession(page);
    try {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: start.x, y: start.y, id: 0 }],
      });
      let ok = false;
      for (let attempt = 0; attempt < 60 && !ok; attempt += 1) {
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: edge.x, y: edge.y, id: 0 }],
        });
        ok = await dropPointVisible();
        // Input cadence between edge moves so the autoscroll rAF loop can
        // run; the reveal check itself is polled, never slept on.
        if (!ok) await delay(60);
      }
      if (!ok) {
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchEnd',
          touchPoints: [],
        });
        return false;
      }
      // The revealed row may still drift with the autoscroll; move to the
      // drop point, then re-measure and settle once before releasing.
      const first = await rowDropPoint(dropOn, placement).catch(() => null);
      if (first) {
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: first.x, y: first.y, id: 0 }],
        });
      }
      await delay(80);
      const point = await rowDropPoint(dropOn, placement).catch(() => null);
      if (!point) {
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchEnd',
          touchPoints: [],
        });
        return false;
      }
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: point.x, y: point.y, id: 0 }],
      });
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
      return true;
    } finally {
      await session.detach();
    }
  }

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  let ok = false;
  for (let attempt = 0; attempt < 60 && !ok; attempt += 1) {
    await page.mouse.move(edge.x, edge.y);
    ok = await dropPointVisible();
    if (!ok) await delay(60);
  }
  if (!ok) {
    await page.mouse.up();
    return false;
  }
  const first = await rowDropPoint(dropOn, placement).catch(() => null);
  if (first) await page.mouse.move(first.x, first.y);
  await delay(80);
  const point = await rowDropPoint(dropOn, placement).catch(() => null);
  if (!point) {
    await page.mouse.up();
    return false;
  }
  await page.mouse.move(point.x, point.y);
  await page.mouse.up();
  return true;
};

/* ------------------------------------------------------------------ */
/* Storage fault gates (reused for both lists' reorder saves)          */
/* ------------------------------------------------------------------ */

/** Aborts the next readwrite transaction once; used to fail a reorder save. */
export const abortNextReadwriteTransaction = () => {
  const nativeTransaction = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function (
    this: IDBDatabase,
    ...args: Parameters<IDBDatabase['transaction']>
  ) {
    const transaction = Reflect.apply(nativeTransaction, this, args);
    if (args[1] === 'readwrite') {
      IDBDatabase.prototype.transaction = nativeTransaction;
      queueMicrotask(() => transaction.abort());
    }
    return transaction;
  };
};

/**
 * Narrowly gates exactly one pending reorder save without a product hook:
 * the next readwrite transaction's `get('primary')` (the request the
 * repository awaits before writing) returns a request facade whose
 * success/error delivery is held. Meanwhile chained readonly `count()`
 * keepalive requests on the SAME transaction keep it active, so the held
 * event can be delivered later without a TransactionInactiveError.
 * window.__releaseReorderSave() delivers the held event from inside a
 * keepalive request's success task — the only window where the transaction
 * is guaranteed active — then lets the transaction finish normally. Callers
 * must release in a finally block so a failing test cannot leave the gate
 * armed.
 */
export const gateNextReadwritePrimaryGet = () => {
  const nativeGet = IDBObjectStore.prototype.get;
  IDBObjectStore.prototype.get = function (
    this: IDBObjectStore,
    ...args: Parameters<IDBObjectStore['get']>
  ) {
    const request = Reflect.apply(nativeGet, this, args);
    if (
      this.transaction.mode !== 'readwrite' ||
      this.name !== 'records' ||
      args[0] !== 'primary'
    ) {
      return request;
    }
    IDBObjectStore.prototype.get = nativeGet;
    const transaction = this.transaction;

    const eventTypes = ['success', 'error'];
    const listeners = new Map<
      string,
      Set<EventListenerOrEventListenerObject>
    >();
    const held: Array<[string, Event]> = [];
    let released = false;

    const facade = Object.create(IDBRequest.prototype);
    const emit = (type: string, event: Event) => {
      for (const listener of listeners.get(type) ?? []) {
        if (typeof listener === 'function') listener.call(facade, event);
        else listener.handleEvent(event);
      }
    };
    const deliver = (type: string, event: Event) => {
      if (released) emit(type, event);
      else held.push([type, event]);
    };

    // Chained requests keep the transaction alive while the get is held.
    // Release delivers the held event from inside a ping's success handler:
    // at release time the in-flight request has usually already completed,
    // so queuing a new request would hit the inactive gap and throw
    // TransactionInactiveError — emitting during event dispatch does not.
    let pingPending = false;
    const release = () => {
      released = true;
      for (const [type, event] of held.splice(0)) emit(type, event);
      delete (window as unknown as Record<string, unknown>)
        .__releaseReorderSave;
    };
    const keepalive = () => {
      try {
        const ping = transaction.objectStore('records').count();
        pingPending = true;
        ping.onsuccess = () => {
          pingPending = false;
          if (!released) keepalive();
          else release();
        };
        ping.onerror = () => {
          pingPending = false;
        };
      } catch {
        // Transaction already inactive/committed; nothing to keep alive.
      }
    };
    keepalive();

    Object.defineProperties(facade, {
      addEventListener: {
        value: (type: string, listener: EventListenerOrEventListenerObject) => {
          if (!listener) return;
          const registered = listeners.get(type) ?? new Set();
          registered.add(listener);
          listeners.set(type, registered);
        },
      },
      removeEventListener: {
        value: (type: string, listener: EventListenerOrEventListenerObject) =>
          listeners.get(type)?.delete(listener),
      },
      dispatchEvent: {
        value: (event: Event) => {
          emit(event.type, event);
          return !event.defaultPrevented;
        },
      },
      error: { get: () => request.error },
      readyState: { get: () => request.readyState },
      result: { get: () => request.result },
      source: { get: () => request.source },
      transaction: { get: () => request.transaction },
    });
    for (const type of eventTypes) {
      Object.defineProperty(facade, `on${type}`, {
        get: () => [...(listeners.get(type) ?? [])][0] ?? null,
        set: (listener: EventListener | null) => {
          listeners.set(type, new Set(listener ? [listener] : []));
        },
      });
      request.addEventListener(type, (event) => deliver(type, event));
    }

    Object.assign(window, {
      __releaseReorderSave: () => {
        released = true;
        // No in-flight ping means the chain already broke; deliver anyway
        // so the repository rejects rather than hanging.
        if (!pingPending) release();
      },
    });
    return facade;
  };
};

export const releaseReorderSave = async (page: Page): Promise<void> => {
  await page.evaluate(() => {
    const release = (window as unknown as Record<string, unknown>)
      .__releaseReorderSave;
    if (typeof release !== 'function')
      throw new Error('Reorder save gate was not armed.');
    (release as () => void)();
  });
};

/* ------------------------------------------------------------------ */
/* Seed document builders                                              */
/* ------------------------------------------------------------------ */

/**
 * Builds a schema-v2 document with one routine of sequential sessions for
 * seedRecords. `notes` is intentionally omitted: an empty string fails the
 * zod routine schema.
 */
export const buildRoutineDocument = (
  routineId: string,
  routineName: string,
  sessionNames: string[],
) => ({
  schemaVersion: 2,
  routines: [
    {
      id: routineId,
      name: routineName,
      sessions: sessionNames.map((name, index) => ({
        id: `${routineId}-s${String(index + 1).padStart(3, '0')}`,
        name,
        order: index + 1,
        exercises: [] as ExerciseRecordShape[],
      })),
      snapshots: [] as unknown[],
    },
  ],
});

/**
 * Builds a schema-v2 document with one routine containing ONE session that
 * holds `exerciseNames` in array order — the canonical exercise ordering.
 * Exercise objects carry real sets/reps/weightKg values so rows render
 * their full metadata line.
 */
export const buildExerciseSessionDocument = (
  routineId: string,
  routineName: string,
  sessionId: string,
  sessionName: string,
  exerciseNames: string[],
  options: { order?: number } = {},
) => ({
  schemaVersion: 2,
  routines: [
    {
      id: routineId,
      name: routineName,
      sessions: [
        {
          id: sessionId,
          name: sessionName,
          order: options.order ?? 1,
          exercises: exerciseNames.map((name, index) => ({
            id: `${sessionId}-e${String(index + 1).padStart(3, '0')}`,
            name,
            sets: 3 + (index % 3),
            repetitions: 8 + index,
            weightKg: 20 + index * 5,
          })),
        },
      ],
      snapshots: [] as unknown[],
    },
  ],
});

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
