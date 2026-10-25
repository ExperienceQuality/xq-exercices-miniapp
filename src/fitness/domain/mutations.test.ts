import { describe, expect, it, vi } from 'vitest';
import {
  addExercise,
  addSession,
  captureSnapshot,
  createRoutine,
  deleteExercise,
  deleteSession,
  editExercise,
  renameSession,
  reorderExercises,
  reorderSessions,
} from './commands';
import { FitnessError } from './errors';
import { emptyFitnessDocument, type FitnessDocumentV2 } from './model';
import { applyMutation, type FitnessMutation } from './mutations';

const ids = (...values: string[]) => ({
  next: vi.fn(() => values.shift() ?? crypto.randomUUID()),
});
const clock = (value = '2026-01-01T00:00:00.000Z') => ({ nowIso: () => value });

function populated(): FitnessDocumentV2 {
  let state = createRoutine(
    emptyFitnessDocument(),
    { name: 'Routine' },
    ids('r'),
  ).document;
  state = addSession(state, 'r', 'First', ids('s1')).document;
  state = addSession(state, 'r', 'Second', ids('s2')).document;
  state = addExercise(
    state,
    'r',
    's1',
    { name: 'Press', sets: 3, repetitions: 10, weightKg: 5 },
    ids('e1'),
  ).document;
  state = addExercise(
    state,
    'r',
    's1',
    { name: 'Row', sets: 3, repetitions: 12, weightKg: 6 },
    ids('e2'),
  ).document;
  return state;
}

