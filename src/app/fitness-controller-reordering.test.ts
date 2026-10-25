import { describe, expect, it, vi } from 'vitest';
import { FitnessController } from './fitness-controller';
import type { FitnessDependencies } from './dependencies';
import type { FitnessDocumentV2 } from '../fitness/domain/model';
import { applyMutation } from '../fitness/domain/mutations';

function dependencies(
  document: FitnessDocumentV2 = { schemaVersion: 2, routines: [] },
): FitnessDependencies {
  let current = document;
  return {
    repository: {
      load: vi.fn(async () => ({
        document: current,
        storageRevision: 0,
        recovered: false,
      })),
      apply: vi.fn(async (_revision, mutation) => {
        current = applyMutation(current, mutation);
        return { storageRevision: 1 };
      }),
    },
    ids: {
      next: (() => {
        let n = 0;
        return () => `id-${++n}`;
      })(),
    },
    clock: { nowIso: () => '2026-01-01T00:00:00.000Z' },
    importFileReader: { readText: async (file) => file.text() },
  };
}

const applyCalls = (deps: FitnessDependencies) =>
  (deps.repository.apply as ReturnType<typeof vi.fn>).mock.calls;

async function controllerWithSessions(
  deps: FitnessDependencies,
  names: readonly string[],
) {
  const controller = new FitnessController(deps);
  await controller.load();
  await controller.saveRoutine('Routine', '');
  for (const name of names) await controller.saveSession(name);
  return controller;
}

