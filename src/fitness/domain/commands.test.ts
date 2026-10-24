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
} from './commands';
import { FitnessError } from './errors';
import { emptyFitnessDocument, type FitnessDocumentV2 } from './model';
import { aggregateExercises, captureRoutineSnapshot } from './snapshots';
import {
  foldName,
  normalizeName,
  normalizeNotes,
  validateMetrics,
} from './validation';

const ids = (...values: string[]) => ({
  next: vi.fn(() => values.shift() ?? crypto.randomUUID()),
});
const clock = (value = '2026-01-01T00:00:00.000Z') => ({ nowIso: () => value });

function populated(): FitnessDocumentV2 {
  let state = createRoutine(
    emptyFitnessDocument(),
    { name: ' Routine ', notes: ' notes ' },
    ids('r'),
  );
  state = addSession(state, 'r', ' First ', ids('s1'));
  state = addSession(state, 'r', 'Second', ids('s2'));
  state = addExercise(
    state,
    'r',
    's1',
    { name: ' Press ', sets: 3, repetitions: 10, weightKg: 5 },
    ids('e1'),
  );
  return state;
}

describe('domain commands', () => {
  it('normalizes routines and omits blank notes without mutating input', () => {
    const empty = emptyFitnessDocument();
    const result = createRoutine(
      empty,
      { name: ' A ', notes: '   ' },
      ids('r'),
    );
    expect(result.routines[0]).toEqual({
      id: 'r',
      name: 'A',
      sessions: [],
      snapshots: [],
    });
    expect(empty.routines).toEqual([]);
    expect(() => createRoutine(empty, { name: ' ' }, ids('x'))).toThrow(
      'A name is required',
    );
    expect(normalizeNotes(null)).toBeUndefined();
    expect(normalizeName(' x ')).toBe('x');
    expect(foldName(' X ')).toBe('x');
  });

  it('appends unlimited sessions monotonically, renames, and deletes without renumbering', () => {
    let state = populated();
    for (let index = 3; index <= 8; index += 1)
      state = addSession(state, 'r', `S${index}`, ids(`s${index}`));
    expect(state.routines[0]!.sessions).toHaveLength(8);
    state = renameSession(state, 'r', 's2', ' Renamed ');
    expect(state.routines[0]!.sessions[1]).toMatchObject({
      id: 's2',
      name: 'Renamed',
      order: 2,
    });
    state = deleteSession(state, 'r', 's1');
    expect(state.routines[0]!.sessions[0]!.order).toBe(2);
    expect(() =>
      addSession(
        {
          ...state,
          routines: [
            {
              ...state.routines[0]!,
              sessions: [
                {
                  id: 'max',
                  name: 'M',
                  order: Number.MAX_SAFE_INTEGER,
                  exercises: [],
                },
              ],
            },
          ],
        },
        'r',
        'No',
        ids('n'),
      ),
    ).toThrow('exhausted');
  });

  it('creates, edits, isolates, and deletes exercises with stable identity', () => {
    let state = populated();
    state = addExercise(
      state,
      'r',
      's2',
      { name: 'Curl', sets: 4, repetitions: 8, weightKg: 2.5 },
      ids('e2'),
    );
    expect(
      state.routines[0]!.sessions.map((session) =>
        session.exercises.map((exercise) => exercise.id),
      ),
    ).toEqual([['e1'], ['e2']]);
    state = editExercise(state, 'r', 's2', 'e2', {
      name: ' Curl 2 ',
      sets: 5,
      repetitions: 6,
      weightKg: 3,
    });
    state = addExercise(
      state,
      'r',
      's2',
      { name: 'Keep', sets: 1, repetitions: 1, weightKg: 0 },
      ids('e3'),
    );
    expect(state.routines[0]!.sessions[1]!.exercises[0]).toEqual({
      id: 'e2',
      name: 'Curl 2',
      sets: 5,
      repetitions: 6,
      weightKg: 3,
    });
    state = deleteExercise(state, 'r', 's2', 'e2');
    expect(
      state.routines[0]!.sessions[1]!.exercises.map((item) => item.id),
    ).toEqual(['e3']);
  });

  it('preserves unrelated routines and exercises through targeted replacement', () => {
    let state = populated();
    state = createRoutine(state, { name: 'Other' }, ids('r2'));
    state = addExercise(
      state,
      'r',
      's1',
      { name: 'Second', sets: 1, repetitions: 1, weightKg: 0 },
      ids('e2'),
    );
    state = editExercise(state, 'r', 's1', 'e1', {
      name: 'Press changed',
      sets: 4,
      repetitions: 9,
      weightKg: 4,
    });
    expect(state.routines[1]!.name).toBe('Other');
    expect(state.routines[0]!.sessions[0]!.exercises[1]!.id).toBe('e2');
  });

  it.each([
    [
      'routine',
      () => addSession(emptyFitnessDocument(), 'missing', 'S', ids('s')),
      'missing-routine',
    ],
    [
      'session',
      () =>
        addExercise(
          populated(),
          'r',
          'missing',
          { name: 'E', sets: 1, repetitions: 1, weightKg: 0 },
          ids('e'),
        ),
      'missing-session',
    ],
    [
      'exercise edit',
      () =>
        editExercise(populated(), 'r', 's1', 'missing', {
          name: 'E',
          sets: 1,
          repetitions: 1,
          weightKg: 0,
        }),
      'missing-exercise',
    ],
    [
      'exercise delete',
      () => deleteExercise(populated(), 'r', 's1', 'missing'),
      'missing-exercise',
    ],
    [
      'session rename',
      () => renameSession(populated(), 'r', 'missing', 'x'),
      'missing-session',
    ],
    [
      'session delete',
      () => deleteSession(populated(), 'r', 'missing'),
      'missing-session',
    ],
  ])('reports missing %s', (_label, operation, code) => {
    expect(operation).toThrow(FitnessError);
    try {
      operation();
    } catch (error) {
      expect((error as FitnessError).code).toBe(code);
    }
  });

  it.each([
    [0, 1, 0, 'Sets'],
    [1.5, 1, 0, 'Sets'],
    [1, 0, 0, 'Repetitions'],
    [1, 1.5, 0, 'Repetitions'],
    [1, 1, -1, 'Weight'],
    [1, 1, Number.NaN, 'Weight'],
  ])('rejects invalid metrics', (sets, repetitions, weightKg, message) => {
    expect(() => validateMetrics(sets, repetitions, weightKg)).toThrow(message);
  });
});

