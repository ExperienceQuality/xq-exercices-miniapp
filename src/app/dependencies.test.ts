import { describe, expect, it } from 'vitest';

import {
  createAutomatedTestNamespace,
  createProductionNamespace,
  createUiTestNamespace,
  resolveFitnessDatabaseName,
} from './dependencies';

describe('Fitness IndexedDB namespace construction (FIT-051)', () => {
  it('uses a stable production name without a resettable run ID', () => {
    expect(resolveFitnessDatabaseName(createProductionNamespace())).toBe(
      'xq-fitness',
    );
  });

  it('isolates automated and UI tests from production and each other', () => {
    const names = new Set([
      resolveFitnessDatabaseName(createProductionNamespace()),
      resolveFitnessDatabaseName(createAutomatedTestNamespace('unit-001')),
      resolveFitnessDatabaseName(createUiTestNamespace('browser-001')),
      resolveFitnessDatabaseName(createUiTestNamespace('browser-002')),
    ]);

    expect([...names]).toEqual([
      'xq-fitness',
      'xq-fitness-automated-test-unit-001',
      'xq-fitness-ui-test-browser-001',
      'xq-fitness-ui-test-browser-002',
    ]);
  });

  it.each([
    '',
    '-leading',
    'trailing-',
    'contains space',
    '../production',
    'a'.repeat(65),
  ])('rejects unsafe run ID %j', (runId) => {
    expect(() => createUiTestNamespace(runId)).toThrow(
      'Test storage run ID is invalid.',
    );
  });

  it.each(['a', 'run_1', 'RUN-20261013', 'a'.repeat(64)])(
    'accepts safe run ID %j',
    (runId) => {
      expect(
        resolveFitnessDatabaseName(createAutomatedTestNamespace(runId)),
      ).toContain(runId);
    },
  );
});
