import { describe, expect, it, vi } from 'vitest';
import { FitnessController } from './fitness-controller';
import type { FitnessDependencies } from './dependencies';
import type { FitnessDocumentV2 } from '../fitness/domain/model';
import type { FitnessMutation } from '../fitness/domain/mutations';
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
  (deps.repository.apply as ReturnType<typeof vi.fn>).mock.calls as [
    number,
    FitnessMutation,
  ][];

describe('FitnessController', () => {
  it('loads and creates a normalized routine through the repository', async () => {
    const deps = dependencies();
    const controller = new FitnessController(deps);
    await controller.load();
    await controller.saveRoutine('  Legs  ', '  Strength  ');
    expect(controller.routine?.name).toBe('Legs');
    expect(controller.routine?.notes).toBe('Strength');
    expect(deps.repository.apply).toHaveBeenCalledOnce();
    expect(applyCalls(deps)[0]).toEqual([
      0,
      { kind: 'create-routine', routine: controller.document.routines[0] },
    ]);
  });

  it('keeps the feature unavailable and preserves the original safe load error', async () => {
    const deps = dependencies();
    deps.repository.load = vi.fn(async () => {
      throw new Error('Fitness data is unavailable.');
    });
    const controller = new FitnessController(deps);
    await controller.load();
    expect(controller.status).toBe('unavailable');
    expect(controller.error).toBe('Fitness data is unavailable.');
  });

  it('covers isolated navigation and editor state', () => {
    const controller = new FitnessController(dependencies());
    controller.selectRoutine('missing');
    expect(controller.routine).toBeUndefined();
    controller.selectSession('missing');
    controller.openEditor('routine');
    controller.closeEditor();
    controller.backToList();
    expect(controller.editor).toBeNull();
  });

  it('creates, appends, renames, and removes sessions', async () => {
    const controller = new FitnessController(dependencies());
    await controller.load();
    await controller.saveRoutine('Routine', '');
    await controller.saveSession('First');
    const first = controller.session!.id;
    await controller.saveSession('Second');
    expect(controller.routine!.sessions).toHaveLength(2);
    expect(controller.routine!.sessions[1]!.order).toBeGreaterThan(
      controller.routine!.sessions[0]!.order,
    );
    controller.selectSession(first);
    await controller.renameSelectedSession(' Renamed ');
    expect(controller.session!.name).toBe('Renamed');
    await controller.removeSession();
    expect(controller.routine!.sessions).toHaveLength(1);
  });

  it('creates, edits, removes, and snapshots exercises', async () => {
    const deps = dependencies();
    const controller = new FitnessController(deps);
    await controller.load();
    await controller.saveRoutine('Routine', '');
    await controller.saveSession('Session');
    await controller.saveExercise({
      name: ' Squat ',
      sets: 3,
      repetitions: 10,
      weightKg: 0,
    });
    const exercise = controller.session!.exercises[0]!;
    controller.openEditor('exercise', exercise.id);
    await controller.saveExercise({
      name: 'Squat',
      sets: 4,
      repetitions: 12,
      weightKg: 20.5,
    });
    expect(controller.session!.exercises[0]!.id).toBe(exercise.id);
    await controller.snapshot();
    expect(controller.notice).toContain('captured');
    await controller.removeExercise(exercise.id);
    await controller.snapshot();
    expect(controller.routine!.snapshots).toHaveLength(2);
    expect(applyCalls(deps).map(([, mutation]) => mutation.kind)).toEqual([
      'create-routine',
      'add-session',
      'add-exercise',
      'update-exercise',
      'capture-snapshot',
      'delete-exercise',
      'capture-snapshot',
    ]);
  });

  it('reports missing parent errors without publishing', async () => {
    const controller = new FitnessController(dependencies());
    await expect(controller.saveSession('No routine')).rejects.toMatchObject({
      code: 'missing-routine',
    });
    await expect(
      controller.saveExercise({
        name: 'x',
        sets: 1,
        repetitions: 1,
        weightKg: 0,
      }),
    ).rejects.toMatchObject({ code: 'missing-session' });
    await expect(controller.renameSelectedSession('x')).rejects.toMatchObject({
      code: 'missing-session',
    });
    await expect(controller.removeSession()).rejects.toMatchObject({
      code: 'missing-session',
    });
    await expect(controller.removeExercise('missing')).rejects.toMatchObject({
      code: 'missing-session',
    });
    await expect(controller.snapshot()).rejects.toMatchObject({
      code: 'missing-routine',
    });
  });

  it('does not publish a candidate when persistence fails', async () => {
    const deps = dependencies();
    deps.repository.apply = vi.fn(async () => {
      throw new Error('save failed');
    });
    const controller = new FitnessController(deps);
    await controller.load();
    await expect(controller.saveRoutine('Candidate', '')).rejects.toThrow(
      'save failed',
    );
    expect(controller.document.routines).toHaveLength(0);
    expect(controller.error).toBe('save failed');
  });

  it('keeps the next queued mutation usable after a storage failure', async () => {
    const deps = dependencies();
    const controller = new FitnessController(deps);
    await controller.load();
    const realApply = deps.repository.apply;
    deps.repository.apply = vi.fn(async () => {
      throw new Error('save failed');
    });
    await expect(controller.saveRoutine('First', '')).rejects.toThrow(
      'save failed',
    );
    const queued = controller.saveRoutine('Second', '');
    deps.repository.apply = realApply;
    await queued;
    expect(controller.routine?.name).toBe('Second');
    expect(controller.document.routines).toHaveLength(1);
  });

  it('persists import through a replace-document mutation', async () => {
    const deps = dependencies();
    const controller = new FitnessController(deps);
    await controller.load();
    await controller.importFile(undefined);
    expect(controller.notice).toBe('');
    await controller.importFile(
      new File(['{"schemaVersion":2,"routines":[]}'], 'fitness.json'),
    );
    expect(controller.notice).toBe('Fitness data imported.');
    expect(applyCalls(deps).at(-1)).toEqual([
      0,
      {
        kind: 'replace-document',
        document: { schemaVersion: 2, routines: [] },
      },
    ]);
    await controller.importFile(new File(['not-json'], 'broken.json'));
    expect(controller.error).toBe('The selected Fitness file is invalid.');
  });

  it('retries loading and maps unknown thrown values safely', async () => {
    const deps = dependencies();
    let attempts = 0;
    deps.repository.load = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) throw 'unknown failure';
      const document: FitnessDocumentV2 = { schemaVersion: 2, routines: [] };
      return {
        document,
        storageRevision: 4,
        recovered: false,
      };
    });
    const controller = new FitnessController(deps);
    await controller.load();
    expect(controller.status).toBe('unavailable');
    expect(controller.error).toBe('Fitness data is unavailable.');
    await controller.load();
    expect(controller.status).toBe('ready');
    expect(attempts).toBe(2);
  });

  it('serializes concurrent mutations through the mutation queue', async () => {
    const deps = dependencies();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    deps.repository.apply = vi.fn(async () => {
      await pending;
      return { storageRevision: 1 };
    });
    const controller = new FitnessController(deps);
    await controller.load();
    const first = controller.saveRoutine('First', '');
    const second = controller.saveRoutine('Second', '');
    release();
    await Promise.all([first, second]);
    expect(deps.repository.apply).toHaveBeenCalledTimes(2);
    expect(controller.routine?.name).toBe('Second');
  });

  it('notifies subscribers when load completes and supports unsubscribe', async () => {
    const controller = new FitnessController(dependencies());
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);
    await controller.load();
    expect(controller.status).toBe('ready');
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    await controller.load();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('FitnessController exercise reordering', () => {
  const exerciseIds = (controller: FitnessController) =>
    controller.session!.exercises.map((item) => item.id);

  async function controllerWithExercises(deps: FitnessDependencies) {
    const controller = new FitnessController(deps);
    await controller.load();
    await controller.saveRoutine('Routine', '');
    await controller.saveSession('Upper');
    for (const name of ['Press', 'Row', 'Curl']) {
      await controller.saveExercise({
        name,
        sets: 3,
        repetitions: 10,
        weightKg: 10,
      });
    }
    return controller;
  }

  it('reorders exercises, persists through reload, and skips a no-op write', async () => {
    const deps = dependencies();
    const controller = await controllerWithExercises(deps);
    const routineId = controller.routine!.id;
    const sessionId = controller.session!.id;
    const [a, b, c] = exerciseIds(controller);
    // FIT-103: a no-op reorder skips the repository write entirely.
    const writesBefore = applyCalls(deps).length;
    await controller.reorderExercises(routineId, sessionId, [a!, b!, c!]);
    expect(applyCalls(deps).length).toBe(writesBefore);
    // FIT-105: an actual reorder writes once, publishes the new order, and
    // the persisted mutation carries the exact permutation.
    await controller.reorderExercises(routineId, sessionId, [c!, a!, b!]);
    expect(exerciseIds(controller)).toEqual([c, a, b]);
    expect(applyCalls(deps).length).toBe(writesBefore + 1);
    const [revision, mutation] = applyCalls(deps).at(-1)!;
    expect(revision).toBe(controller.revision);
    expect(mutation).toEqual({
      kind: 'reorder-exercises',
      routineId,
      sessionId,
      exerciseIds: [c, a, b],
    });
    // A fresh controller reloading through the fake port sees the order.
    const again = new FitnessController(deps);
    await again.load();
    expect(
      again.document.routines[0]!.sessions[0]!.exercises.map((item) => item.id),
    ).toEqual([c, a, b]);
  });

  it('reports validation and missing-parent errors without writing', async () => {
    const deps = dependencies();
    const controller = await controllerWithExercises(deps);
    const routineId = controller.routine!.id;
    const sessionId = controller.session!.id;
    const ids = exerciseIds(controller);
    const writesBefore = applyCalls(deps).length;
    // FIT-102: a malformed permutation rejects with 'validation' before
    // any repository write and surfaces like other command failures.
    await expect(
      controller.reorderExercises(routineId, sessionId, [ids[0]!, 'foreign']),
    ).rejects.toMatchObject({ code: 'validation' });
    expect(controller.error).toBe(
      'Exercise order must include every exercise exactly once.',
    );
    // FIT-102: missing parents reject with the existing missing-*
    // messages; a stale permutation never reaches the repository.
    await expect(
      controller.reorderExercises('missing', sessionId, ids),
    ).rejects.toThrow('The routine no longer exists.');
    await expect(
      controller.reorderExercises(routineId, 'missing', ids),
    ).rejects.toThrow('The training session no longer exists.');
    expect(applyCalls(deps).length).toBe(writesBefore);
    expect(controller.reorderPending).toBe(false);
  });

  it('suppresses session reorders while an exercise save is pending and never retargets', async () => {
    const deps = dependencies();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const controller = await controllerWithExercises(deps);
    const routineId = controller.routine!.id;
    const sessionId = controller.session!.id;
    const ids = exerciseIds(controller);
    const sessionIds = controller.routine!.sessions.map(
      (session) => session.id,
    );
    const realApply = deps.repository.apply;
    deps.repository.apply = vi.fn(async (revision, mutation) => {
      await gate;
      return realApply(revision, mutation);
    });
    // FIT-108: the parent ids were captured in the call signature; moving
    // the selection mid-flight must not retarget the write.
    controller.selectSession('elsewhere');
    const pendingSave = controller.reorderExercises(routineId, sessionId, [
      ids[2]!,
      ids[0]!,
      ids[1]!,
    ]);
    expect(controller.reorderPending).toBe(true);
    // FIT-108: the shared gate also suppresses session-list reorders — the
    // call resolves while the gate is still held, so nothing was queued.
    await controller.reorderSessions(routineId, [...sessionIds].reverse());
    release();
    await pendingSave;
    expect(controller.reorderPending).toBe(false);
    const target = controller.document.routines
      .find((routine) => routine.id === routineId)!
      .sessions.find((session) => session.id === sessionId)!;
    expect(target.exercises.map((item) => item.id)).toEqual([
      ids[2],
      ids[0],
      ids[1],
    ]);
    // The suppressed session reorder wrote nothing: order is unchanged.
    expect(
      [...controller.routine!.sessions]
        .sort((left, right) => left.order - right.order)
        .map((session) => session.id),
    ).toEqual(sessionIds);
  });

  it('suppresses an exercise reorder while a session save is pending', async () => {
    const deps = dependencies();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const controller = await controllerWithExercises(deps);
    await controller.saveSession('Lower');
    const routineId = controller.routine!.id;
    const sessionIds = controller.routine!.sessions.map(
      (session) => session.id,
    );
    const upper = controller.routine!.sessions.find(
      (session) => session.name === 'Upper',
    )!;
    const ids = upper.exercises.map((item) => item.id);
    const realApply = deps.repository.apply;
    deps.repository.apply = vi.fn(async (revision, mutation) => {
      await gate;
      return realApply(revision, mutation);
    });
    const pendingSave = controller.reorderSessions(routineId, [
      sessionIds[1]!,
      sessionIds[0]!,
    ]);
    expect(controller.reorderPending).toBe(true);
    // FIT-108: suppressed — resolves immediately, queues nothing.
    await controller.reorderExercises(routineId, upper.id, [
      ids[2]!,
      ids[0]!,
      ids[1]!,
    ]);
    release();
    await pendingSave;
    expect(controller.reorderPending).toBe(false);
    const upperAfter = controller.document.routines[0]!.sessions.find(
      (session) => session.id === upper.id,
    )!;
    expect(upperAfter.exercises.map((item) => item.id)).toEqual(ids);
    const sorted = [...controller.routine!.sessions].sort(
      (left, right) => left.order - right.order,
    );
    expect(sorted.map((session) => session.id)).toEqual([
      sessionIds[1],
      sessionIds[0],
    ]);
  });

  // FIT-110: the queued mutation uses a copy of the caller's array; a
  // caller-side mutation before the queue drains must not leak in.
  it('copies the caller exerciseIds array before queueing', async () => {
    const deps = dependencies();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const controller = await controllerWithExercises(deps);
    const routineId = controller.routine!.id;
    const sessionId = controller.session!.id;
    const ids = exerciseIds(controller);
    const realApply = deps.repository.apply;
    deps.repository.apply = vi.fn(async (revision, mutation) => {
      await gate;
      return realApply(revision, mutation);
    });
    const requested = [ids[2]!, ids[0]!, ids[1]!];
    const pendingSave = controller.reorderExercises(
      routineId,
      sessionId,
      requested,
    );
    requested.reverse();
    release();
    await pendingSave;
    expect(exerciseIds(controller)).toEqual([ids[2], ids[0], ids[1]]);
  });

  // FIT-110: a reorder queued behind an add validates against the latest
  // document — the now-stale permutation rejects instead of clobbering.
  it('rejects a stale permutation queued behind an exercise add', async () => {
    const deps = dependencies();
    const controller = await controllerWithExercises(deps);
    const routineId = controller.routine!.id;
    const sessionId = controller.session!.id;
    const ids = exerciseIds(controller);
    const add = controller.saveExercise({
      name: 'Fly',
      sets: 3,
      repetitions: 12,
      weightKg: 8,
    });
    const reorder = controller.reorderExercises(routineId, sessionId, [
      ids[2]!,
      ids[0]!,
      ids[1]!,
    ]);
    await add;
    await expect(reorder).rejects.toMatchObject({ code: 'validation' });
    expect(controller.error).toBe(
      'Exercise order must include every exercise exactly once.',
    );
    expect(controller.reorderPending).toBe(false);
    const after = exerciseIds(controller);
    expect(after).toHaveLength(4);
    expect(after.slice(0, 3)).toEqual(ids);
  });

  // FIT-110: a reorder queued behind an edit applies to the latest document
  // and preserves the edited values.
  it('preserves a queued edit through the reordered candidate', async () => {
    const deps = dependencies();
    const controller = await controllerWithExercises(deps);
    const routineId = controller.routine!.id;
    const sessionId = controller.session!.id;
    const ids = exerciseIds(controller);
    controller.openEditor('exercise', ids[0]!);
    const edit = controller.saveExercise({
      name: 'Press Max',
      sets: 4,
      repetitions: 6,
      weightKg: 50,
    });
    const reorder = controller.reorderExercises(routineId, sessionId, [
      ids[2]!,
      ids[0]!,
      ids[1]!,
    ]);
    await Promise.all([edit, reorder]);
    const moved = controller.session!.exercises;
    expect(moved.map((item) => item.id)).toEqual([ids[2], ids[0], ids[1]]);
    expect(moved[1]).toMatchObject({
      id: ids[0],
      name: 'Press Max',
      sets: 4,
      repetitions: 6,
      weightKg: 50,
    });
  });

  it('fails closed on generic and conflict errors, preserving committed state', async () => {
    const deps = dependencies();
    const controller = await controllerWithExercises(deps);
    const routineId = controller.routine!.id;
    const sessionId = controller.session!.id;
    const ids = exerciseIds(controller);
    const documentBefore = controller.document;
    const revisionBefore = controller.revision;
    deps.repository.apply = vi.fn(async () => {
      throw new Error('disk full');
    });
    // FIT-106: a generic failure rejects, publishes nothing, announces, and
    // resets the shared gate.
    await expect(
      controller.reorderExercises(routineId, sessionId, [...ids].reverse()),
    ).rejects.toThrow('disk full');
    expect(controller.document).toBe(documentBefore);
    expect(controller.revision).toBe(revisionBefore);
    expect(controller.reorderPending).toBe(false);
    expect(controller.error).toBe('disk full');
    // FIT-107: a revision conflict fails closed with no automatic retry.
    const { FitnessError, messages } = await import('../fitness/domain/errors');
    deps.repository.apply = vi.fn(async () => {
      throw new FitnessError('storage-conflict', messages.conflict);
    });
    await expect(
      controller.reorderExercises(routineId, sessionId, [...ids].reverse()),
    ).rejects.toMatchObject({ code: 'storage-conflict' });
    expect(deps.repository.apply).toHaveBeenCalledTimes(1);
    expect(controller.document).toBe(documentBefore);
    expect(controller.error).toContain('another tab');
    expect(controller.reorderPending).toBe(false);
  });
});