describe('snapshots', () => {
  it('aggregates by folded name with independent maxima and deterministic order', () => {
    let state = populated();
    state = addExercise(
      state,
      'r',
      's2',
      { name: ' press ', sets: 5, repetitions: 8, weightKg: 10 },
      ids('e2'),
    );
    state = addExercise(
      state,
      'r',
      's1',
      { name: 'Abs', sets: 2, repetitions: 20, weightKg: 0 },
      ids('e3'),
    );
    expect(aggregateExercises(state.routines[0]!)).toEqual([
      {
        name: 'Abs',
        foldedName: 'abs',
        sets: 2,
        repetitions: 20,
        weightKg: 0,
        repetitionsProgress: 'first',
        weightProgress: 'first',
      },
      {
        name: 'Press',
        foldedName: 'press',
        sets: 5,
        repetitions: 10,
        weightKg: 10,
        repetitionsProgress: 'first',
        weightProgress: 'first',
      },
    ]);
  });

  it('sorts already ascending aggregate input', () => {
    let state = createRoutine(
      emptyFitnessDocument(),
      { name: 'Sort' },
      ids('r'),
    );
    state = addSession(state, 'r', 'S', ids('s'));
    state = addExercise(
      state,
      'r',
      's',
      { name: 'A', sets: 1, repetitions: 1, weightKg: 0 },
      ids('a'),
    );
    state = addExercise(
      state,
      'r',
      's',
      { name: 'Z', sets: 1, repetitions: 1, weightKg: 0 },
      ids('z'),
    );
    expect(
      aggregateExercises(state.routines[0]!).map((entry) => entry.name),
    ).toEqual(['A', 'Z']);
  });

  it('classifies independently, permits immediate empty capture, retains two, and copies values', () => {
    let state = populated();
    state = captureSnapshot(state, 'r', ids('p1'), clock());
    state = editExercise(state, 'r', 's1', 'e1', {
      name: 'Press',
      sets: 9,
      repetitions: 12,
      weightKg: 4,
    });
    state = captureSnapshot(state, 'r', ids('p2'), clock());
    expect(state.routines[0]!.snapshots[1]!.entries[0]).toMatchObject({
      repetitionsProgress: 'increased',
      weightProgress: 'decreased',
    });
    state = editExercise(state, 'r', 's1', 'e1', {
      name: 'Press',
      sets: 9,
      repetitions: 12,
      weightKg: 4,
    });
    state = captureSnapshot(state, 'r', ids('p3'), clock());
    expect(state.routines[0]!.snapshots.map((snapshot) => snapshot.id)).toEqual(
      ['p2', 'p3'],
    );
    expect(state.routines[0]!.snapshots[0]!.entries[0]!.repetitions).toBe(12);
    expect(state.routines[0]!.snapshots[1]!.entries[0]).toMatchObject({
      repetitionsProgress: 'same',
      weightProgress: 'same',
    });
    let empty = createRoutine(
      emptyFitnessDocument(),
      { name: 'Empty' },
      ids('empty'),
    );
    empty = captureSnapshot(empty, 'empty', ids('snap'), clock());
    expect(empty.routines[0]!.snapshots[0]!.entries).toEqual([]);
  });

  it('rejects a missing routine at the direct snapshot boundary', () => {
    expect(() =>
      // Deliberately crosses the defensive runtime boundary.
      captureRoutineSnapshot(undefined as never, ids('x'), clock()),
    ).toThrow('routine no longer exists');
  });
});

