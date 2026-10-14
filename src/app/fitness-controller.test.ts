import { describe, expect, it, vi } from 'vitest';
import { FitnessController } from './fitness-controller';
import type { FitnessDependencies } from './dependencies';
import type { FitnessDocumentV2 } from '../fitness/domain/model';

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
      commit: vi.fn(async (_revision, candidate) => {
        current = candidate;
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

describe('FitnessController', () => {
  it('loads and creates a normalized routine through the repository', async () => {
    const deps = dependencies();
    const controller = new FitnessController(deps);
    await controller.load();
    await controller.saveRoutine('  Legs  ', '  Strength  ');
    expect(controller.routine?.name).toBe('Legs');
    expect(controller.routine?.notes).toBe('Strength');
    expect(deps.repository.commit).toHaveBeenCalledOnce();
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
    const controller = new FitnessController(dependencies());
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
    deps.repository.commit = vi.fn(async () => {
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

  it('supports import success, cancellation, and safe invalid errors', async () => {
    const deps = dependencies();
    const controller = new FitnessController(deps);
    await controller.load();
    await controller.importFile(undefined);
    expect(controller.notice).toBe('');
    await controller.importFile(
      new File(['{"schemaVersion":2,"routines":[]}'], 'fitness.json'),
    );
    expect(controller.notice).toBe('Fitness data imported.');
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

  it('serializes concurrent mutations through the busy guard', async () => {
    const deps = dependencies();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    deps.repository.commit = vi.fn(async (_revision, candidate) => {
      await pending;
      return { storageRevision: 1, candidate };
    });
    const controller = new FitnessController(deps);
    await controller.load();
    const first = controller.saveRoutine('First', '');
    const second = controller.saveRoutine('Second', '');
    release();
    await Promise.all([first, second]);
    expect(deps.repository.commit).toHaveBeenCalledOnce();
    expect(controller.routine?.name).toBe('First');
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