describe('FitnessController session reordering', () => {
  it('reorders sessions and skips the write for a no-op order', async () => {
    const deps = dependencies();
    const controller = await controllerWithSessions(deps, ['A', 'B', 'C']);
    const routineId = controller.routine!.id;
    const [a, b, c] = controller.routine!.sessions.map((session) => session.id);
    // FIT-075: a no-op reorder skips the repository write entirely.
    const writesBefore = applyCalls(deps).length;
    await controller.reorderSessions(routineId, [a!, b!, c!]);
    expect(applyCalls(deps).length).toBe(writesBefore);
    // FIT-053: an actual reorder writes once and publishes the new order.
    await controller.reorderSessions(routineId, [c!, a!, b!]);
    const sorted = [...controller.routine!.sessions].sort(
      (left, right) => left.order - right.order,
    );
    expect(sorted.map((session) => session.id)).toEqual([c, a, b]);
    expect(applyCalls(deps).length).toBe(writesBefore + 1);
    expect(applyCalls(deps).at(-1)![1]).toEqual({
      kind: 'reorder-sessions',
      routineId,
      sessionIds: [c, a, b],
    });
  });

  it('keeps the committed order and reports validation and conflict failures', async () => {
    const deps = dependencies();
    const controller = await controllerWithSessions(deps, ['A', 'B']);
    const routineId = controller.routine!.id;
    const ids = controller.routine!.sessions.map((session) => session.id);
    // FIT-054: a malformed permutation fails before any repository write
    // and surfaces through controller.error like other command failures.
    const writesBefore = applyCalls(deps).length;
    const notified: number[] = [];
    controller.subscribe(() => notified.push(1));
    await expect(
      controller.reorderSessions(routineId, [ids[0]!, 'foreign']),
    ).rejects.toMatchObject({ code: 'validation' });
    expect(controller.error).toBe(
      'Session order must include every session exactly once.',
    );
    expect(notified.length).toBeGreaterThan(0);
    expect(applyCalls(deps).length).toBe(writesBefore);
    // FIT-067: a storage conflict fails closed, preserves committed order,
    // and does not retry automatically.
    deps.repository.apply = vi.fn(async () => {
      const { FitnessError, messages } =
        await import('../fitness/domain/errors');
      throw new FitnessError('storage-conflict', messages.conflict);
    });
    await expect(
      controller.reorderSessions(routineId, [ids[1]!, ids[0]!]),
    ).rejects.toMatchObject({ code: 'storage-conflict' });
    expect(controller.error).toContain('another tab');
    expect(controller.routine!.sessions.map((session) => session.id)).toEqual(
      ids,
    );
    expect(controller.reorderPending).toBe(false);
  });

  it('suppresses a second reorder while a save is pending across selection changes', async () => {
    const deps = dependencies();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const controller = await controllerWithSessions(deps, ['A', 'B']);
    await controller.saveRoutine('Other', '');
    const firstRoutine = controller.document.routines[0]!;
    const ids = firstRoutine.sessions.map((session) => session.id);
    const realApply = deps.repository.apply;
    deps.repository.apply = vi.fn(async (revision, mutation) => {
      await gate;
      return realApply(revision, mutation);
    });
    controller.selectRoutine(controller.document.routines[1]!.id);
    const pendingSave = controller.reorderSessions(firstRoutine.id, [
      ids[1]!,
      ids[0]!,
    ]);
    expect(controller.reorderPending).toBe(true);
    // FIT-068: suppressed even though the selected routine changed.
    await controller.reorderSessions(firstRoutine.id, ids);
    release();
    await pendingSave;
    const reorders = applyCalls(deps).filter(
      ([, mutation]) =>
        (mutation as { kind: string }).kind === 'reorder-sessions',
    );
    expect(reorders).toHaveLength(1);
    expect(reorders[0]![1]).toMatchObject({
      routineId: firstRoutine.id,
      sessionIds: [ids[1], ids[0]],
    });
    expect(controller.reorderPending).toBe(false);
    const reordered = controller.document.routines[0]!;
    expect(
      [...reordered.sessions]
        .sort((left, right) => left.order - right.order)
        .map((session) => session.id),
    ).toEqual([ids[1], ids[0]]);
  });

  // FIT-068: unrelated mutations keep the existing serialization rules.
  it('serializes a reorder behind an unrelated pending mutation', async () => {
    const deps = dependencies();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const controller = await controllerWithSessions(deps, ['A', 'B']);
    const routineId = controller.routine!.id;
    const ids = controller.routine!.sessions.map((session) => session.id);
    const realApply = deps.repository.apply;
    let gated = true;
    deps.repository.apply = vi.fn(async (revision, mutation) => {
      if (gated) await gate;
      return realApply(revision, mutation);
    });
    const unrelated = controller.renameSelectedSession('Renamed');
    const reorder = controller.reorderSessions(routineId, [ids[1]!, ids[0]!]);
    expect(controller.reorderPending).toBe(true);
    gated = false;
    release();
    await Promise.all([unrelated, reorder]);
    const sorted = [...controller.routine!.sessions].sort(
      (left, right) => left.order - right.order,
    );
    expect(sorted.map((session) => session.id)).toEqual([ids[1], ids[0]]);
  });

  // FIT-066: a failed reorder save restores committed order and surfaces the
  // error without retry.
  it('clears pending in finally and preserves revision on failure', async () => {
    const deps = dependencies();
    const controller = await controllerWithSessions(deps, ['A', 'B']);
    const routineId = controller.routine!.id;
    const revisionBefore = controller.revision;
    const documentBefore = controller.document;
    deps.repository.apply = vi.fn(async () => {
      throw new Error('disk full');
    });
    await expect(
      controller.reorderSessions(
        routineId,
        controller.routine!.sessions.map((session) => session.id).reverse(),
      ),
    ).rejects.toThrow('disk full');
    expect(controller.reorderPending).toBe(false);
    expect(controller.revision).toBe(revisionBefore);
    expect(controller.document).toBe(documentBefore);
    expect(controller.error).toBe('disk full');
  });

  // FIT-068: the queued mutation uses a snapshot of the caller's ids array.
  it('snapshots the sessionIds input before queueing the reorder', async () => {
    const deps = dependencies();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const controller = await controllerWithSessions(deps, ['A', 'B']);
    const routineId = controller.routine!.id;
    const [a, b] = controller.routine!.sessions.map((session) => session.id);
    const realApply = deps.repository.apply;
    deps.repository.apply = vi.fn(async (revision, mutation) => {
      await gate;
      return realApply(revision, mutation);
    });
    const sessionIds = [b!, a!];
    const pendingSave = controller.reorderSessions(routineId, sessionIds);
    // The caller mutates its array before the queued mutation runs; the
    // queued reorder must still commit the originally requested order.
    sessionIds.reverse();
    release();
    await pendingSave;
    const sorted = [...controller.routine!.sessions].sort(
      (left, right) => left.order - right.order,
    );
    expect(sorted.map((session) => session.id)).toEqual([b, a]);
  });
});