describe('applyMutation command replay parity', () => {
  // Every domain command returns {document, mutation}: replaying the
  // mutation through the reducer must reproduce the command's document.
  it('replays create-routine identically', () => {
    const before = emptyFitnessDocument();
    const result = createRoutine(
      before,
      { name: ' Legs ', notes: ' notes ' },
      ids('r'),
    );
    expect(result.mutation.kind).toBe('create-routine');
    expect(applyMutation(before, result.mutation)).toEqual(result.document);
    expect(before.routines).toHaveLength(0);
  });

  it('replays add-session identically', () => {
    const before = populated();
    const result = addSession(before, 'r', ' Third ', ids('s3'));
    expect(result.mutation).toMatchObject({
      kind: 'add-session',
      routineId: 'r',
      session: { id: 's3', name: 'Third', order: 3 },
    });
    expect(applyMutation(before, result.mutation)).toEqual(result.document);
  });

  it('replays rename-session identically', () => {
    const before = populated();
    const result = renameSession(before, 'r', 's1', ' Renamed ');
    expect(result.mutation).toEqual({
      kind: 'rename-session',
      routineId: 'r',
      sessionId: 's1',
      name: 'Renamed',
    });
    expect(applyMutation(before, result.mutation)).toEqual(result.document);
  });

  it('replays delete-session identically', () => {
    const before = populated();
    const result = deleteSession(before, 'r', 's1');
    expect(result.mutation).toEqual({
      kind: 'delete-session',
      routineId: 'r',
      sessionId: 's1',
    });
    expect(applyMutation(before, result.mutation)).toEqual(result.document);
  });

  it('replays reorder-sessions identically', () => {
    const before = populated();
    const result = reorderSessions(before, 'r', ['s2', 's1']);
    expect(result.mutation).toEqual({
      kind: 'reorder-sessions',
      routineId: 'r',
      sessionIds: ['s2', 's1'],
    });
    expect(applyMutation(before, result.mutation)).toEqual(result.document);
    expect(
      applyMutation(before, result.mutation)
        .routines[0]!.sessions.map((session) => session.order)
        .sort(),
    ).toEqual([1, 2]);
  });

  it('replays add-exercise identically', () => {
    const before = populated();
    const result = addExercise(
      before,
      'r',
      's2',
      { name: ' Squat ', sets: 5, repetitions: 5, weightKg: 60 },
      ids('e3'),
    );
    expect(result.mutation).toMatchObject({
      kind: 'add-exercise',
      routineId: 'r',
      sessionId: 's2',
      exercise: { id: 'e3', name: 'Squat' },
    });
    expect(applyMutation(before, result.mutation)).toEqual(result.document);
  });

  it('replays update-exercise identically', () => {
    const before = populated();
    const result = editExercise(before, 'r', 's1', 'e1', {
      name: ' Press Max ',
      sets: 4,
      repetitions: 6,
      weightKg: 50,
    });
    expect(result.mutation).toMatchObject({
      kind: 'update-exercise',
      routineId: 'r',
      sessionId: 's1',
      exercise: { id: 'e1', name: 'Press Max' },
    });
    expect(applyMutation(before, result.mutation)).toEqual(result.document);
  });

  it('replays delete-exercise identically', () => {
    const before = populated();
    const result = deleteExercise(before, 'r', 's1', 'e1');
    expect(result.mutation).toEqual({
      kind: 'delete-exercise',
      routineId: 'r',
      sessionId: 's1',
      exerciseId: 'e1',
    });
    expect(applyMutation(before, result.mutation)).toEqual(result.document);
  });

  it('replays reorder-exercises identically', () => {
    const before = populated();
    const result = reorderExercises(before, 'r', 's1', ['e2', 'e1']);
    expect(result.mutation).toEqual({
      kind: 'reorder-exercises',
      routineId: 'r',
      sessionId: 's1',
      exerciseIds: ['e2', 'e1'],
    });
    expect(applyMutation(before, result.mutation)).toEqual(result.document);
    expect(
      applyMutation(
        before,
        result.mutation,
      ).routines[0]!.sessions[0]!.exercises.map((item) => item.id),
    ).toEqual(['e2', 'e1']);
  });

  it('replays capture-snapshot identically without regenerating ids or time', () => {
    const before = populated();
    const result = captureSnapshot(before, 'r', ids('snap-1'), clock());
    expect(result.mutation.kind).toBe('capture-snapshot');
    const replayed = applyMutation(before, result.mutation);
    expect(replayed).toEqual(result.document);
    // Replay consumes the materialized snapshot verbatim — a second replay
    // of the same mutation produces the same stored value.
    expect(applyMutation(before, result.mutation)).toEqual(replayed);
    const snapshot = replayed.routines[0]!.snapshots.at(-1)!;
    expect(snapshot.id).toBe('snap-1');
    expect(snapshot.capturedAt).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('applyMutation reducer behavior', () => {
  it('replace-document returns the payload verbatim', () => {
    const before = populated();
    const replacement = emptyFitnessDocument();
    const mutation: FitnessMutation = {
      kind: 'replace-document',
      document: replacement,
    };
    expect(applyMutation(before, mutation)).toBe(replacement);
  });

  it('does not mutate the input document', () => {
    const before = populated();
    const snapshot = JSON.parse(JSON.stringify(before));
    applyMutation(before, {
      kind: 'add-session',
      routineId: 'r',
      session: { id: 's9', name: 'Ninth', order: 9, exercises: [] },
    });
    applyMutation(before, {
      kind: 'reorder-exercises',
      routineId: 'r',
      sessionId: 's1',
      exerciseIds: ['e2', 'e1'],
    });
    expect(before).toEqual(snapshot);
  });

  it('returns the same document for no-op session and exercise reorders', () => {
    const before = populated();
    expect(
      applyMutation(before, {
        kind: 'reorder-sessions',
        routineId: 'r',
        sessionIds: ['s1', 's2'],
      }),
    ).toBe(before);
    expect(
      applyMutation(before, {
        kind: 'reorder-exercises',
        routineId: 'r',
        sessionId: 's1',
        exerciseIds: ['e1', 'e2'],
      }),
    ).toBe(before);
  });

  it.each<[string, FitnessMutation, string]>([
    [
      'add-session',
      {
        kind: 'add-session',
        routineId: 'missing',
        session: { id: 's', name: 'S', order: 1, exercises: [] },
      },
      'missing-routine',
    ],
    [
      'rename-session',
      {
        kind: 'rename-session',
        routineId: 'r',
        sessionId: 'missing',
        name: 'X',
      },
      'missing-session',
    ],
    [
      'delete-session',
      { kind: 'delete-session', routineId: 'r', sessionId: 'missing' },
      'missing-session',
    ],
    [
      'reorder-sessions',
      {
        kind: 'reorder-sessions',
        routineId: 'missing',
        sessionIds: ['s1', 's2'],
      },
      'missing-routine',
    ],
    [
      'add-exercise',
      {
        kind: 'add-exercise',
        routineId: 'r',
        sessionId: 'missing',
        exercise: {
          id: 'e',
          name: 'E',
          sets: 1,
          repetitions: 1,
          weightKg: 0,
        },
      },
      'missing-session',
    ],
    [
      'update-exercise',
      {
        kind: 'update-exercise',
        routineId: 'r',
        sessionId: 's1',
        exercise: {
          id: 'missing',
          name: 'E',
          sets: 1,
          repetitions: 1,
          weightKg: 0,
        },
      },
      'missing-exercise',
    ],
    [
      'delete-exercise',
      {
        kind: 'delete-exercise',
        routineId: 'r',
        sessionId: 's1',
        exerciseId: 'missing',
      },
      'missing-exercise',
    ],
    [
      'reorder-exercises',
      {
        kind: 'reorder-exercises',
        routineId: 'r',
        sessionId: 'missing',
        exerciseIds: ['e1', 'e2'],
      },
      'missing-session',
    ],
    [
      'capture-snapshot',
      {
        kind: 'capture-snapshot',
        routineId: 'missing',
        snapshot: {
          id: 'snap',
          capturedAt: '2026-01-01T00:00:00.000Z',
          entries: [],
        },
      },
      'missing-routine',
    ],
  ])('fails closed on missing targets for %s', (_label, mutation, code) => {
    const before = populated();
    expect(() => applyMutation(before, mutation)).toThrow(FitnessError);
    try {
      applyMutation(before, mutation);
    } catch (error) {
      expect((error as FitnessError).code).toBe(code);
    }
  });

  it.each([
    ['duplicate', ['s1', 's1']],
    ['omitted', ['s1']],
    ['extra', ['s1', 's2', 's3']],
    ['unknown', ['s1', 'nope']],
    ['foreign', ['s1', 'foreign-session']],
    ['empty', []],
  ])(
    'rejects a %s session permutation without changing the document',
    (_label, sessionIds) => {
      const before = populated();
      const call = () =>
        applyMutation(before, {
          kind: 'reorder-sessions',
          routineId: 'r',
          sessionIds,
        });
      expect(call).toThrow(FitnessError);
      try {
        call();
      } catch (error) {
        expect((error as FitnessError).code).toBe('validation');
      }
      expect(
        [...before.routines[0]!.sessions]
          .sort((left, right) => left.order - right.order)
          .map((session) => session.id),
      ).toEqual(['s1', 's2']);
    },
  );

  it.each([
    ['duplicate', ['e1', 'e1']],
    ['omitted', ['e1']],
    ['extra', ['e1', 'e2', 'e3']],
    ['unknown', ['e1', 'nope']],
    ['foreign', ['e1', 'foreign-exercise']],
    ['empty', []],
  ])(
    'rejects a %s exercise permutation without changing the document',
    (_label, exerciseIds) => {
      const before = populated();
      const call = () =>
        applyMutation(before, {
          kind: 'reorder-exercises',
          routineId: 'r',
          sessionId: 's1',
          exerciseIds,
        });
      expect(call).toThrow(FitnessError);
      try {
        call();
      } catch (error) {
        expect((error as FitnessError).code).toBe('validation');
      }
      expect(
        before.routines[0]!.sessions[0]!.exercises.map((item) => item.id),
      ).toEqual(['e1', 'e2']);
    },
  );

  it('retains only the last two snapshots on replayed captures', () => {
    let state = populated();
    for (const id of ['snap-1', 'snap-2', 'snap-3']) {
      state = applyMutation(state, {
        kind: 'capture-snapshot',
        routineId: 'r',
        snapshot: {
          id,
          capturedAt: '2026-01-01T00:00:00.000Z',
          entries: [],
        },
      });
    }
    expect(state.routines[0]!.snapshots.map((entry) => entry.id)).toEqual([
      'snap-2',
      'snap-3',
    ]);
  });
});
