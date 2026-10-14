import { describe, expect, it, vi } from 'vitest';
import { FitnessController } from './fitness-controller';
import type { FitnessDependencies } from './dependencies';
import type { FitnessDocumentV2 } from '../fitness/domain/model';

function dependencies(document: FitnessDocumentV2 = { schemaVersion: 2, routines: [] }): FitnessDependencies {
  let current = document;
  return {
    repository: {
      load: vi.fn(async () => ({ document: current, storageRevision: 0, recovered: false })),
      commit: vi.fn(async (_revision, candidate) => { current = candidate; return { storageRevision: 1 }; }),
    },
    ids: { next: (() => { let n = 0; return () => `id-${++n}`; })() },
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
    deps.repository.load = vi.fn(async () => { throw new Error('Fitness data is unavailable.'); });
    const controller = new FitnessController(deps);
    await controller.load();
    expect(controller.status).toBe('unavailable');
    expect(controller.error).toBe('Fitness data is unavailable.');
  });
});