describe('exercise reordering', () => {
  function withExercises(): FitnessDocumentV2 {
    let state = createRoutine(emptyFitnessDocument(), { name: 'R' }, ids('r'));
    state = addSession(state, 'r', ' Upper ', ids('s1'));
    state = addSession(state, 'r', 'Lower', ids('s2'));
    state = addExercise(
      state,
      'r',
      's1',
      { name: ' Press ', sets: 3, repetitions: 10, weightKg: 40 },
      ids('e1'),
    );
    state = addExercise(
      state,
      'r',
      's1',
      { name: 'Row', sets: 3, repetitions: 12, weightKg: 35 },
      ids('e2'),
    );
    state = addExercise(
      state,
      'r',
      's1',
      { name: 'Curl', sets: 4, repetitions: 8, weightKg: 12 },
      ids('e3'),
    );
    state = addExercise(
      state,
      'r',
      's2',
      { name: 'Squat', sets: 5, repetitions: 5, weightKg: 60 },
      ids('x1'),
    );
    state = createRoutine(state, { name: 'Other' }, ids('r2'));
    state = addSession(state, 'r2', 'Full', ids('t1'));
    state = addExercise(
      state,
      'r2',
      't1',
      { name: 'Plank', sets: 1, repetitions: 1, weightKg: 0 },
      ids('y1'),
    );
    return state;
  }

  function sessionOf(
    state: FitnessDocumentV2,
    routineId: string,
    sessionId: string,
  ) {
    return state.routines
      .find((routine) => routine.id === routineId)!
      .sessions.find((session) => session.id === sessionId)!;
  }

  // FIT-101: a valid permutation commits exactly and replaces only the
  // target exercises array — every other field and parent stays shared.
  it('commits an exact permutation into the target array only', () => {
    const state = withExercises();
    const before = sessionOf(state, 'r', 's1').exercises;
    const result = reorderExercises(state, 'r', 's1', ['e3', 'e1', 'e2']);
    const moved = sessionOf(result, 'r', 's1');
    expect(moved.exercises.map((item) => item.id)).toEqual(['e3', 'e1', 'e2']);
    // The same exercise objects move with every field intact.
    expect(moved.exercises[0]).toBe(before[2]);
    expect(moved.exercises[1]).toBe(before[0]);
    expect(moved.exercises[2]).toBe(before[1]);
    // Other sessions and routines keep their identity and contents.
    expect(sessionOf(result, 'r', 's2')).toBe(sessionOf(state, 'r', 's2'));
    expect(result.routines[1]).toBe(state.routines[1]);
    // The input document is not mutated.
    expect(
      sessionOf(state, 'r', 's1').exercises.map((item) => item.id),
    ).toEqual(['e1', 'e2', 'e3']);
  });

  // FIT-102: malformed permutations — omitted, extra, duplicate, unknown,
  // foreign-session, and empty inputs — reject with 'validation' and write
  // nothing.
  it.each([
    ['omitted', ['e1', 'e2']],
    ['extra', ['e1', 'e2', 'e3', 'e4']],
    ['duplicate', ['e1', 'e2', 'e2']],
    ['unknown', ['e1', 'e2', 'nope']],
    ['foreign', ['e1', 'e2', 'x1']],
    ['empty', []],
  ])('rejects a %s permutation without writing', (_label, exerciseIds) => {
    const state = withExercises();
    const call = () => reorderExercises(state, 'r', 's1', exerciseIds);
    expect(call).toThrow(FitnessError);
    expect(call).toThrow(
      'Exercise order must include every exercise exactly once.',
    );
    try {
      call();
    } catch (error) {
      expect((error as FitnessError).code).toBe('validation');
    }
    expect(
      sessionOf(state, 'r', 's1').exercises.map((item) => item.id),
    ).toEqual(['e1', 'e2', 'e3']);
  });

  // FIT-102: missing routine/session parents reject with the existing
  // missing-* codes before any write; a session from another routine is
  // still missing in the target routine.
  it('reports missing parents before validating the permutation', () => {
    const state = withExercises();
    expect(() =>
      reorderExercises(state, 'missing', 's1', ['e1', 'e2', 'e3']),
    ).toThrow('The routine no longer exists.');
    expect(() =>
      reorderExercises(state, 'r', 'missing', ['e1', 'e2', 'e3']),
    ).toThrow('The training session no longer exists.');
    expect(() =>
      reorderExercises(state, 'r2', 's1', ['e1', 'e2', 'e3']),
    ).toThrow('The training session no longer exists.');
  });

  // FIT-103: identical, singleton, and empty orders return the original
  // document — no write occurs.
  it('returns the original document for identical, empty, and single orders', () => {
    const state = withExercises();
    expect(reorderExercises(state, 'r', 's1', ['e1', 'e2', 'e3'])).toBe(state);
    expect(reorderExercises(state, 'r', 's2', ['x1'])).toBe(state);
    let empty = createRoutine(emptyFitnessDocument(), { name: 'E' }, ids('r'));
    empty = addSession(empty, 'r', 'None', ids('s0'));
    expect(reorderExercises(empty, 'r', 's0', [])).toBe(empty);
  });

  // FIT-103: after a reorder, add appends last, edit preserves position and
  // id, and delete preserves the relative order of what remains.
  it('appends after reorder, preserves position on edit, and order on delete', () => {
    let state = reorderExercises(withExercises(), 'r', 's1', [
      'e3',
      'e1',
      'e2',
    ]);
    state = addExercise(
      state,
      'r',
      's1',
      { name: 'Fly', sets: 3, repetitions: 12, weightKg: 8 },
      ids('e4'),
    );
    expect(
      sessionOf(state, 'r', 's1').exercises.map((item) => item.id),
    ).toEqual(['e3', 'e1', 'e2', 'e4']);
    state = editExercise(state, 'r', 's1', 'e1', {
      name: 'Press Max',
      sets: 4,
      repetitions: 6,
      weightKg: 50,
    });
    const edited = sessionOf(state, 'r', 's1').exercises;
    expect(edited.map((item) => item.id)).toEqual(['e3', 'e1', 'e2', 'e4']);
    expect(edited[1]).toMatchObject({
      id: 'e1',
      name: 'Press Max',
      sets: 4,
      repetitions: 6,
      weightKg: 50,
    });
    state = deleteExercise(state, 'r', 's1', 'e3');
    expect(
      sessionOf(state, 'r', 's1').exercises.map((item) => item.id),
    ).toEqual(['e1', 'e2', 'e4']);
  });

  // FIT-104: same-named exercises resolve by stable id — the correct item
  // moves with its own values, never matched by name.
  it('reorders same-named exercises by stable identity', () => {
    let state = createRoutine(emptyFitnessDocument(), { name: 'R' }, ids('r'));
    state = addSession(state, 'r', 'S', ids('s1'));
    state = addExercise(
      state,
      'r',
      's1',
      { name: 'Press', sets: 3, repetitions: 10, weightKg: 40 },
      ids('p1'),
    );
    state = addExercise(
      state,
      'r',
      's1',
      { name: 'press', sets: 5, repetitions: 5, weightKg: 60 },
      ids('p2'),
    );
    const result = reorderExercises(state, 'r', 's1', ['p2', 'p1']);
    const moved = sessionOf(result, 'r', 's1').exercises;
    expect(moved.map((item) => item.id)).toEqual(['p2', 'p1']);
    expect(moved[0]).toMatchObject({ name: 'press', weightKg: 60 });
    expect(moved[1]).toMatchObject({ name: 'Press', weightKg: 40 });
  });

  // FIT-111: snapshots stay byte-identical and aggregate folded keys,
  // maxima, and classification are unchanged — except the documented
  // first-encounter casing caveat for same-named exercises.
  it('leaves snapshots and aggregate semantics unchanged except casing', () => {
    let state = withExercises();
    state = captureSnapshot(state, 'r', ids('p1'), clock());
    const before = aggregateExercises(state.routines[0]!);
    const result = reorderExercises(state, 'r', 's1', ['e3', 'e1', 'e2']);
    expect(result.routines[0]!.snapshots).toBe(state.routines[0]!.snapshots);
    expect(aggregateExercises(result.routines[0]!)).toEqual(before);

    let dup = createRoutine(emptyFitnessDocument(), { name: 'D' }, ids('r'));
    dup = addSession(dup, 'r', 'S', ids('s1'));
    dup = addExercise(
      dup,
      'r',
      's1',
      { name: 'press', sets: 3, repetitions: 10, weightKg: 40 },
      ids('d1'),
    );
    dup = addExercise(
      dup,
      'r',
      's1',
      { name: 'PRESS', sets: 5, repetitions: 5, weightKg: 60 },
      ids('d2'),
    );
    const firstPass = aggregateExercises(dup.routines[0]!)[0]!;
    const reordered = reorderExercises(dup, 'r', 's1', ['d2', 'd1']);
    const secondPass = aggregateExercises(reordered.routines[0]!)[0]!;
    expect(secondPass.foldedName).toBe(firstPass.foldedName);
    expect(firstPass).toMatchObject({
      name: 'press',
      sets: 5,
      repetitions: 10,
      weightKg: 60,
    });
    expect(secondPass).toMatchObject({
      name: 'PRESS',
      sets: 5,
      repetitions: 10,
      weightKg: 60,
    });
  });
});
